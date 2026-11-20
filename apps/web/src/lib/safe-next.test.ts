import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
  });
  it("rejects other hosts and empty values", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
