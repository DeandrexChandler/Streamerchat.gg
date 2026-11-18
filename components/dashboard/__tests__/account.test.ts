import { describe, expect, it } from "vitest";
import { accountSummary } from "../account";

describe("accountSummary", () => {
  it("hides the panel when billing is off, signed out or malformed", () => {
    expect(accountSummary({ billing: false })).toBeNull();
    expect(accountSummary({ error: "sign in" })).toBeNull();
    expect(accountSummary({ status: "unavailable" })).toBeNull();
    expect(accountSummary(null)).toBeNull();
    expect(accountSummary({ billing: true, plan: "pro" })).toBeNull();
  });

  it("shows plan and usage for a subscriber", () => {
    expect(accountSummary({ billing: true, plan: "pro", status: "active", used: 1234, limit: 6000 })).toEqual({
      plan: "Pro",
      usage: "1,234 of 6,000 batches used this month.",
      action: "portal",
    });
  });

  it("says when the limit is reached", () => {
    expect(accountSummary({ billing: true, plan: "pro", status: "active", used: 6000, limit: 6000 })?.usage).toBe(
      "6,000 of 6,000 batches used this month. Limit reached.",
    );
  });

  it("sends someone with no subscription to pricing, and a lapsed one to the portal", () => {
    const fresh = accountSummary({ billing: true, plan: null, status: null, used: 0, limit: 0 });
    expect(fresh).toEqual({ plan: "No plan", usage: "Chat stays quiet until you pick a plan.", action: "pricing" });
    expect(accountSummary({ billing: true, plan: null, status: "canceled", used: 0, limit: 0 })?.action).toBe("portal");
  });
});
