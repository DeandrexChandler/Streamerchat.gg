import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import type { SimulationSettings } from "../../config/settings";

/**
 * The invariants the momentum restructure exists to guarantee.
 *
 * The old suite asserted burst sizes and speed multipliers, which described a
 * generation model we deliberately abandoned. These describe the one that
 * replaced it.
 */

function make(settings: Partial<SimulationSettings> = {}, seed = 42) {
  return new SimulationEngine({
    seed,
    now: 0,
    emotes: FIXTURE_EMOTES,
    settings: { audienceSize: 60, aiShare: 0, ...settings },
  });
}

/** Runs a session, returning every released message with its timestamp. */
function session(
  engine: SimulationEngine,
  durationMs: number,
  script: Array<[number, string]> = [],
) {
  const out: Array<{ at: number; text: string; source: string }> = [];
  let next = 0;
  for (let t = 0; t <= durationMs; t += 250) {
    while (next < script.length && script[next][0] <= t) {
      engine.handleTranscript(script[next++][1], t);
    }
    for (const m of engine.tick(t)) out.push({ at: t, text: m.text, source: m.source });
  }
  return out;
}

describe("output rate tracks the configured target", () => {
  it.each([0.5, 1, 1.5, 2, 4])("averages near %s messages per second", (rate) => {
    const engine = make({ messagesPerSecond: rate });
    const durationMs = 300_000;
    // A realistic amount of speech, so momentum is exercised rather than idle.
    const script: Array<[number, string]> = [];
    for (let t = 5_000; t < durationMs; t += 20_000) {
      script.push([t, "okay so let me get this next part set up"]);
    }
    const messages = session(engine, durationMs, script);
    const actual = messages.length / (durationMs / 1000);
    expect(actual).toBeGreaterThan(rate * 0.6);
    expect(actual).toBeLessThan(rate * 1.5);
  });

  it("spaces messages unevenly rather than on a metronome", () => {
    const messages = session(make({ messagesPerSecond: 2 }), 120_000);
    const gaps: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      gaps.push(messages[i].at - messages[i - 1].at);
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance =
      gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
    // Exponential arrivals have a standard deviation equal to their mean; a
    // fixed cadence would have none at all.
    expect(Math.sqrt(variance)).toBeGreaterThan(mean * 0.4);
  });
});

describe("momentum sustains interesting events", () => {
  function volume(utterance: string, windowMs: number) {
    const engine = make({}, 7);
    return session(engine, windowMs, [[1_000, utterance]]).length;
  }

  it("produces far more chat for a big moment than a mundane one", () => {
    const big = volume("BRO I JUST BEAT IT", 30_000);
    const small = volume("im grabbing some water", 30_000);
    // The failure this replaced: these were indistinguishable.
    expect(big).toBeGreaterThan(small * 1.3);
  });

  it("keeps reacting well after the moment has passed", () => {
    const engine = make({}, 11);
    const messages = session(engine, 40_000, [[1_000, "BRO I JUST BEAT IT"]]);
    const late = messages.filter((m) => m.at > 16_000);
    expect(late.length).toBeGreaterThan(0);
  });

  it("eventually returns to a quiet baseline", () => {
    const engine = make({}, 13);
    const messages = session(engine, 120_000, [[1_000, "BRO I JUST BEAT IT"]]);
    const early = messages.filter((m) => m.at < 15_000).length;
    const late = messages.filter((m) => m.at > 90_000 && m.at < 105_000).length;
    expect(early).toBeGreaterThan(late);
  });
});

describe("deterministic fallback", () => {
  it("runs convincingly with no AI whatsoever", () => {
    const engine = make({ aiShare: 0 }, 21);
    const messages = session(engine, 120_000, [
      [2_000, "BRO I JUST BEAT IT"],
      [30_000, "okay so let me set this up"],
      [60_000, "chat what do you think"],
    ]);
    expect(messages.length).toBeGreaterThan(40);
    expect(messages.every((m) => m.source !== "ai")).toBe(true);

    // Varied: no single line may account for a large share of output.
    const counts = new Map<string, number>();
    for (const m of messages) counts.set(m.text, (counts.get(m.text) ?? 0) + 1);
    const commonest = Math.max(...counts.values());
    expect(commonest / messages.length).toBeLessThan(0.15);
  });
});

describe("contextual reactions dominate", () => {
  it("makes generated reactions the bulk of chat, not a garnish", () => {
    const engine = make({ aiShare: 0.4 }, 31);
    // Keep the candidate pool permanently stocked so nothing but the ceiling
    // limits how much AI could be used.
    const messages: Array<{ source: string }> = [];
    let next = 0;
    /**
     * A streamer who keeps talking, which is the case this measures. Long
     * trailing silence would be measuring ambient fallback instead, and
     * ambient is *supposed* to win once nobody has said anything for a while.
     */
    const script: Array<[number, string]> = Array.from({ length: 10 }, (_, k) => [
      2_000 + k * 10_000,
      `okay so here is the next thing number ${k}`,
    ]);
    for (let t = 0; t <= 100_000; t += 250) {
      while (next < script.length && script[next][0] <= t) {
        engine.handleTranscript(script[next++][1], t);
      }
      // A fresh batch on each utterance, as the real pipeline supplies them.
      if (script.some(([at]) => at === t)) {
        engine.supplyReactions(
          Array.from({ length: 20 }, (_, k) => ({ text: `generated line ${t}-${k}` })),
          t,
        );
      }
      for (const m of engine.tick(t)) messages.push({ source: m.source });
    }
    const ai = messages.filter((m) => m.source === "ai").length;
    /**
     * The inversion this restructure exists for. Contextual output used to be
     * capped near 5% and measured at 6% even with an unlimited supply, so the
     * streamer was reading a chat that had not listened to them.
     */
    expect(ai / messages.length).toBeGreaterThan(0.6);
    // Still not everything: ambient chatter is deliberate seasoning.
    expect(ai / messages.length).toBeLessThan(0.98);
  });
});
