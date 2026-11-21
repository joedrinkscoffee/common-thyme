import { describe, expect, it } from "vitest";
import { classifySourceResponse } from "./source-page";

const url = "https://www.blueapron.com/recipes/spicy-veracruz-style-shrimp-with-lime-farro";

describe("classifySourceResponse", () => {
  it("treats a page that loads at the same address as still there", () => {
    expect(classifySourceResponse(url, 200, url)).toBe("loads");
    expect(classifySourceResponse(url, 200, url.replace("www.", "") + "/")).toBe("loads");
  });

  it("treats a redirect to another page as gone", () => {
    expect(classifySourceResponse(url, 200, "https://www.blueapron.com/")).toBe("gone");
    expect(classifySourceResponse(url, 200, "https://www.blueapron.com/recipes")).toBe("gone");
  });

  it("treats 404 and 410 as gone", () => {
    expect(classifySourceResponse(url, 404, url)).toBe("gone");
    expect(classifySourceResponse(url, 410, url)).toBe("gone");
  });

  it("can't tell when the site blocks us or is down", () => {
    expect(classifySourceResponse(url, 403, url)).toBe("unknown");
    expect(classifySourceResponse(url, 503, url)).toBe("unknown");
  });

  it("treats a link that isn't a web address as gone", () => {
    expect(classifySourceResponse("not a link", 200, "")).toBe("gone");
  });
});
