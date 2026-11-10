import { describe, expect, it } from "vitest";
import { priceLabel } from "../plans";

describe("priceLabel", () => {
  it("shows the price when set", () => {
    expect(priceLabel({ price: "$5/mo" })).toBe("$5/mo");
  });
  it("shows Coming soon when null", () => {
    expect(priceLabel({ price: null })).toBe("Coming soon");
  });
});
