-- Check-ins: a Cooked mark on each week's dinner, rollover of dinners that
-- weren't cooked, and the Thursday / Sunday reminder emails.

-- Each planned dinner belongs to one week's plan, so marking it cooked counts
-- only for that week. Cooking the same recipe again later is a new row.
alter table public.planned_dinners
  add column if not exists cooked_at timestamptz,
  add column if not exists cooked_by uuid references auth.users (id) on delete set null,
  -- How many times this dinner has been pushed to a later week. After two
  -- pushes it goes back to the recipe library instead of rolling again.
  add column if not exists push_count smallint not null default 0 check (push_count between 0 and 10);

-- Each person's own time zone, taken from their browser, so reminder emails
-- arrive at 7 PM and 9 AM where they are. Null means "use the household's".
alter table public.profiles
  add column if not exists timezone text check (timezone is null or char_length(timezone) between 1 and 64);

-- One row per person per reminder per week, so an hourly job sends each
-- reminder at most once. Only the server (secret key) reads or writes it.
create table if not exists public.check_in_emails (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('thursday', 'sunday')),
  week_start date not null,
  -- False when the reminder was due but every dinner was already marked.
  sent boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, week_start)
);

alter table public.check_in_emails enable row level security;
revoke all on public.check_in_emails from anon, authenticated;
