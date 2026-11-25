-- Invite-only sign-up. Anyone can sign in with Google, but only people whose
-- email is on the access list can create or see a household (and so use Chef).
-- People get on the list three ways:
--   * they were already using the app when this ran ('existing'),
--   * they signed in through an invite link the app's owner made ('link'),
--   * they joined a household through a partner invite ('household').

-- Who may use the app, by Google email (always stored lowercase).
create table if not exists public.app_access (
  email text primary key check (email = lower(email) and char_length(email) between 3 and 320),
  via text not null check (via in ('existing', 'link', 'household')),
  link_id uuid,
  created_at timestamptz not null default now()
);

-- Who runs the app and can make invite links. Not visible through the API;
-- is_app_owner() answers for the caller.
create table if not exists public.app_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Invite links: commonthyme.app/join/<code>. Each works for max_uses people
-- (a use is a new person getting access) until it expires or is revoked.
create table if not exists public.access_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  label text check (label is null or char_length(label) between 1 and 80),
  max_uses smallint not null default 1 check (max_uses between 1 and 100),
  use_count smallint not null default 0 check (use_count >= 0),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_access_link_id_fkey') then
    alter table public.app_access
      add constraint app_access_link_id_fkey foreign key (link_id) references public.access_links (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Checks, for row-level security and the app
-- ---------------------------------------------------------------------------

-- The signed-in person's Google email, lowercase.
create or replace function public.my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;

create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_access a where a.email = public.my_email());
$$;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_owners o where o.user_id = auth.uid());
$$;

-- What the app shows the signed-in person: 'owner', 'allowed', or null (the
-- invite-only page). One call per page.
create or replace function public.my_app_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_app_owner() and public.has_app_access() then 'owner'
    when public.has_app_access() then 'allowed'
  end;
$$;

-- Every household table's row-level security goes through this, so taking
-- someone off the access list also closes their household data and Chef.
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_access() and exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- Creating a household needs access.
create or replace function public.create_household(household_name text)
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
  if not public.has_app_access() then
    raise exception 'invite_only';
  end if;
  insert into public.households (name) values (household_name) returning id into new_id;
  insert into public.household_members (household_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into public.household_settings (household_id) values (new_id);
  return new_id;
end;
$$;

-- A partner invite still works for someone new, and it puts them on the list.
create or replace function public.accept_household_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.household_invites;
  v_email text := public.my_email();
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
  if v_email is not null then
    insert into public.app_access (email, via) values (v_email, 'household') on conflict do nothing;
  end if;
  return inv.household_id;
end;
$$;

-- Signing in through an invite link. Returns 'added', or 'already' when the
-- person had access (which doesn't use up the link).
create or replace function public.redeem_access_link(link_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.access_links;
  v_email text := public.my_email();
begin
  if auth.uid() is null or v_email is null then
    raise exception 'not signed in';
  end if;
  if public.has_app_access() then
    return 'already';
  end if;
  select * into link from public.access_links l
    where l.code = link_code
      and l.revoked_at is null
      and l.expires_at > now()
      and l.use_count < l.max_uses
    for update;
  if not found then
    raise exception 'invite_link_invalid';
  end if;
  insert into public.app_access (email, via, link_id) values (v_email, 'link', link.id) on conflict do nothing;
  update public.access_links set use_count = use_count + 1 where id = link.id;
  return 'added';
end;
$$;

revoke execute on function public.my_email() from public, anon;
revoke execute on function public.has_app_access() from public, anon;
revoke execute on function public.is_app_owner() from public, anon;
revoke execute on function public.my_app_access() from public, anon;
revoke execute on function public.redeem_access_link(text) from public, anon;
grant execute on function public.my_email() to authenticated;
grant execute on function public.has_app_access() to authenticated;
grant execute on function public.is_app_owner() to authenticated;
grant execute on function public.my_app_access() to authenticated;
grant execute on function public.redeem_access_link(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security: only the owner manages links and the list. Nobody adds
-- themselves to the list except through the functions above.
-- ---------------------------------------------------------------------------

alter table public.app_access enable row level security;
alter table public.app_owners enable row level security;
alter table public.access_links enable row level security;

revoke all on public.app_access from anon, authenticated;
revoke all on public.app_owners from anon, authenticated;
revoke all on public.access_links from anon, authenticated;
grant select, delete on public.app_access to authenticated;
grant select, insert, update on public.access_links to authenticated;

drop policy if exists "owner reads access list" on public.app_access;
create policy "owner reads access list" on public.app_access
  for select to authenticated using (public.is_app_owner());
-- The owner can take someone off the list, but not themselves.
drop policy if exists "owner removes access" on public.app_access;
create policy "owner removes access" on public.app_access
  for delete to authenticated using (public.is_app_owner() and email <> public.my_email());

drop policy if exists "owner manages invite links" on public.access_links;
create policy "owner manages invite links" on public.access_links
  for all to authenticated
  using (public.is_app_owner())
  with check (public.is_app_owner());

-- ---------------------------------------------------------------------------
-- Keep everyone who already uses the app, and make the first person who ever
-- signed in the owner.
-- ---------------------------------------------------------------------------

insert into public.app_access (email, via)
  select lower(u.email), 'existing' from auth.users u where u.email is not null
  on conflict do nothing;

insert into public.app_owners (user_id)
  select u.id from auth.users u order by u.created_at limit 1
  on conflict do nothing;
