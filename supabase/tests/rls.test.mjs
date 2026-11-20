// Runs the migrations in an in-memory Postgres (PGlite) with small stand-ins
// for Supabase's auth and storage schemas, then checks household isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const SUPABASE_STUBS = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;

const JOE = "00000000-0000-0000-0000-00000000000a";
const PARTNER = "00000000-0000-0000-0000-00000000000b";
const STRANGER = "00000000-0000-0000-0000-00000000000c";

async function setup() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  await db.exec(`insert into auth.users values
    ('${JOE}', '{"full_name":"Joe"}'), ('${PARTNER}', '{"name":"Partner"}'), ('${STRANGER}', '{}')`);
  const as = async (uid, sql) => {
    await db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
    return (await db.query(sql)).rows;
  };
  return { db, as };
}

test("households are private until you accept an invite, and invites work once", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await as(JOE, `insert into public.recipes (household_id, title) values ('${household}', 'Feta & Olive Pizza')`);
  const [{ token }] = await as(JOE, `insert into public.household_invites (household_id) values ('${household}') returning token`);

  assert.equal((await as(PARTNER, "select count(*)::int as n from public.recipes"))[0].n, 0);
  assert.equal((await as(STRANGER, "select count(*)::int as n from public.households"))[0].n, 0);

  await as(PARTNER, `select public.accept_household_invite('${token}')`);
  assert.equal((await as(PARTNER, "select count(*)::int as n from public.recipes"))[0].n, 1);

  await assert.rejects(as(STRANGER, `select public.accept_household_invite('${token}')`), /invalid or expired/);
});

test("non-members cannot write into a household", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await assert.rejects(
    as(STRANGER, `insert into public.recipes (household_id, title) values ('${household}', 'x')`),
    /row-level security/,
  );
});

test("new households get default settings and new users get a profile", async () => {
  const { as } = await setup();
  await as(JOE, `select public.create_household('Home')`);
  const [settings] = await as(JOE, "select dinners_per_week, base_servings, kids_extra_servings from public.household_settings");
  assert.deepEqual(settings, { dinners_per_week: 5, base_servings: 2, kids_extra_servings: 2 });
  const [profile] = await as(JOE, "select display_name from public.profiles");
  assert.equal(profile.display_name, "Joe");
});
