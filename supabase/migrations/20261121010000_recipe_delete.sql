-- Deleting a recipe hides it instead of erasing it: planned dinners keep
-- pointing at it, and Undo can bring it back. Lists and Chef skip recipes
-- where archived_at is set.
alter table public.recipes add column if not exists archived_at timestamptz;

create index if not exists recipes_household_active_idx
  on public.recipes (household_id) where archived_at is null;
