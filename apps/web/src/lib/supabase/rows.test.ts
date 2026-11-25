import { describe, expect, it } from "vitest";
import { firstNameOf, one } from "./rows";

describe("one", () => {
  it("takes the first joined row however it arrives", () => {
    expect(one({ a: 1 })).toEqual({ a: 1 });
    expect(one([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
    expect(one([])).toBeNull();
    expect(one(null)).toBeNull();
    expect(one(undefined)).toBeNull();
  });
});

describe("firstNameOf", () => {
  it("keeps the first word", () => {
    expect(firstNameOf("Joe Perro")).toBe("Joe");
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("")).toBeNull();
  });
});
