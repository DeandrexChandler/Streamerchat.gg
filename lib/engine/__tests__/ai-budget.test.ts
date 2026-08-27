import { describe, expect, it } from "vitest";
import { AiBudget } from "../ai-budget";

describe("AiBudget", () => {
  it("allows the first call", () => {
    expect(new AiBudget().canSpend(0)).toBe(true);
  });

  it("enforces a minimum gap between calls", () => {
    const budget = new AiBudget({ minIntervalMs: 25_000 });
    budget.record(0);
    expect(budget.canSpend(10_000)).toBe(false);
    expect(budget.canSpend(24_999)).toBe(false);
    expect(budget.canSpend(25_000)).toBe(true);
  });

  it("caps calls per hour", () => {
    const budget = new AiBudget({ minIntervalMs: 0, maxCallsPerHour: 5 });
    for (let i = 0; i < 5; i++) budget.record(i * 1000);
    expect(budget.canSpend(6000)).toBe(false);
    expect(budget.blockReason(6000)).toBe("hourly-limit");
  });

  it("lets the hourly window roll forward", () => {
    const budget = new AiBudget({ minIntervalMs: 0, maxCallsPerHour: 3 });
    for (let i = 0; i < 3; i++) budget.record(i * 1000);
    expect(budget.canSpend(5000)).toBe(false);
    expect(budget.canSpend(3_600_001)).toBe(true);
  });

  it("caps calls per session regardless of elapsed time", () => {
    // The overnight-stream backstop: an hourly cap alone gives an unbounded
    // total for a session left running.
    const budget = new AiBudget({
      minIntervalMs: 0,
      maxCallsPerHour: 1000,
      maxCallsPerSession: 4,
    });
    for (let i = 0; i < 4; i++) budget.record(i * 3_600_000);
    expect(budget.canSpend(100 * 3_600_000)).toBe(false);
    expect(budget.blockReason(0)).toBe("session-limit");
  });

  it("backs off after a failure", () => {
    const budget = new AiBudget({ minIntervalMs: 0 });
    budget.recordFailure(0);
    expect(budget.canSpend(1000)).toBe(false);
    expect(budget.blockReason(1000)).toBe("backoff");
    expect(budget.canSpend(31_000)).toBe(true);
  });

  it("lengthens backoff on repeated failures", () => {
    // A dead endpoint or a bad key must degrade to occasional retries, not a
    // hot loop against a failing service.
    const budget = new AiBudget({ minIntervalMs: 0 });
    budget.recordFailure(0);
    budget.recordFailure(31_000);
    budget.recordFailure(100_000);
    expect(budget.canSpend(150_000)).toBe(false);
  });

  it("clears backoff after a success", () => {
    const budget = new AiBudget({ minIntervalMs: 0 });
    budget.recordFailure(0);
    budget.record(31_000);
    expect(budget.canSpend(31_001)).toBe(true);
  });

  it("caps backoff so a transient outage still recovers", () => {
    const budget = new AiBudget({ minIntervalMs: 0 });
    for (let i = 0; i < 20; i++) budget.recordFailure(i * 1000);
    expect(budget.canSpend(20_000 + 600_001)).toBe(true);
  });

  it("reports estimated token spend", () => {
    const budget = new AiBudget({ minIntervalMs: 0, estimatedTokensPerCall: 900 });
    budget.record(0);
    budget.record(1000);
    expect(budget.stats(2000).estimatedTokens).toBe(1800);
  });

  it("counts refusals so an over-eager caller is visible", () => {
    const budget = new AiBudget({ minIntervalMs: 10_000 });
    budget.record(0);
    budget.canSpend(1000);
    budget.canSpend(2000);
    expect(budget.stats(2000).blocked).toBe(2);
  });

  it("bounds total spend over a long session", () => {
    // The property that actually protects the bill: cost is a function of
    // wall-clock time, not of how much chat the engine emitted.
    const budget = new AiBudget();
    let calls = 0;
    // Eight hours, attempting a refill every single second.
    for (let t = 0; t < 8 * 3_600_000; t += 1000) {
      if (budget.canSpend(t)) {
        budget.record(t);
        calls++;
      }
    }
    expect(calls).toBeLessThanOrEqual(400);
  });

  it("reset() clears every limit", () => {
    const budget = new AiBudget({ maxCallsPerSession: 1 });
    budget.record(0);
    expect(budget.canSpend(1_000_000)).toBe(false);
    budget.reset();
    expect(budget.canSpend(1_000_000)).toBe(true);
  });
});
