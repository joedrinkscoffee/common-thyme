-- "Already have it" on the grocery list: each item can be marked as on hand
-- (off the shopping list) or needed (a pantry item they're out of).
-- Null means nobody has said yet.
alter table public.grocery_items
  add column if not exists status text
  check (status in ('have', 'need'));
