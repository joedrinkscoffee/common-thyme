import { describe, expect, it } from "vitest";
import { byFolder, linksFromBookmarks, linksFromText, looksLikeRecipe } from "./link-list";

const CHROME = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://mail.google.com/" ADD_DATE="1">Gmail</A>
        <DT><H3 ADD_DATE="1">Recipes</H3>
        <DL><p>
            <DT><A HREF="https://www.seriouseats.com/the-best-chili?utm_source=x" ADD_DATE="1">The Best Chili</A>
            <DT><H3>Soups &amp; Stews</H3>
            <DL><p>
                <DT><A HREF="https://example.com/2024/05/miso-soup/">Miso Soup</A>
            </DL><p>
        </DL><p>
        <DT><A HREF="https://www.seriouseats.com/the-best-chili">The Best Chili (again)</A>
    </DL><p>
    <DT><H3>Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
    </DL><p>
</DL><p>`;

describe("linksFromBookmarks", () => {
  it("reads links with their folders and skips repeats and non-web links", () => {
    const links = linksFromBookmarks(CHROME);
    expect(links.map((l) => [l.title, l.folder, l.url])).toEqual([
      ["Gmail", "Bookmarks bar", "https://mail.google.com/"],
      ["The Best Chili", "Recipes", "https://www.seriouseats.com/the-best-chili"],
      ["Miso Soup", "Recipes › Soups & Stews", "https://example.com/2024/05/miso-soup/"],
    ]);
    expect(links.map((l) => l.recipe)).toEqual([false, true, true]);
  });

  it("groups by folder in first-seen order", () => {
    expect(byFolder(linksFromBookmarks(CHROME)).map((g) => g.folder)).toEqual(["Bookmarks bar", "Recipes", "Recipes › Soups & Stews"]);
  });

  it("returns nothing for a file that isn't bookmarks", () => {
    expect(linksFromBookmarks("hello")).toEqual([]);
  });
});

describe("linksFromText", () => {
  it("finds links in pasted text and trims trailing punctuation", () => {
    const links = linksFromText("Try https://smittenkitchen.com/2020/01/pasta/, and (https://food52.com/recipes/1). Also https://smittenkitchen.com/2020/01/pasta/");
    expect(links.map((l) => l.url)).toEqual(["https://smittenkitchen.com/2020/01/pasta/", "https://food52.com/recipes/1"]);
    expect(links.every((l) => l.recipe)).toBe(true);
  });
});

describe("looksLikeRecipe", () => {
  it("knows recipe sites and recipe-ish paths", () => {
    expect(looksLikeRecipe("https://cooking.nytimes.com/recipes/1", "")).toBe(true);
    expect(looksLikeRecipe("https://someblog.net/lemon-chicken-tacos/", "")).toBe(true);
    expect(looksLikeRecipe("https://github.com/", "GitHub")).toBe(false);
  });
});
