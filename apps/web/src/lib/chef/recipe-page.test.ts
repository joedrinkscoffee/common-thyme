import { describe, expect, it } from "vitest";
import { isoMinutes, ogImage, pageText, recipeFromHtml } from "./recipe-page";

const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>x</body></html>`;

describe("recipeFromHtml", () => {
  it("reads a schema.org recipe inside a @graph", () => {
    const html = page({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Site" },
        {
          "@type": ["Recipe"],
          name: "Lemon &amp; Herb Chicken",
          recipeIngredient: ["2 chicken breasts", "1 lemon, zested", " "],
          recipeInstructions: [
            { "@type": "HowToSection", name: "Prep", itemListElement: [{ "@type": "HowToStep", text: "Zest the lemon." }] },
            { "@type": "HowToStep", text: "Roast for <b>25</b> minutes." },
          ],
          totalTime: "PT1H5M",
          recipeYield: ["4", "4 servings"],
          image: [{ "@type": "ImageObject", url: "https://example.com/a.jpg" }],
          recipeCuisine: "Mediterranean",
        },
      ],
    });
    expect(recipeFromHtml(html)).toEqual({
      title: "Lemon & Herb Chicken",
      ingredientLines: ["2 chicken breasts", "1 lemon, zested"],
      steps: [
        { title: "Prep", body: "Zest the lemon." },
        { title: null, body: "Roast for 25 minutes." },
      ],
      totalMinutes: 65,
      servings: 4,
      photoUrl: "https://example.com/a.jpg",
      tags: ["mediterranean"],
    });
  });

  it("splits instructions given as one string", () => {
    const html = page({ "@type": "Recipe", name: "Toast", recipeIngredient: ["bread"], recipeInstructions: "Toast it.\nButter it." });
    expect(recipeFromHtml(html)?.steps).toEqual([
      { title: null, body: "Toast it." },
      { title: null, body: "Butter it." },
    ]);
  });

  it("returns null without a usable recipe", () => {
    expect(recipeFromHtml("<html><body>Just a blog</body></html>")).toBeNull();
    expect(recipeFromHtml(page({ "@type": "Recipe", name: "Empty" }))).toBeNull();
    expect(recipeFromHtml('<script type="application/ld+json">{broken</script>')).toBeNull();
  });
});

describe("page helpers", () => {
  it("parses durations", () => {
    expect(isoMinutes("PT30M")).toBe(30);
    expect(isoMinutes("PT2H")).toBe(120);
    expect(isoMinutes("nonsense")).toBeNull();
  });
  it("finds the share image and the text", () => {
    const html = '<meta property="og:image" content="https://x.com/i.jpg"><nav>menu</nav><p>Mix &amp; bake.</p><script>var x</script>';
    expect(ogImage(html)).toBe("https://x.com/i.jpg");
    expect(pageText(html)).toBe("Mix & bake.");
  });
});
