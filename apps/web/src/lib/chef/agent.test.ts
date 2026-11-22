import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { historyMessages, runChef, type CallModel } from "./agent";
import { MemoryStore } from "./memory-store";
import { ChefSession } from "./session";

type Block = Anthropic.Beta.BetaContentBlock;
const msg = (content: Block[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): Anthropic.Beta.BetaMessage =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
  }) as unknown as Anthropic.Beta.BetaMessage;
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Block;
const use = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;

function scripted(...replies: Anthropic.Beta.BetaMessage[]) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const call: CallModel = async (p) => {
    calls.push(structuredClone(p));
    const next = replies.shift();
    if (!next) throw new Error("no more scripted replies");
    return next;
  };
  return { call, calls };
}

async function session() {
  const store = new MemoryStore([
    { id: "piccata", title: "Chicken Piccata", tags: ["kid friendly"], totalMinutes: 35, useUp: ["parsley", "caper"] },
    { id: "orzo", title: "Shrimp Orzo", tags: [], totalMinutes: 30, useUp: ["parsley", "caper", "shrimp"] },
    { id: "pesto", title: "Pesto Pasta", tags: [], totalMinutes: 25, useUp: ["parsley", "basil"] },
  ]);
  const s = new ChefSession(store, "2026-11-21");
  await s.load();
  return { store, s };
}

describe("runChef", () => {
  it("runs tools until Chef is done, and reports what changed", async () => {
    const { store, s } = await session();
    const { call, calls } = scripted(
      msg([use("t1", "plan_week", { week_start: "2026-11-23", nights: ["2026-11-23", "2026-11-24"], kid_nights: 0 })], "tool_use"),
      msg([text("Done. Next week leans on **parsley** twice.")], "end_turn"),
    );
    const reply = await runChef({ call, session: s, history: [], author: "Joe", text: "Plan next week, 2 nights", partnerJoined: false });

    expect(reply.text).toBe("Done. Next week leans on **parsley** twice.");
    expect(reply.changes).toEqual(["Drafted the week of Nov 23"]);
    expect(store.dinnerList).toHaveLength(2);
    expect(reply.usage).toEqual({ input: 200, cacheRead: 100, cacheWrite: 20, output: 40, calls: 2 });

    const first = calls[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first).toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: "low" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    const prompt = JSON.stringify(first.messages);
    expect(prompt).toContain("<household_state>");
    expect(prompt).toContain("Joe: Plan next week, 2 nights");
    expect(JSON.stringify(first.system)).toContain("r1 | Chicken Piccata | 35 min | kid friendly |  | parsley, caper");

    // The second call replays the first answer and the tool result, unchanged.
    expect(calls[1].messages.slice(0, calls[0].messages.length)).toEqual(calls[0].messages);
    const result = JSON.stringify(calls[1].messages.at(-1));
    expect(result).toContain("tool_result");
    expect(result).toContain("Saved as a draft");
  });

  it("returns tool errors to Chef instead of failing the turn", async () => {
    const { s } = await session();
    const { call, calls } = scripted(msg([use("t1", "change_dinner", { dinner: "d42" })], "tool_use"), msg([text("I couldn't find that one.")], "end_turn"));
    const reply = await runChef({ call, session: s, history: [], author: "Joe", text: "Swap Tuesday", partnerJoined: true });
    expect(reply.text).toBe("I couldn't find that one.");
    expect(JSON.stringify(calls[1].messages.at(-1))).toContain('"is_error":true');
  });

  it("stops after a question so the person can tap an answer", async () => {
    const { s } = await session();
    const { call, calls } = scripted(msg([text("Quick one first."), use("t1", "ask", { question: "How many kid nights?", choices: ["None", "1", "2"] })], "tool_use"));
    const reply = await runChef({ call, session: s, history: [], author: "Joe", text: "Plan next week", partnerJoined: true });
    expect(calls).toHaveLength(1);
    expect(reply).toMatchObject({ text: "Quick one first.", choice: { question: "How many kid nights?", choices: ["None", "1", "2"] } });
  });

  it("sends an attached photo as an image", async () => {
    const store = new MemoryStore([]);
    const s = new ChefSession(store, "2026-11-21", { bytes: new Uint8Array([255, 216, 255]), contentType: "image/jpeg" });
    await s.load();
    const { call, calls } = scripted(msg([text("What dish is this?")], "end_turn"));
    await runChef({ call, session: s, history: [], author: "Joe", text: "", partnerJoined: true });
    const content = calls[0].messages.at(-1)!.content as Anthropic.Beta.BetaContentBlockParam[];
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/" } });
  });
});

describe("historyMessages", () => {
  it("names who said what, starts with a person and ends with Chef", () => {
    const out = historyMessages([
      { role: "chef", author: null, body: "Hi" },
      { role: "user", author: "Joe", body: "Plan it" },
      { role: "user", author: "Sam", body: "No fish" },
      { role: "chef", author: null, body: "Done" },
      { role: "user", author: "Joe", body: "Thanks" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "Joe: Plan it\n\nSam: No fish" },
      { role: "assistant", content: "Done" },
      { role: "user", content: "Joe: Thanks" },
      { role: "assistant", content: "(no reply)" },
    ]);
  });
});
