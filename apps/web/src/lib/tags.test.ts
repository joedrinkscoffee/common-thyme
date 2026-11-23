import { describe, expect, it } from "vitest";
import { canonicalTags, cleanTag, countTags, renameTags, tagKey } from "./tags";

describe("tagKey", () => {
  it("ignores case and extra spaces", () => {
    expect(tagKey("  Sandwiches  &  Burgers ")).toBe("sandwiches & burgers");
  });
});

describe("cleanTag", () => {
  it("keeps case and tidies spaces and commas", () => {
    expect(cleanTag(" Sandwiches,  Burgers ")).toBe("Sandwiches Burgers");
  });
});

describe("countTags", () => {
  it("counts each tag once per recipe, ignoring case", () => {
    expect(countTags([["Asian", "asian"], ["asian"], ["Asian", "Seafood"]])).toEqual([
      { tag: "Asian", count: 3 },
      { tag: "Seafood", count: 1 },
    ]);
  });
  it("uses the spelling most recipes use", () => {
    expect(countTags([["asian"], ["asian"], ["Asian"]])[0].tag).toBe("asian");
  });
  it("prefers capitals on a tie", () => {
    expect(countTags([["asian"], ["Asian"]])[0].tag).toBe("Asian");
  });
});

describe("canonicalTags", () => {
  it("uses the household spelling and drops repeats", () => {
    expect(canonicalTags(["asian", "ASIAN", "weeknight"], ["Asian", "Seafood"])).toEqual(["Asian", "weeknight"]);
  });
});

describe("renameTags", () => {
  it("merges several tags into one, in the first place", () => {
    expect(renameTags(["Sandwiches", "kid friendly", "sandwiches & burgers"], ["Sandwiches", "sandwiches & burgers"], "Sandwiches & Burgers")).toEqual([
      "Sandwiches & Burgers",
      "kid friendly",
    ]);
  });
  it("fixes the spelling of the target tag too", () => {
    expect(renameTags(["asian"], ["Asian"], "Asian")).toEqual(["Asian"]);
  });
  it("returns null when nothing changes", () => {
    expect(renameTags(["Asian", "Seafood"], ["Mexican"], "Tex-Mex")).toBeNull();
    expect(renameTags(["Asian"], ["asian"], "Asian")).toBeNull();
  });
});
