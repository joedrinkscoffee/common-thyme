import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/household";
import { readSentPhoto } from "@/lib/sent-photo";
import { sameOrigin } from "@/lib/request-origin";
import { chefConnected, chefContext } from "@/lib/chef/server";
import { fetchRecipePage } from "@/lib/chef/fetch-page";
import { listTags } from "@/lib/recipes";
import { addFromLink, addFromPhoto, type IntakeResult, type PhotoInput } from "@/lib/recipe-intake";

// Reading a long page or a photo can take a little while.
export const maxDuration = 120;

// A ceiling on new recipes per household per day, which also caps what Claude can cost.
const DAILY_RECIPES = 200;

export type AddRecipeResponse = IntakeResult;

const json = (body: AddRecipeResponse, status = 200) => Response.json(body, { status });
const fail = (error: string, status = 400) => json({ status: "failed", error }, status);

/** Adds one recipe from a link or a photo. The Add recipes page calls this once per item. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Not allowed.", 403);

  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return fail("Sign in first.", 401);

  let body: { url?: unknown; image?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Couldn't read that.");
  }

  const sent = readSentPhoto(body.image);
  if (sent && "error" in sent) return fail(sent.error);
  const photo: PhotoInput | null = sent;
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 2000) : "";
  if (!photo && !url) return fail("Send a link or a photo.");
  if (!chefConnected()) return fail("Recipe reading isn't switched on yet.", 503);

  const household = viewer.household;
  const { db, store } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household });
  const { count } = await db
    .from("recipes")
    .select("id", { count: "exact", head: true })
    .eq("household_id", household.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= DAILY_RECIPES) return fail(`That's ${DAILY_RECIPES} recipes today. Add the rest tomorrow.`, 429);

  const client = new Anthropic();
  const deps = {
    store,
    call: (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => client.beta.messages.create(params),
    fetchPage: fetchRecipePage,
    tags: await listTags(household.id),
  };
  const result = photo ? await addFromPhoto(deps, photo) : await addFromLink(deps, url);
  return json(result);
}
