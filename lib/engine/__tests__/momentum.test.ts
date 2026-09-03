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



