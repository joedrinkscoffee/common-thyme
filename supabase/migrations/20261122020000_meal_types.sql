-- Meal types: a planned meal can be breakfast, lunch or dinner, and a day can
-- have more than one. Every meal planned so far is a dinner.
alter table public.planned_dinners
  add column if not exists meal text not null default 'dinner'
  check (meal in ('breakfast', 'lunch', 'dinner'));


create index if not exists planned_dinners_household_date_meal_idx
  on public.planned_dinners (household_id, date, meal);
