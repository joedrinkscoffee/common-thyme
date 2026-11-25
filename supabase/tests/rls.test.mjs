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
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb, email text, created_at timestamptz not null default now());
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
// Signed in with Google, but not invited.
const NEWCOMER = "00000000-0000-0000-0000-00000000000d";
const FRIEND = "00000000-0000-0000-0000-00000000000e";

// One in-memory database at a time: close the last one before starting the next.
let previous = null;

const migrations = () => readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

async function setup() {
  await previous?.close();
  const db = new PGlite();
  previous = db;
  await db.exec(SUPABASE_STUBS);
  for (const file of migrations()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  await db.exec(`insert into auth.users (id, raw_user_meta_data, email) values
    ('${JOE}', '{"full_name":"Joe"}', 'joe@example.com'), ('${PARTNER}', '{"name":"Partner"}', 'partner@example.com'),
    ('${STRANGER}', '{}', 'stranger@example.com'), ('${NEWCOMER}', '{}', 'New.Comer@Example.com'), ('${FRIEND}', '{}', 'friend@example.com')`);
  // Joe runs the app; the "stranger" is another invited household.
  await db.exec(`insert into public.app_access (email, via) values ('joe@example.com', 'existing'), ('stranger@example.com', 'existing');
    insert into public.app_owners (user_id) values ('${JOE}')`);
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

test("save_recipe saves a whole recipe at once and refuses stale or foreign edits", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  const [recipe] = await as(
    JOE,
    `insert into public.recipes (household_id, title) values ('${household}', 'Carrot Salad') returning id, updated_at`,
  );
  const [carrot] = await as(JOE, `insert into public.ingredients (household_id, name, perishable) values ('${household}', 'carrot', true) returning id`);
  const edit = (title, ingredients) =>
    JSON.stringify({
      title,
      base_servings: 4,
      total_minutes: 20,
      tags: ["salad", "quick"],
      source_url: "",
      ingredients,
      steps: [{ title: "Mix", body: "Toss it all together." }, { title: "", body: "Serve." }],
    }).replace(/'/g, "''");
  const lines = [
    { quantity: 1, unit: "each", name: "Carrots", prep: "shredded", raw_text: "1 carrot, shredded" },
    { quantity: 2, unit: "tbsp", name: "lemon juice", prep: null, raw_text: "2 tbsp lemon juice" },
  ];

  const [{ updated }] = await as(
    JOE,
    `select public.save_recipe('${recipe.id}', '${recipe.updated_at.toISOString()}', '${edit("Shredded Carrot Salad", [{ ...lines[0], ingredient_id: carrot.id }, lines[1]])}') as updated`,
  );
  const [saved] = await as(JOE, `select title, base_servings, tags, source_url, updated_at from public.recipes`);
  assert.equal(saved.title, "Shredded Carrot Salad");
  assert.equal(saved.base_servings, 4);
  assert.deepEqual(saved.tags, ["salad", "quick"]);
  assert.equal(saved.source_url, null);
  assert.equal(saved.updated_at.getTime(), updated.getTime());

  const rows = await as(
    JOE,
    `select ri.position, ri.name, ri.prep, ri.unit, ri.quantity::float as quantity, i.name as ingredient
     from public.recipe_ingredients ri left join public.ingredients i on i.id = ri.ingredient_id order by position`,
  );
  assert.deepEqual(rows.map((r) => [r.name, r.prep, r.ingredient]), [
    ["Carrots", "shredded", "carrot"],
    ["lemon juice", null, "lemon juice"],
  ]);
  const steps = await as(JOE, `select position, title, body from public.recipe_steps order by position`);
  assert.deepEqual(steps.map((s) => s.title), ["Mix", null]);

  // A second save with the old timestamp is refused, and nothing changes.
  await assert.rejects(
    as(JOE, `select public.save_recipe('${recipe.id}', '${recipe.updated_at.toISOString()}', '${edit("Stale", [])}')`),
    /recipe_changed/,
  );
  assert.equal((await as(JOE, `select title from public.recipes`))[0].title, "Shredded Carrot Salad");
  assert.equal((await as(JOE, `select count(*)::int as n from public.recipe_ingredients`))[0].n, 2);

  // Someone outside the household can't see it, so they can't save it either.
  await assert.rejects(
    as(STRANGER, `select public.save_recipe('${recipe.id}', null, '${edit("Mine now", [])}')`),
    /recipe_not_found/,
  );

  // An ingredient from another household is never linked.
  const [{ id: other }] = await as(STRANGER, `select public.create_household('Other') as id`);
  const [theirs] = await as(STRANGER, `insert into public.ingredients (household_id, name) values ('${other}', 'secret') returning id`);
  await as(JOE, `select public.save_recipe('${recipe.id}', null, '${edit("Salad", [{ ...lines[1], name: null, ingredient_id: theirs.id }])}')`);
  assert.equal((await as(JOE, `select ingredient_id from public.recipe_ingredients`))[0].ingredient_id, null);
});

test("recipe source links must be web links", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await assert.rejects(
    as(JOE, `insert into public.recipes (household_id, title, source_url) values ('${household}', 'x', 'javascript:alert(1)')`),
    /recipes_source_url_http/,
  );
});

test("a deleted recipe stays in past plans and can be restored", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  const [recipe] = await as(JOE, `insert into public.recipes (household_id, title) values ('${household}', 'Tacos') returning id`);
  const [plan] = await as(JOE, `insert into public.meal_plans (household_id, week_start) values ('${household}', '2026-11-16') returning id`);
  await as(
    JOE,
    `insert into public.planned_dinners (plan_id, household_id, recipe_id, date, servings) values ('${plan.id}', '${household}', '${recipe.id}', '2026-11-18', 2)`,
  );
  await as(JOE, `update public.recipes set archived_at = now() where id = '${recipe.id}'`);
  assert.equal((await as(JOE, `select count(*)::int as n from public.recipes where archived_at is null`))[0].n, 0);
  const [dinner] = await as(JOE, `select r.title from public.planned_dinners d join public.recipes r on r.id = d.recipe_id`);
  assert.equal(dinner.title, "Tacos");
  await as(JOE, `update public.recipes set archived_at = null where id = '${recipe.id}'`);
  assert.equal((await as(JOE, `select count(*)::int as n from public.recipes where archived_at is null`))[0].n, 1);
});

test("check-in columns exist, and only the server can see reminder email records", async () => {
  const { db, as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  const [{ id: recipe }] = await as(JOE, `insert into public.recipes (household_id, title) values ('${household}', 'Piccata') returning id`);
  const [{ id: plan }] = await as(JOE, `insert into public.meal_plans (household_id, week_start) values ('${household}', '2026-11-23') returning id`);
  const [dinner] = await as(
    JOE,
    `insert into public.planned_dinners (plan_id, household_id, recipe_id, date, servings, status, cooked_at, cooked_by)
     values ('${plan}', '${household}', '${recipe}', '2026-11-24', 2, 'cooked', now(), '${JOE}') returning push_count`,
  );
  assert.equal(dinner.push_count, 0);
  await as(JOE, `update public.profiles set timezone = 'America/Chicago' where id = '${JOE}'`);

  await db.exec(`reset role; insert into public.check_in_emails (household_id, user_id, kind, week_start, sent)
    values ('${household}', '${JOE}', 'thursday', '2026-11-23', true)`);
  await assert.rejects(as(JOE, "select * from public.check_in_emails"));
  await assert.rejects(
    db.exec(`reset role; insert into public.check_in_emails (household_id, user_id, kind, week_start, sent)
      values ('${household}', '${JOE}', 'thursday', '2026-11-23', true)`),
  );
});

test("a household's calendar link is private to its members", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await as(JOE, `insert into public.household_calendars (household_id, ics_url) values ('${household}', 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics')`);
  assert.equal((await as(JOE, "select count(*)::int as n from public.household_calendars"))[0].n, 1);
  assert.equal((await as(STRANGER, "select count(*)::int as n from public.household_calendars"))[0].n, 0);
  await assert.rejects(
    as(STRANGER, `update public.household_calendars set ics_url = 'https://evil.example/x.ics' returning 1`).then((r) => {
      if (!r.length) throw new Error("row-level security hid it");
    }),
    /row-level security/,
  );
  await assert.rejects(as(JOE, `update public.household_calendars set ics_url = 'http://x'`), /check constraint/);
});

test("planned meals default to dinner and only take breakfast, lunch or dinner", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  const [recipe] = await as(JOE, `insert into public.recipes (household_id, title) values ('${household}', 'Tacos') returning id`);
  const [plan] = await as(JOE, `insert into public.meal_plans (household_id, week_start) values ('${household}', '2026-11-30') returning id`);
  const add = (meal) =>
    as(JOE, `insert into public.planned_dinners (plan_id, household_id, recipe_id, date, servings${meal ? ", meal" : ""})
      values ('${plan.id}', '${household}', '${recipe.id}', '2026-12-05', 2${meal ? `, '${meal}'` : ""}) returning meal`);
  assert.equal((await add(null))[0].meal, "dinner");
  assert.equal((await add("lunch"))[0].meal, "lunch");
  await assert.rejects(add("brunch"), /check constraint/);
});

test("a household's grocery check marks are shared by its members and private to them", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await as(JOE, `insert into public.grocery_items (household_id, week_start, item_key, checked_at) values ('${household}', '2026-11-30', 'scallion', now())`);
  await as(JOE, `insert into public.grocery_items (household_id, week_start, item_key, label) values ('${household}', '2026-11-30', 'extra:paper-towel', 'paper towels')`);
  await assert.rejects(
    as(JOE, `insert into public.grocery_items (household_id, week_start, item_key) values ('${household}', '2026-11-30', 'scallion')`),
    /duplicate key/,
  );
  assert.equal((await as(JOE, "select count(*)::int as n from public.grocery_items"))[0].n, 2);
  assert.equal((await as(STRANGER, "select count(*)::int as n from public.grocery_items"))[0].n, 0);
  await assert.rejects(
    as(STRANGER, `insert into public.grocery_items (household_id, week_start, item_key) values ('${household}', '2026-11-30', 'x')`),
    /row-level security/,
  );
  await as(JOE, `insert into public.ingredients (household_id, name, aisle) values ('${household}', 'garlic', 'produce')`);
  await assert.rejects(as(JOE, `insert into public.ingredients (household_id, name, aisle) values ('${household}', 'salt', 'aisle 9')`), /check constraint/);
});

test("grocery items can be marked as on hand or needed", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await as(JOE, `insert into public.grocery_items (household_id, week_start, item_key, status) values ('${household}', '2026-11-30', 'soy sauce', 'have')`);
  await as(JOE, `insert into public.grocery_items (household_id, week_start, item_key) values ('${household}', '2026-11-30', 'jasmine rice')`);
  const rows = await as(JOE, "select item_key, status from public.grocery_items order by item_key");
  assert.deepEqual(rows, [{ item_key: "jasmine rice", status: null }, { item_key: "soy sauce", status: "have" }]);
  await assert.rejects(as(JOE, `update public.grocery_items set status = 'maybe'`), /check constraint/);
});

test("people who aren't invited can sign in but can't make a household", async () => {
  const { as } = await setup();
  assert.equal((await as(NEWCOMER, "select public.my_app_access() as a"))[0].a, null);
  assert.equal((await as(JOE, "select public.my_app_access() as a"))[0].a, "owner");
  assert.equal((await as(STRANGER, "select public.my_app_access() as a"))[0].a, "allowed");
  await assert.rejects(as(NEWCOMER, `select public.create_household('Mine')`), /invite_only/);
  await assert.rejects(as(NEWCOMER, `insert into public.app_access (email, via) values ('new.comer@example.com', 'link')`), /permission denied/);
  assert.equal((await as(NEWCOMER, "select count(*)::int as n from public.app_access"))[0].n, 0);
});

test("an invite link lets new people in until it runs out, expires or is revoked", async () => {
  const { as } = await setup();
  const [link] = await as(JOE, `insert into public.access_links (label, max_uses) values ('Book club', 1) returning code, length(code) as len`);
  assert.equal(link.len, 24);

  // Already in: doesn't use up the link.
  assert.equal((await as(STRANGER, `select public.redeem_access_link('${link.code}') as r`))[0].r, "already");
  assert.equal((await as(NEWCOMER, `select public.redeem_access_link('${link.code}') as r`))[0].r, "added");
  assert.equal((await as(NEWCOMER, "select public.my_app_access() as a"))[0].a, "allowed");
  await as(NEWCOMER, `select public.create_household('Mine')`);
  // Matched on the lowercased Google email.
  const [row] = await as(JOE, "select email, via, use_count from public.app_access join public.access_links l on l.id = link_id");
  assert.deepEqual(row, { email: "new.comer@example.com", via: "link", use_count: 1 });

  // Single-use: the next person is turned away.
  await assert.rejects(as(FRIEND, `select public.redeem_access_link('${link.code}')`), /invite_link_invalid/);
  const [open] = await as(JOE, `insert into public.access_links (max_uses) values (5) returning id, code`);
  await as(JOE, `update public.access_links set revoked_at = now() where id = '${open.id}'`);
  await assert.rejects(as(FRIEND, `select public.redeem_access_link('${open.code}')`), /invite_link_invalid/);
  const [old] = await as(JOE, `insert into public.access_links (expires_at) values (now() - interval '1 minute') returning code`);
  await assert.rejects(as(FRIEND, `select public.redeem_access_link('${old.code}')`), /invite_link_invalid/);
  await assert.rejects(as(FRIEND, `select public.redeem_access_link('nope')`), /invite_link_invalid/);
});

test("only the owner sees and manages invite links and the access list", async () => {
  const { as } = await setup();
  await as(JOE, `insert into public.access_links (label) values ('x')`);
  assert.equal((await as(STRANGER, "select count(*)::int as n from public.access_links"))[0].n, 0);
  assert.equal((await as(STRANGER, "select count(*)::int as n from public.app_access"))[0].n, 0);
  assert.equal((await as(JOE, "select count(*)::int as n from public.app_access"))[0].n, 2);
  await assert.rejects(as(STRANGER, `insert into public.access_links (label) values ('mine')`), /row-level security/);
  await assert.rejects(as(NEWCOMER, "select * from public.app_owners"), /permission denied/);
  // The owner can't lock themselves out.
  await as(JOE, "delete from public.app_access where email = 'joe@example.com'");
  assert.equal((await as(JOE, "select public.my_app_access() as a"))[0].a, "owner");
});

test("a partner invite lets someone new in, and taking access away closes the household", async () => {
  const { as } = await setup();
  const [{ id: household }] = await as(JOE, `select public.create_household('Home') as id`);
  await as(JOE, `insert into public.recipes (household_id, title) values ('${household}', 'Tacos')`);
  const [{ token }] = await as(JOE, `insert into public.household_invites (household_id) values ('${household}') returning token`);
  await as(NEWCOMER, `select public.accept_household_invite('${token}')`);
  assert.equal((await as(NEWCOMER, "select public.my_app_access() as a"))[0].a, "allowed");
  assert.equal((await as(NEWCOMER, "select count(*)::int as n from public.recipes"))[0].n, 1);

  await as(JOE, "delete from public.app_access where email = 'new.comer@example.com'");
  assert.equal((await as(NEWCOMER, "select count(*)::int as n from public.recipes"))[0].n, 0);
  assert.equal((await as(NEWCOMER, "select count(*)::int as n from public.households"))[0].n, 0);
  assert.equal((await as(JOE, "select count(*)::int as n from public.recipes"))[0].n, 1);
});

test("everyone already signed up keeps access, and the first one is the owner", async () => {
  await previous?.close();
  const db = new PGlite();
  previous = db;
  await db.exec(SUPABASE_STUBS);
  const files = migrations();
  const gate = files.findIndex((f) => f.endsWith("_invite_only.sql"));
  for (const file of files.slice(0, gate)) await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  await db.exec(`insert into auth.users (id, raw_user_meta_data, email, created_at) values
    ('${PARTNER}', '{}', 'Partner@Example.com', '2026-11-20 12:00'), ('${JOE}', '{}', 'joe@example.com', '2026-11-20 09:00')`);
  for (const file of files.slice(gate)) await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  const { rows: list } = await db.query("select email, via from public.app_access order by email");
  assert.deepEqual(list, [{ email: "joe@example.com", via: "existing" }, { email: "partner@example.com", via: "existing" }]);
  const { rows: owners } = await db.query("select user_id from public.app_owners");
  assert.deepEqual(owners, [{ user_id: JOE }]);
});

test("meals and ingredient lines can't point at another household's rows", async () => {
  const { as } = await setup();
  const [{ id: mine }] = await as(JOE, `select public.create_household('Home') as id`);
  const [{ id: theirs }] = await as(STRANGER, `select public.create_household('Other') as id`);
  const [myRecipe] = await as(JOE, `insert into public.recipes (household_id, title) values ('${mine}', 'Tacos') returning id`);
  const [myPlan] = await as(JOE, `insert into public.meal_plans (household_id, week_start) values ('${mine}', '2026-11-30') returning id`);
  const [theirRecipe] = await as(STRANGER, `insert into public.recipes (household_id, title) values ('${theirs}', 'Secret stew') returning id`);
  const [theirPlan] = await as(STRANGER, `insert into public.meal_plans (household_id, week_start) values ('${theirs}', '2026-11-30') returning id`);
  const [theirIngredient] = await as(STRANGER, `insert into public.ingredients (household_id, name) values ('${theirs}', 'saffron') returning id`);
  const dinner = (plan, recipe) =>
    `insert into public.planned_dinners (plan_id, household_id, recipe_id, date, servings) values ('${plan}', '${mine}', '${recipe}', '2026-12-01', 2) returning id`;

  await assert.rejects(as(JOE, dinner(myPlan.id, theirRecipe.id)), /other_household/);
  await assert.rejects(as(JOE, dinner(theirPlan.id, myRecipe.id)), /other_household/);
  const [ok] = await as(JOE, dinner(myPlan.id, myRecipe.id));
  await assert.rejects(as(JOE, `update public.planned_dinners set recipe_id = '${theirRecipe.id}' where id = '${ok.id}'`), /other_household/);
  // Updates that don't touch the links still work.
  await as(JOE, `update public.planned_dinners set status = 'cooked' where id = '${ok.id}'`);

  await assert.rejects(
    as(JOE, `insert into public.recipe_ingredients (recipe_id, ingredient_id, position, raw_text) values ('${myRecipe.id}', '${theirIngredient.id}', 0, 'a pinch')`),
    /other_household/,
  );
  await as(JOE, `insert into public.recipe_ingredients (recipe_id, ingredient_id, position, raw_text) values ('${myRecipe.id}', null, 0, 'salt')`);
  // The other household can still erase its recipe.
  await as(STRANGER, `delete from public.recipes where id = '${theirRecipe.id}'`);
});
