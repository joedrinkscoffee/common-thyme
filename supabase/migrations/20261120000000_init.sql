-- Common Thyme: initial schema.
-- Everything belongs to a household. Row-level security lets a signed-in user
-- see and change only the rows of households they are a member of.

-- ---------------------------------------------------------------------------
-- Households and people
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'member');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

-- How Chef plans for this household.
create table public.household_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  timezone text not null default 'America/New_York',
  draft_weekday smallint not null default 0 check (draft_weekday between 0 and 6), -- 0 = Sunday
  draft_hour smallint not null default 9 check (draft_hour between 0 and 23),
  dinners_per_week smallint not null default 5 check (dinners_per_week between 1 and 7),
  base_servings smallint not null default 2 check (base_servings between 1 and 12),
  kids_extra_servings smallint not null default 2 check (kids_extra_servings between 0 and 12),
  no_repeat_weeks smallint not null default 3 check (no_repeat_weeks between 0 and 12),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create type public.recipe_origin as enum ('airtable', 'recime', 'link', 'manual');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_url text,
  photo_path text, -- object path in the recipe-photos bucket
  total_minutes smallint check (total_minutes > 0),
  base_servings smallint not null default 2 check (base_servings between 1 and 24),
  kid_friendly boolean not null default false,
  tags text[] not null default '{}',
  -- True when the original page was gone and the steps were rebuilt.
  steps_reconstructed boolean not null default false,
  origin public.recipe_origin not null default 'manual',
  origin_ref text, -- id in the source system, so imports can be re-run safely
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, origin, origin_ref)
);

create index recipes_household_idx on public.recipes (household_id);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- Perishables are what Chef tries to share across nights.
  perishable boolean not null default false,
  shelf_life_days smallint check (shelf_life_days > 0)
);

create unique index ingredients_household_name_idx
  on public.ingredients (household_id, lower(name));

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  position smallint not null,
  quantity numeric(8, 2),
  unit text,
  raw_text text not null, -- the line as written, e.g. "1 tbsp capers, rinsed"
  unique (recipe_id, position)
);

create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

create table public.recipe_steps (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position smallint not null,
  title text,
  body text not null,
  primary key (recipe_id, position)
);

-- ---------------------------------------------------------------------------
-- Weekly plans
-- ---------------------------------------------------------------------------

create type public.plan_status as enum ('draft', 'approved');
create type public.dinner_status as enum ('planned', 'cooked', 'skipped', 'moved');

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_start date not null, -- the Monday of the week
  status public.plan_status not null default 'draft',
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table public.planned_dinners (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete restrict,
  date date not null,
  -- The household picks how many dinners a week the kids share.
  shared_with_kids boolean not null default false,
  servings smallint not null check (servings between 1 and 24),
  status public.dinner_status not null default 'planned',
  -- When a dinner is rescheduled or pushed to a later week, the old row is
  -- marked 'moved' and points at its replacement.
  moved_to uuid references public.planned_dinners (id) on delete set null,
  created_at timestamptz not null default now()
);

create index planned_dinners_household_date_idx on public.planned_dinners (household_id, date);
create index planned_dinners_plan_idx on public.planned_dinners (plan_id);

-- ---------------------------------------------------------------------------
-- Chef: conversation and what it knows
-- ---------------------------------------------------------------------------

create type public.note_source as enum ('you_said', 'learned');
create type public.note_category as enum ('household', 'tastes', 'habits');

create table public.chef_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  source public.note_source not null,
  category public.note_category not null,
  body text not null check (char_length(body) between 1 and 500),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index chef_notes_household_idx on public.chef_notes (household_id) where active;

create type public.chef_role as enum ('chef', 'user');

create table public.chef_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  role public.chef_role not null,
  author_id uuid references auth.users (id) on delete set null, -- null for Chef
  body text not null,
  -- Structured extras: a question with choices, a changed dinner, etc.
  payload jsonb,
  created_at timestamptz not null default now()
);

create index chef_messages_household_created_idx on public.chef_messages (household_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Membership helpers
-- ---------------------------------------------------------------------------

create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- Creates a household with the caller as owner, plus default settings.
create function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.households (name) values (household_name) returning id into new_id;
  insert into public.household_members (household_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into public.household_settings (household_id) values (new_id);
  return new_id;
end;
$$;

-- Joins the household behind an invite token. Each invite works once.
create function public.accept_household_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invites;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into inv from public.household_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
    for update;
  if not found then
    raise exception 'invite is invalid or expired';
  end if;
  insert into public.household_members (household_id, user_id, role)
    values (inv.household_id, auth.uid(), 'member')
    on conflict do nothing;
  update public.household_invites
    set accepted_by = auth.uid(), accepted_at = now()
    where id = inv.id;
  return inv.household_id;
end;
$$;

revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.accept_household_invite(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;

-- A profile row for every new sign-in, filled from the Google account.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_settings enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.meal_plans enable row level security;
alter table public.planned_dinners enable row level security;
alter table public.chef_notes enable row level security;
alter table public.chef_messages enable row level security;

-- Households: members can read and rename. Creating goes through create_household().
create policy "members read household" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "members rename household" on public.households
  for update to authenticated using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- Profiles: you see yourself and the people you share a household with.
create policy "read own and co-member profiles" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1
      from public.household_members mine
      join public.household_members theirs on theirs.household_id = mine.household_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Members: visible to the household. Joining goes through the functions above.
create policy "members read members" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "leave a household" on public.household_members
  for delete to authenticated using (user_id = auth.uid());

-- Invites: members create, read and revoke their household's invites.
create policy "members manage invites" on public.household_invites
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Every table keyed by household_id gets the same rule.
create policy "members manage settings" on public.household_settings
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members manage recipes" on public.recipes
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members manage ingredients" on public.ingredients
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members manage plans" on public.meal_plans
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members manage dinners" on public.planned_dinners
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members manage chef notes" on public.chef_notes
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy "members manage chef messages" on public.chef_messages
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Recipe children follow their recipe.
create policy "members manage recipe ingredients" on public.recipe_ingredients
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_household_member(r.household_id)))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_household_member(r.household_id)));
create policy "members manage recipe steps" on public.recipe_steps
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_household_member(r.household_id)))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_household_member(r.household_id)));

-- ---------------------------------------------------------------------------
-- Recipe photos: private bucket, one folder per household
-- (object path: <household_id>/<recipe_id>.<ext>)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

create policy "members read recipe photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "members add recipe photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "members replace recipe photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "members remove recipe photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos' and public.is_household_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- API access. Signed-in users reach these tables through the Data API;
-- the policies above decide which rows. Anonymous visitors get nothing.
-- (Explicit so this works whether or not the project auto-grants new tables.)
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on function public.is_household_member(uuid) to authenticated;
