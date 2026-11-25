import { describe, expect, it } from "vitest";
import { shoppingName, shoppingParts } from "./names";

describe("shoppingName", () => {
  it.each([
    ["pasture-raised eggs", "eggs"], ["large eggs", "eggs"], ["egg", "eggs"], ["egg noodles", "egg noodles"], ["eggplant", "eggplant"],
    ["cremini mushrooms", "mushrooms"], ["baby bella mushrooms", "mushrooms"], ["button mushrooms", "mushrooms"], ["shiitake mushrooms", "shiitake mushrooms"],
    ["oyster mushrooms", "oyster mushrooms"], ["kosher salt", "salt & pepper"], ["salt and pepper", "salt & pepper"], ["black pepper", "salt & pepper"],
    ["freshly ground black pepper", "salt & pepper"], ["plus 1/8 teaspoon salt", "salt & pepper"], ["low-sodium soy sauce", "soy sauce"],
    ["organic baby spinach", "spinach"], ["baby kale", "kale"], ["baby back ribs", "baby back ribs"], ["carrots", "carrots"], ["fresh ginger", "ginger"], ["1-inch piece fresh ginger", "ginger"], ["extra virgin olive oil", "extra virgin olive oil"], ["red bell pepper", "red bell pepper"],
  ])("%s → %s", (written, want) => {
    expect(shoppingName(written)).toBe(want);
  });
});

describe("shoppingParts", () => {
  it("splits aromatics into what's in them, without amounts", () => {
    expect(shoppingParts("Asian-style aromatics", 1, "tbsp")).toEqual([
      { name: "ginger", quantity: null, unit: null },
      { name: "garlic", quantity: null, unit: null },
      { name: "scallions", quantity: null, unit: null },
    ]);
    expect(shoppingParts("carrots", 2, "each")).toEqual([{ name: "carrots", quantity: 2, unit: "each" }]);
  });
});
