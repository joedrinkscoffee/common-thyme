-- Kid friendly becomes a regular recipe tag instead of its own column.
-- Safe to run more than once.

-- 1. Copy the old flag into tags, unless the recipe already has that tag.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recipes' and column_name = 'kid_friendly'
  ) then
    update public.recipes r
    set tags = array_append(r.tags, 'kid friendly')
    where r.kid_friendly
      and not exists (select 1 from unnest(r.tags) t where lower(t) = 'kid friendly');
  end if;
end;
$$;

-- 2. save_recipe no longer writes the flag.
create or replace function public.save_recipe(recipe_id uuid, expected_updated_at timestamptz, recipe jsonb)
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

-- 3. Drop the old column.
alter table public.recipes drop column if exists kid_friendly;
