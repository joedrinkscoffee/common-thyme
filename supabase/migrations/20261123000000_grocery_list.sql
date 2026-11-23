-- Grocery list: built from each week's planned meals, so the only things
-- saved are what someone checked off and what they added by hand
-- ("paper towels"). Both partners see the same list and check marks.
create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null, -- the Monday of the week
  -- The ingredient's match key ("scallion"), or "extra:<slug>" for one added by hand.
  item_key text not null check (char_length(item_key) between 1 and 120),
  -- Only for items added by hand.
  label text check (char_length(label) between 1 and 120),
  aisle text,
  checked_at timestamptz,
  checked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, week_start, item_key)
);

create index if not exists grocery_items_household_week_idx on public.grocery_items (household_id, week_start);

alter table public.grocery_items enable row level security;

drop policy if exists "members manage grocery items" on public.grocery_items;
create policy "members manage grocery items" on public.grocery_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.grocery_items to authenticated;

-- Where the household finds an ingredient in the store, when they've moved it
-- from the app's guess ("we never have garlic, put it in produce").
-- "staples" means always on hand. Null means use the guess from the name.
alter table public.ingredients
  add column if not exists aisle text
  check (aisle in ('produce', 'bakery', 'meat', 'cheese', 'dairy', 'pantry', 'grains', 'international', 'baking', 'nuts', 'frozen', 'drinks', 'other', 'staples'));
