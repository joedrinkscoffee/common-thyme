# Common Thyme

A dinner planner for one household. **Chef**, a Claude-powered agent, drafts
the week every Sunday around ingredients that carry across nights, checks in
on whether dinners actually got cooked, and reschedules them so nothing
fresh goes to waste.

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | The Next.js web app (Vercel) |
| `supabase/migrations` | Database schema, row-level security, storage bucket |
| `supabase/tests` | Checks that households can only see their own data |

Everything belongs to a **household**. One person signs in with Google,
creates the household, and invites their partner with a one-time link.

## Chef

Chef lives in `apps/web/src/lib/chef`:

| File | What it does |
| --- | --- |
| `planner.ts` | The overlap engine: picks a week of recipes that share perishables, in code |
| `session.ts` | Chef's tools (plan a week, move, swap, check in, lock in, add a recipe, remember) |
| `agent.ts` | The Claude tool loop for one chat message |
| `brief.ts` | Chef's note at the top of the home page, written in code (no API call) |
| `recipe-page.ts` | Reads a recipe page's schema.org data when Chef is given a link |

Chef runs on the Messages API with the household's own `ANTHROPIC_API_KEY`
(adaptive thinking at low effort, prompt caching, server-side refusal
fallback). Each chat message is one request to `POST /api/chef`. Opening the
app costs nothing; only messages to Chef call Claude, and a household is
capped at 80 messages a day.

### Check-ins and reminder emails

Every planned dinner can be marked **Cooked** (or skipped, moved later in the
week, or pushed to next week) from its tile, from Chef's check-in, or from a
one-tap link in an email; each answer has an Undo. `lib/chef/check-in.ts`
holds the rules. A mark belongs to that week's dinner, so cooking the recipe
again later counts separately.

Supabase Cron calls `GET /api/cron/check-ins` every hour with
`Authorization: Bearer $CRON_SECRET`. For each household member it works out
their local time (saved from their browser) and sends, once per week:

- **Thursday 7 PM**: dinners Monday to Thursday nobody marked. Not sent if all are marked.
- **Sunday 9 AM**: the week's unmarked dinners, before Chef plans the next week. Not sent if all are marked.

When Chef plans a week, dinners from the week before that are still unmarked
roll in first, on the earliest nights, with the ones whose fresh ingredients
were likely bought already going first. A dinner pushed twice goes back to
the recipe library instead. Emails go out through Resend's API.

## Running it locally

Needs Node 22 and pnpm 10.

```sh
pnpm install
cp .env.example apps/web/.env.local   # fill in values
pnpm dev                               # http://localhost:3000
```

Checks (the same ones CI runs):

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Database

The schema lives in `supabase/migrations`. To apply it to the hosted project
with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

## Deploying

On Vercel, import this repository and set **Root Directory** to `apps/web`,
then add the variables from `.env.example`.
