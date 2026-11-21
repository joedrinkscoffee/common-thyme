-- Recipe editing: ingredient lines split into parts, and one call that saves
-- a whole edited recipe atomically.

-- The base ingredient as written on this line ("carrot") and its prep and size
-- words ("shredded"). Matching across recipes uses the base ingredient only.
alter table public.recipe_ingredients
  add column name text check (char_length(name) between 1 and 120),
  add column prep text check (char_length(prep) <= 200);

alter table public.recipes
  add constraint recipes_source_url_http check (source_url is null or source_url ~* '^https?://');

-- Keep updated_at honest on every change, so two people editing at once can tell.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recipes_touch_updated_at
  before update on public.recipes
  for each row execute function public.touch_updated_at();

-- Saves an edited recipe: its fields, ingredient lines and steps, all or nothing.
-- Runs as the caller, so row-level security still decides who can do this.
-- expected_updated_at is the value the editor loaded; if someone saved since,
-- this raises 'recipe_changed' instead of overwriting their edit.
-- Lines with a name but no ingredient_id are matched to the household's
-- ingredients by name, and a new household ingredient is created if none fits.
create function public.save_recipe(recipe_id uuid, expected_updated_at timestamptz, recipe jsonb)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_household uuid;
  v_updated timestamptz;
  v_line jsonb;
  v_step jsonb;
  v_ingredient uuid;
  v_name text;
  v_position smallint := 0;
begin
  select r.household_id, r.updated_at into v_household, v_updated
  from public.recipes r
  where r.id = save_recipe.recipe_id
  for update;
  if not found then
    raise exception 'recipe_not_found';
  end if;
  if expected_updated_at is not null and v_updated <> expected_updated_at then
    raise exception 'recipe_changed';
  end if;

  update public.recipes r set
    title = recipe->>'title',
    source_url = nullif(recipe->>'source_url', ''),
    total_minutes = (recipe->>'total_minutes')::smallint,
    base_servings = (recipe->>'base_servings')::smallint,
    kid_friendly = coalesce((recipe->>'kid_friendly')::boolean, false),
    tags = coalesce(array(select jsonb_array_elements_text(recipe->'tags')), '{}'),
    notes = nullif(recipe->>'notes', ''),
    steps_reconstructed = coalesce((recipe->>'steps_reconstructed')::boolean, r.steps_reconstructed)
  where r.id = save_recipe.recipe_id
  returning r.updated_at into v_updated;

  delete from public.recipe_ingredients ri where ri.recipe_id = save_recipe.recipe_id;
  for v_line in select * from jsonb_array_elements(coalesce(recipe->'ingredients', '[]'::jsonb)) loop
    v_ingredient := null;
    v_name := nullif(btrim(v_line->>'name'), '');
    if nullif(v_line->>'ingredient_id', '') is not null then
      select i.id into v_ingredient
      from public.ingredients i
      where i.id = (v_line->>'ingredient_id')::uuid and i.household_id = v_household;
    end if;
    if v_ingredient is null and v_name is not null then
      select i.id into v_ingredient
      from public.ingredients i
      where i.household_id = v_household and lower(i.name) = lower(v_name);
      if v_ingredient is null then
        insert into public.ingredients (household_id, name)
        values (v_household, v_name)
        returning id into v_ingredient;
      end if;
    end if;
    insert into public.recipe_ingredients (recipe_id, ingredient_id, position, quantity, unit, name, prep, raw_text)
    values (
      save_recipe.recipe_id,
      v_ingredient,
      v_position,
      (v_line->>'quantity')::numeric,
      nullif(v_line->>'unit', ''),
      v_name,
      nullif(btrim(v_line->>'prep'), ''),
      v_line->>'raw_text'
    );
    v_position := v_position + 1;
  end loop;

  v_position := 0;
  delete from public.recipe_steps rs where rs.recipe_id = save_recipe.recipe_id;
  for v_step in select * from jsonb_array_elements(coalesce(recipe->'steps', '[]'::jsonb)) loop
    insert into public.recipe_steps (recipe_id, position, title, body)
    values (save_recipe.recipe_id, v_position, nullif(btrim(v_step->>'title'), ''), v_step->>'body');
    v_position := v_position + 1;
  end loop;

  return v_updated;
end;
$$;

revoke execute on function public.save_recipe(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, timestamptz, jsonb) to authenticated;
revoke execute on function public.touch_updated_at() from public, anon;
