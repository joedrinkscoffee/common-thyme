-- A row may only point at rows from its own household. Row-level security
-- already hides other households' data, but foreign keys don't check
-- households, so without this a crafted insert could point a meal at another
-- household's recipe (which would then block that recipe from being erased).

create or replace function public.check_planned_dinner_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.meal_plans p where p.id = new.plan_id and p.household_id = new.household_id) then
    raise exception 'other_household' using detail = 'plan_id';
  end if;
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id and r.household_id = new.household_id) then
    raise exception 'other_household' using detail = 'recipe_id';
  end if;
  if new.moved_to is not null
     and not exists (select 1 from public.planned_dinners d where d.id = new.moved_to and d.household_id = new.household_id) then
    raise exception 'other_household' using detail = 'moved_to';
  end if;
  return new;
end;
$$;

drop trigger if exists planned_dinners_same_household on public.planned_dinners;
create trigger planned_dinners_same_household
  before insert or update of plan_id, recipe_id, moved_to, household_id on public.planned_dinners
  for each row execute function public.check_planned_dinner_household();

create or replace function public.check_recipe_ingredient_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ingredient_id is not null and not exists (
    select 1
    from public.recipes r
    join public.ingredients i on i.household_id = r.household_id
    where r.id = new.recipe_id and i.id = new.ingredient_id
  ) then
    raise exception 'other_household' using detail = 'ingredient_id';
  end if;
  return new;
end;
$$;

drop trigger if exists recipe_ingredients_same_household on public.recipe_ingredients;
create trigger recipe_ingredients_same_household
  before insert or update of recipe_id, ingredient_id on public.recipe_ingredients
  for each row execute function public.check_recipe_ingredient_household();

revoke execute on function public.check_planned_dinner_household() from public, anon, authenticated;
revoke execute on function public.check_recipe_ingredient_household() from public, anon, authenticated;
