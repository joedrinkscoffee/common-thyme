import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { addFromLink, addFromPhoto, readExtracted, type IntakeDeps } from "./recipe-intake";
import type { NewRecipe } from "./chef/store";

const reply = (json: object, stop: Anthropic.Beta.BetaStopReason = "end_turn") =>
  ({ content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: stop }) as unknown as Anthropic.Beta.BetaMessage;

const RECIPE = {
  found: true,
  reason: "",
  title: "Weeknight Dal",
  ingredients: ["1 cup red lentils", "2 cups spinach"],
  steps: ["Simmer the lentils.", "Stir in spinach."],
  minutes: 30,
  servings: 4,
  tags: ["Indian"],
  perishable: ["spinach"],
  shows_finished_dish: false,
};

function deps(over: Partial<IntakeDeps> = {}) {
  const saved: NewRecipe[] = [];
  const d: IntakeDeps = {
    store: {
      createRecipe: async (r) => {
        saved.push(r);
        return { ok: true, id: "r1", title: r.title, photo: !!r.photo };
      },
    },
    call: vi.fn(async () => reply(RECIPE)),
    fetchPage: async () => ({ ok: false, error: "nope" }),
    tags: ["Indian", "Quick"],
    ...over,
  };
  return { d, saved };
}

describe("addFromLink", () => {
  it("saves schema.org recipes without calling Claude", async () => {
    const { d, saved } = deps({
      fetchPage: async () => ({
        ok: true,
        url: "https://x.com/dal",
        text: "",
        image: null,
        recipe: { title: "Dal", ingredientLines: ["lentils"], steps: [{ title: null, body: "Cook." }], totalMinutes: 20, servings: null, photoUrl: "https://x.com/dal.jpg", tags: [] },
      }),
    });
    const res = await addFromLink(d, "https://x.com/dal");
    expect(res).toEqual({ status: "saved", id: "r1", title: "Dal", photo: true });
    expect(d.call).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({ sourceUrl: "https://x.com/dal", servings: 2, photo: { url: "https://x.com/dal.jpg" } });
  });

  it("asks Claude to write up pages without recipe data, using the page image", async () => {
    const { d, saved } = deps({
      fetchPage: async () => ({ ok: true, url: "https://blog.com/dal", recipe: null, text: "lentils ".repeat(50), image: "https://blog.com/og.jpg" }),
    });
    const res = await addFromLink(d, "https://blog.com/dal");
    expect(res.status).toBe("saved");
    expect(saved[0]).toMatchObject({ title: "Weeknight Dal", totalMinutes: 30, servings: 4, perishable: ["spinach"], photo: { url: "https://blog.com/og.jpg" } });
  });

  it("passes on why a page isn't a recipe", async () => {
    const { d } = deps({
      fetchPage: async () => ({ ok: true, url: "https://blog.com/list", recipe: null, text: "x ".repeat(200), image: null }),
      call: vi.fn(async () => reply({ ...RECIPE, found: false, reason: "This page is a list of 20 recipes." })),
    });
    expect(await addFromLink(d, "https://blog.com/list")).toEqual({ status: "failed", error: "This page is a list of 20 recipes." });
  });

  it("reports recipes that are already saved", async () => {
    const { d } = deps({
      store: { createRecipe: async () => ({ ok: false, error: 'Already in your recipes as "Dal" (id abc-1).' }) },
      fetchPage: async () => ({ ok: true, url: "https://x.com/dal", text: "", image: null, recipe: { title: "Dal", ingredientLines: ["a"], steps: [{ title: null, body: "b" }], totalMinutes: null, servings: 2, photoUrl: null, tags: [] } }),
    });
    expect(await addFromLink(d, "https://x.com/dal")).toEqual({ status: "duplicate", title: "Dal", id: "abc-1" });
  });

  it("passes on fetch errors", async () => {
    const { d } = deps();
    expect(await addFromLink(d, "https://x.com")).toEqual({ status: "failed", error: "nope" });
  });
});

describe("addFromPhoto", () => {
  const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const };

  it("uses the photo as the picture only when it shows the dish", async () => {
    const a = deps({ call: vi.fn(async () => reply({ ...RECIPE, shows_finished_dish: true })) });
    expect(await addFromPhoto(a.d, photo)).toMatchObject({ status: "saved", photo: true });
    expect(a.saved[0].photo).toEqual({ bytes: photo.bytes, contentType: "image/jpeg" });

    const b = deps();
    expect(await addFromPhoto(b.d, photo)).toMatchObject({ status: "saved", photo: false });
    expect(b.saved[0].photo).toBeNull();
    expect(b.saved[0].sourceUrl).toBeNull();
  });

  it("handles refusals and API errors", async () => {
    const a = deps({ call: vi.fn(async () => reply({}, "refusal")) });
    expect((await addFromPhoto(a.d, photo)).status).toBe("failed");
    const b = deps({ call: vi.fn(async () => Promise.reject(new Error("529"))) });
    expect(await addFromPhoto(b.d, photo)).toMatchObject({ status: "failed" });
  });
});

describe("readExtracted", () => {
  it("drops odd values", () => {
    expect(readExtracted("not json")).toBeNull();
    expect(readExtracted(JSON.stringify({ found: true, title: " A  B ", ingredients: ["x", 3, ""], minutes: -5, servings: 99 }))).toMatchObject({
      title: "A B",
      ingredients: ["x"],
      minutes: 0,
      servings: 0,
      steps: [],
    });
  });
});
