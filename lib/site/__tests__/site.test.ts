import { describe, expect, it } from "vitest";
import { priceLabel } from "../plans";
import { navLinks } from "../links";

describe("priceLabel", () => {
  it("shows the price when set", () => {
    expect(priceLabel({ price: "$5/mo" })).toBe("$5/mo");
  });
  it("shows Coming soon when null", () => {
    expect(priceLabel({ price: null })).toBe("Coming soon");
  });
});

describe("navLinks", () => {
  it("hides GitHub while the repo is private", () => {
    expect(navLinks(null).map((l) => l.label)).not.toContain("GitHub");
  });
  it("shows GitHub once a URL is set", () => {
    const gh = navLinks("https://github.com/x/y").find((l) => l.label === "GitHub");
    expect(gh).toEqual({ label: "GitHub", href: "https://github.com/x/y", external: true });
  });
});
