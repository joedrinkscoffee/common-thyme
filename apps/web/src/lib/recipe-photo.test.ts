import { describe, expect, it } from "vitest";
import { isPhotoPathFor, photoPathFor } from "./recipe-photo";

const hh = "11111111-1111-1111-1111-111111111111";
const id = "22222222-2222-2222-2222-222222222222";

describe("recipe photo paths", () => {
  it("names a new photo inside the household folder", () => {
    expect(photoPathFor(hh, id, "image/jpeg", 1763680000000)).toBe(`${hh}/${id}-1763680000000.jpg`);
    expect(photoPathFor(hh, id, "image/heic", 1)).toBeNull();
  });

  it("accepts only this recipe's photos", () => {
    expect(isPhotoPathFor(`${hh}/${id}-1763680000000.webp`, hh, id)).toBe(true);
    expect(isPhotoPathFor(`${hh}/${id}.jpg`, hh, id)).toBe(true); // name the importer uses
    expect(isPhotoPathFor(`${hh}/33333333-3333-3333-3333-333333333333.jpg`, hh, id)).toBe(false);
    expect(isPhotoPathFor(`${hh}/${id}-1/../x.jpg`, hh, id)).toBe(false);
    expect(isPhotoPathFor(`other/${id}.jpg`, hh, id)).toBe(false);
  });
});
