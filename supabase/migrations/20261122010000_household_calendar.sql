-- A household's private calendar link (an iCal "secret address"), so Chef
-- can see busy evenings and travel when it plans. One per household.
-- The link itself grants read access to that calendar, so only members of
-- the household can read or change it.
create table if not exists public.household_calendars (
  household_id uuid primary key references public.households (id) on delete cascade,
  ics_url text not null check (ics_url like 'https://%' and char_length(ics_url) <= 2000),
  -- When Chef last read it, and why the last read failed (null when it worked).
  last_read_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.household_calendars enable row level security;

drop policy if exists "members manage calendar" on public.household_calendars;
create policy "members manage calendar" on public.household_calendars
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.household_calendars to authenticated;
