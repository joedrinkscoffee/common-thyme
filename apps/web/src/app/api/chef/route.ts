import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/household";
import { chefDailyLimit } from "@/lib/admin";
import { PHOTO_TYPES } from "@/lib/recipe-photo";
import { runChef, type HistoryItem } from "@/lib/chef/agent";
import { ChefSession, type Attachment } from "@/lib/chef/session";
import { chefConnected, chefContext, loadCalendarNights, loadMessages, saveMessage } from "@/lib/chef/server";
import type { ChefTurnResponse } from "@/lib/chef/home";

// A Chef turn with several tool steps can take a while.
export const maxDuration = 300;

const MAX_TEXT = 4000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;


const json = (body: ChefTurnResponse, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  // Only this site's own pages may ask Chef for things.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json({ ok: false, error: "Not allowed." }, 403);

  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return json({ ok: false, error: "Sign in first." }, 401);
  if (!chefConnected()) {
    return json({ ok: false, error: "I'm not hooked up yet. Once the Anthropic key is added in Vercel, I can plan and change your week." }, 503);
  }

  let body: { text?: unknown; image?: { data?: unknown; type?: unknown } | null };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Couldn't read that message." }, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  let attachment: Attachment | null = null;
  if (body.image && typeof body.image.data === "string" && typeof body.image.type === "string") {
    if (!(PHOTO_TYPES as readonly string[]).includes(body.image.type)) return json({ ok: false, error: "Send a JPEG, PNG or WebP photo." }, 400);
    const bytes = Uint8Array.from(Buffer.from(body.image.data, "base64"));
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return json({ ok: false, error: "That photo is too big." }, 400);
    attachment = { bytes, contentType: body.image.type };
  }
  if (!text && !attachment) return json({ ok: false, error: "Say something first." }, 400);

  const household = viewer.household;
  const { db, store, today, settings } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household });

  // A ceiling on what one household can spend in a day. Admins set it.
  const [{ count }, dailyLimit] = await Promise.all([
    db
      .from("chef_messages")
      .select("id", { count: "exact", head: true })
      .eq("household_id", household.id)
      .eq("role", "user")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    chefDailyLimit(),
  ]);
  if ((count ?? 0) >= dailyLimit) return json({ ok: false, error: "That's a lot of chat for one day. Let's pick this up tomorrow." }, 429);

  const earlier = await loadMessages(db, household.id, { limit: 16 });
  const history: HistoryItem[] = earlier.map((m) => ({ role: m.role, author: m.author, body: m.body }));
  await saveMessage(db, household.id, { role: "user", authorId: viewer.userId, body: text || "(sent a photo)", payload: attachment ? { photo: true } : null });

  const session = new ChefSession(store, today, attachment);
  const client = new Anthropic();
  try {
    [session.calendar] = await Promise.all([loadCalendarNights(db, household.id, settings.timezone, today), session.load()]);
    const reply = await runChef({
      call: (params) => client.beta.messages.create(params),
      session,
      history,
      author: viewer.firstName ?? "Someone",
      text,
      partnerJoined: household.memberCount > 1,
    });
    const payload = { choice: reply.choice, changes: reply.changes, grocery: reply.grocery, usage: reply.usage };
    const id = await saveMessage(db, household.id, { role: "chef", authorId: null, body: reply.text, payload });
    return json({
      ok: true,
      changed: reply.changes.length > 0,
      reply: { id: id ?? crypto.randomUUID(), role: "chef", author: null, body: reply.text, choice: reply.choice, changes: reply.changes, grocery: reply.grocery, at: new Date().toISOString() },
    });
  } catch (e) {
    const changed = session.changes.length > 0;
    let error = "Something went wrong on my end. Try again in a minute?";
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      error = "My Anthropic key isn't working. Check ANTHROPIC_API_KEY in Vercel.";
    } else if (e instanceof Anthropic.RateLimitError) {
      error = "I'm being rate limited, or the monthly spending cap was reached. Try again later, or raise the cap in the Anthropic Console.";
    } else if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) {
      error = "Claude is busy right now. Try again in a minute?";
    }
    console.error("chef turn failed", e);
    if (changed) error += ` (I'd already made some changes: ${session.changes.join("; ")}.)`;
    return json({ ok: false, error }, 502);
  }
}
