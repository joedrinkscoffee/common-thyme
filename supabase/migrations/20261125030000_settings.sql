-- Settings page: per-person check-in email switches, managing household
-- members, and deleting your own account.

-- Each person can turn either weekly check-in email off. On by default.
alter table public.profiles
  add column if not exists checkin_thursday boolean not null default true,
  add column if not exists checkin_sunday boolean not null default true;

-- The household's owner takes someone else out of the household. Their own
-- account stays; they can start a new household or be invited again.
create or replace function public.remove_household_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if member_id = auth.uid() then
    raise exception 'use leave_household to leave';
  end if;
  select m.household_id into hid
    from public.household_members m
    where m.user_id = auth.uid() and m.role = 'owner' and public.is_household_member(m.household_id)
      and exists (select 1 from public.household_members t where t.household_id = m.household_id and t.user_id = member_id)
    limit 1;
  if hid is null then
    raise exception 'only the household owner can remove someone';
  end if;
  delete from public.household_members where household_id = hid and user_id = member_id;
end;
$$;

-- Leave your household while someone else stays in it. If you were the
-- owner, the person who joined earliest becomes the owner. The household's
-- recipes and plans stay with them.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mine public.household_members;
  heir uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into mine from public.household_members where user_id = auth.uid() order by joined_at limit 1;
  if not found then
    return;
  end if;
  select user_id into heir from public.household_members
    where household_id = mine.household_id and user_id <> auth.uid()
    order by joined_at limit 1;
  if heir is null then
    raise exception 'last_member';
  end if;
  if mine.role = 'owner' then
    update public.household_members set role = 'owner' where household_id = mine.household_id and user_id = heir;
  end if;
  delete from public.household_members where household_id = mine.household_id and user_id = auth.uid();
end;
$$;

-- Deletes the signed-in person's account for good.
-- * Someone else in the household: they keep the household, its recipes,
--   plans and chat. If you were the owner, they become the owner.
-- * Nobody else: the household and everything in it is deleted.
-- Your email comes off the invite list. Admins can't delete themselves here
-- (so the app always has one); remove the admin row in the SQL Editor first.
-- Recipe photos are files, not rows: the app removes them first.
create or replace function public.delete_my_account()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_email text := public.my_email();
  hid uuid;
  heir uuid;
  outcome text := 'no_household';
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.app_admins where user_id = me) then
    raise exception 'admin_cannot_delete';
  end if;

  for hid in select household_id from public.household_members where user_id = me loop
    select user_id into heir from public.household_members
      where household_id = hid and user_id <> me
      order by joined_at limit 1;
    if heir is null then
      delete from public.households where id = hid; -- cascades to recipes, plans, chat, settings
      outcome := 'household_deleted';
    else
      update public.household_members set role = 'owner'
        where household_id = hid and user_id = heir
          and exists (select 1 from public.household_members o where o.household_id = hid and o.user_id = me and o.role = 'owner');
      outcome := 'household_kept';
    end if;
  end loop;

  if v_email is not null then
    delete from public.app_access where email = v_email;
  end if;
  delete from auth.users where id = me; -- cascades to profile, memberships, invites they made
  return outcome;
end;
$$;

revoke execute on function public.remove_household_member(uuid) from public, anon;
revoke execute on function public.leave_household() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.remove_household_member(uuid) to authenticated;
grant execute on function public.leave_household() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
