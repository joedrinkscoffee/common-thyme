-- Admin panel. Replaces "the first account ever made is the owner" with an
-- explicit admin flag: a row in app_admins. Admins see the Admin page (invite
-- links, the access list, households and Chef usage) and set the daily Chef
-- limit. Admin rows are added by hand in the SQL Editor; nobody can add one
-- through the app or the API.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Whoever ran the app before this keeps running it.
do $$
begin
  if to_regclass('public.app_owners') is not null then
    insert into public.app_admins (user_id) select user_id from public.app_owners on conflict do nothing;
  end if;
end $$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

-- What the app shows the signed-in person: 'admin', 'allowed', or null (the
-- invite-only page).
create or replace function public.my_app_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_app_admin() and public.has_app_access() then 'admin'
    when public.has_app_access() then 'allowed'
  end;
$$;

revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- Invite links and the access list: admins instead of the owner.
drop policy if exists "owner reads access list" on public.app_access;
drop policy if exists "owner removes access" on public.app_access;
drop policy if exists "owner manages invite links" on public.access_links;

drop policy if exists "admins read access list" on public.app_access;
create policy "admins read access list" on public.app_access
  for select to authenticated using (public.is_app_admin());
-- An admin can take someone off the list, but not themselves.
drop policy if exists "admins remove access" on public.app_access;
create policy "admins remove access" on public.app_access
  for delete to authenticated using (public.is_app_admin() and email <> public.my_email());

drop policy if exists "admins manage invite links" on public.access_links;
create policy "admins manage invite links" on public.access_links
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop function if exists public.is_app_owner();
drop table if exists public.app_owners;

-- ---------------------------------------------------------------------------
-- App-wide settings: one row.
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  -- Messages one household can send Chef in 24 hours.
  chef_daily_limit smallint not null default 80 check (chef_daily_limit between 1 and 1000),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select, update (chef_daily_limit, updated_at) on public.app_settings to authenticated;

-- Chef reads the limit for everyone; only admins change it.
drop policy if exists "signed-in people read app settings" on public.app_settings;
create policy "signed-in people read app settings" on public.app_settings
  for select to authenticated using (true);
drop policy if exists "admins change app settings" on public.app_settings;
create policy "admins change app settings" on public.app_settings
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- What admins see about each household: people, counts and dates only. No
-- recipe titles, meals, notes or Chef conversation.
-- ---------------------------------------------------------------------------

create or replace function public.admin_households()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  members jsonb,
  recipes int,
  meals_planned int,
  chef_today int,
  chef_week int,
  chef_month int,
  usage_month jsonb,
  last_active timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    h.id,
    h.name,
    h.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.display_name,
        'email', lower(u.email),
        'joined_at', m.joined_at,
        'last_sign_in_at', u.last_sign_in_at
      ) order by m.joined_at)
      from public.household_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.household_id = h.id
    ), '[]'::jsonb),
    (select count(*)::int from public.recipes r where r.household_id = h.id and r.archived_at is null),
    (select count(*)::int from public.planned_dinners d where d.household_id = h.id and d.status <> 'moved'),
    (select count(*)::int from public.chef_messages c where c.household_id = h.id and c.role = 'user' and c.created_at > now() - interval '24 hours'),
    (select count(*)::int from public.chef_messages c where c.household_id = h.id and c.role = 'user' and c.created_at > now() - interval '7 days'),
    (select count(*)::int from public.chef_messages c where c.household_id = h.id and c.role = 'user' and c.created_at > now() - interval '30 days'),
    (
      select jsonb_build_object(
        'input', coalesce(sum((c.payload->'usage'->>'input')::bigint), 0),
        'cacheRead', coalesce(sum((c.payload->'usage'->>'cacheRead')::bigint), 0),
        'cacheWrite', coalesce(sum((c.payload->'usage'->>'cacheWrite')::bigint), 0),
        'output', coalesce(sum((c.payload->'usage'->>'output')::bigint), 0)
      )
      from public.chef_messages c
      where c.household_id = h.id and c.role = 'chef' and c.created_at > now() - interval '30 days'
        and jsonb_typeof(c.payload->'usage') = 'object'
    ),
    greatest(
      (select max(c.created_at) from public.chef_messages c where c.household_id = h.id and c.role = 'user'),
      (select max(u.last_sign_in_at) from public.household_members m join auth.users u on u.id = m.user_id where m.household_id = h.id)
    )
  from public.households h
  where public.is_app_admin()
  order by h.created_at;
$$;

revoke execute on function public.admin_households() from public, anon;
grant execute on function public.admin_households() to authenticated;
