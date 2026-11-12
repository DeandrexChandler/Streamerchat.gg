import { describe, expect, it } from "vitest";
import { priceLabel } from "../plans";
import { DOC_PAGES, neighbours } from "../docs";

describe("priceLabel", () => {
  it("shows the price when set", () => {
    expect(priceLabel({ price: "$5/mo" })).toBe("$5/mo");
  });
  it("shows Coming soon when null", () => {
    expect(priceLabel({ price: null })).toBe("Coming soon");
  });
});

describe("neighbours", () => {
  it("has no previous page on the first and no next on the last", () => {
    expect(neighbours(DOC_PAGES[0].slug).prev).toBeNull();
    expect(neighbours(DOC_PAGES[DOC_PAGES.length - 1].slug).next).toBeNull();
  });
  it("links a middle page both ways", () => {
    const { prev, next } = neighbours(DOC_PAGES[1].slug);
    expect([prev?.slug, next?.slug]).toEqual([DOC_PAGES[0].slug, DOC_PAGES[2].slug]);
  });
  it("returns nothing for an unknown page", () => {
    expect(neighbours("nope")).toEqual({ prev: null, next: null });
  });
});
