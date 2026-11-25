import { describe, expect, it } from "vitest";
import { chefCost, dollars } from "./chef-cost";

describe("chefCost", () => {
  it("prices each kind of token", () => {
    expect(chefCost({ input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 })).toBeCloseTo(29.2);
  });
  it("treats missing usage as free", () => {
    expect(chefCost(null)).toBe(0);
    expect(chefCost({ output: 1000 })).toBeCloseTo(0.02);
  });
  it("shows small amounts plainly", () => {
    expect(dollars(0)).toBe("$0");
    expect(dollars(0.004)).toBe("<$0.01");
    expect(dollars(1.234)).toBe("$1.23");
  });
});
