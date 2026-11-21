/**
 * Chef's turn: one message in, one reply out, with as many tool calls in
 * between as it needs. Runs on the Messages API with the household's own
 * Anthropic key; the tools act on the household through ChefSession.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { CHEF_SYSTEM, CHEF_TOOLS, catalogText } from "./prompt";
import type { ChefSession, Choice, ToolOutcome } from "./session";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.BetaMessage;
/** Sends one request to Claude. Injected so tests can script the replies. */
export type CallModel = (params: Params) => Promise<Message>;

export const CHEF_MODEL = process.env.CHEF_MODEL || "claude-opus-5-5";
const MAX_STEPS = 12;

export type HistoryItem = { role: "user" | "chef"; author: string | null; body: string };

export type ChefReply = {
  text: string;
  choice: Choice | null;
  changes: string[];
  addedRecipes: { id: string; title: string }[];
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number; calls: number };
};

/** Earlier chat as plain text turns; the latest state always comes in fresh. */
export function historyMessages(history: HistoryItem[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of history) {
    const role = h.role === "chef" ? "assistant" : "user";
    const text = h.role === "user" ? `${h.author ?? "Someone"}: ${h.body}` : h.body;
    if (!out.length && role === "assistant") continue; // must start with a person
    const last = out.at(-1);
    if (last && last.role === role && typeof last.content === "string") last.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  // The new message is a user turn, so history must end on Chef.
  if (out.at(-1)?.role === "user") out.push({ role: "assistant", content: "(no reply)" });
  return out;
}

async function runTool(session: ChefSession, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case "plan_week":
      return session.planWeekTool(input);
    case "add_dinner":
      return session.addDinnerTool(input);
    case "change_dinner":
      return session.changeDinnerTool(input);
    case "move_dinner":
      return session.moveDinnerTool(input);
    case "remove_dinner":
      return session.removeDinnerTool(input);
    case "mark_dinner":
      return session.markDinnerTool(input);
    case "lock_week":
      return session.lockWeekTool(input);
    case "recipe_details":
      return session.recipeDetailsTool(input);
    case "remember":
      return session.rememberTool(input);
    case "forget":
      return session.forgetTool(input);
    case "add_recipe_from_link":
      return session.addRecipeFromLinkTool(input);
    case "save_recipe":
      return session.saveRecipeTool(input);
    case "set_ingredient_tier":
      return session.setIngredientTierTool(input);
    case "ask":
      return session.askTool(input);
    default:
      return { ok: false, text: `There's no tool called ${name}.` };
  }
}

export async function runChef(opts: {
  call: CallModel;
  session: ChefSession;
  history: HistoryItem[];
  author: string;
  text: string;
  partnerJoined: boolean;
  model?: string;
}): Promise<ChefReply> {
  const { call, session } = opts;
  const state = await session.stateText(opts.partnerJoined);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (session.attachment) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: session.attachment.contentType as "image/jpeg" | "image/png" | "image/webp",
        data: Buffer.from(session.attachment.bytes).toString("base64"),
      },
    });
  }
  content.push({ type: "text", text: `<household_state>\n${state}\n</household_state>\n\n${opts.author}: ${opts.text || "(sent a photo)"}` });

  const messages: Anthropic.Beta.BetaMessageParam[] = [...historyMessages(opts.history), { role: "user", content }];
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: CHEF_SYSTEM },
    // The recipe list changes rarely, so it sits in the cached prefix.
    { type: "text", text: catalogText(session.catalog, (id) => session.recipeRefFor(id)), cache_control: { type: "ephemeral" } },
  ];

  const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, calls: 0 };
  const said: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await call({
      model: opts.model ?? CHEF_MODEL,
      max_tokens: 16000,
      system,
      tools: CHEF_TOOLS,
      messages,
      thinking: { type: "adaptive" },
      // Low effort keeps each turn quick and cheap; the overlap maths runs in code.
      output_config: { effort: "low" },
      // Caches the conversation so far, so tool steps in the same turn are cheap.
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    usage.calls += 1;
    usage.input += response.usage.input_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
    usage.output += response.usage.output_tokens;

    for (const block of response.content) if (block.type === "text" && block.text.trim()) said.push(block.text.trim());

    if (response.stop_reason === "refusal") {
      if (!said.length) said.push("I can't help with that one, but I'm happy to keep working on dinners.");
      break;
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length || response.stop_reason === "max_tokens") break;

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = use.input && typeof use.input === "object" ? (use.input as Record<string, unknown>) : {};
      let outcome: ToolOutcome;
      try {
        outcome = await runTool(session, use.name, input);
      } catch (e) {
        console.error("chef tool failed", use.name, e);
        outcome = { ok: false, text: "That didn't save because of a database error. Tell them, and don't retry more than once." };
      }
      results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.text, ...(outcome.ok ? {} : { is_error: true }) });
    }
    messages.push({ role: "user", content: results });
    // After ask, the person answers next; the question shows as tap-to-answer choices.
    if (session.choice) break;
  }

  const text = said.join("\n\n") || (session.choice ? "" : session.changes.length ? "Done." : "Sorry, I lost my train of thought. Try that again?");
  return { text, choice: session.choice, changes: session.changes, addedRecipes: session.addedRecipes, usage };
}
