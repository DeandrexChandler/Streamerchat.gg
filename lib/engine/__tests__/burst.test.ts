import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";

/**
 * The burst after something worth reacting to.
 *
 * At the slowest tier chat runs at a line every five seconds. That is right
 * for background chatter and wrong for "spam W" or "im sad": the reaction
 * trickles out at the same pace as everything else and the room reads as a
 * metronome. These pin down that the lift happens, that it is short, and
 * that it does not quietly become a second speed setting.
 */

const LATENCY_MS = 2_000;

/**
 * Runs one utterance through a full session and returns when each message
 * was released, relative to the utterance.
 */
function timeline(line: string, seed: number, rate = 0.2, durationMs = 45_000): number[] {
  const engine = new SimulationEngine({
    seed,
    now: 0,
    emotes: FIXTURE_EMOTES,
    settings: { messagesPerSecond: rate },
  });
  engine.beginSession(0);
  engine.handleTranscript(line, 0, undefined, true);

  const landing: Array<{ at: number; ticket: number; count: number }> = [];
  const at: number[] = [];

  for (let now = 0; now <= durationMs; now += 250) {
    for (const batch of landing.filter((b) => b.at === now)) {
      engine.supplyReactions(
        Array.from({ length: batch.count }, (_, i) => ({ text: `${now}-${i} something about it` })),
        now,
        batch.ticket,
      );
    }

    const request = engine.nextGeneration(now);
    if (request) {
      landing.push({
        at: now + LATENCY_MS,
        ticket: engine.generationTicket!,
        count: request.count,
      });
    }

    for (let i = 0; i < engine.tick(now).length; i += 1) at.push(now);
  }

  return at;
}

/** Average messages released in a window, over several seeds. */
function inWindow(line: string, from: number, to: number, rate = 0.2, seeds = 10): number {
  let total = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    total += timeline(line, seed, rate).filter((t) => t >= from && t < to).length;
  }
  return total / seeds;
}

describe("bursts at the slow tiers", () => {
  it("piles on after a directive, where an ordinary line trickles", () => {
    const hot = inWindow("spam W", 0, 8_000);
    const flat = inWindow("so anyway i was saying", 0, 8_000);
    expect(hot).toBeGreaterThan(flat * 2);
    // A small room going off, not the whole batch at once.
    expect(hot).toBeLessThan(12);
  });

  it("reacts to how the streamer feels, not only to an instruction", () => {
    // "im sad" classifies as mundane — the intent says nothing, the
    // sentiment says everything, and it is exactly the moment a room reacts.
    expect(inWindow("im sad", 0, 8_000)).toBeGreaterThan(
      inWindow("so anyway i was saying", 0, 8_000) * 2,
    );
  });

  it("settles back to the tier afterwards", () => {
    // Twenty seconds on, a burst that has not decayed is just a faster tier.
    const hot = inWindow("spam W", 20_000, 40_000);
    const flat = inWindow("so anyway i was saying", 20_000, 40_000);
    expect(hot).toBeLessThan(flat * 1.6 + 1);
  });

  it("does not turn a talkative minute into one long burst", () => {
    // Every line hot, one every four seconds, against a twenty second
    // cooldown: the room lifts a few times, it does not stay lifted.
    // Averaged over seeds, because one run's gap draws say nothing.
    const runs: number[] = [];
    for (let seed = 0; seed < 6; seed += 1) {
      const engine = new SimulationEngine({
        seed,
        now: 0,
        emotes: FIXTURE_EMOTES,
        settings: { messagesPerSecond: 0.2 },
      });
      engine.beginSession(0);

      const landing: Array<{ at: number; ticket: number; count: number }> = [];
      let released = 0;
      for (let now = 0; now <= 60_000; now += 250) {
        if (now % 4_000 === 0) engine.handleTranscript("LETS GO", now, undefined, true);
        for (const batch of landing.filter((b) => b.at === now)) {
          engine.supplyReactions(
            Array.from({ length: batch.count }, (_, i) => ({ text: `${now}-${i} no shot it worked` })),
            now,
            batch.ticket,
          );
        }
        const request = engine.nextGeneration(now);
        if (request) {
          landing.push({ at: now + LATENCY_MS, ticket: engine.generationTicket!, count: request.count });
        }
        released += engine.tick(now).length;
      }
      runs.push(released);
    }

    // Measured: 38.5 lines a minute with the cooldown, 48.7 without it. A
    // minute at this tier is nominally twelve, so both are lifted — the
    // cooldown is what stops fifteen hot lines stacking into one long burst.
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeLessThan(44);
  });

  it("says the first line of a reply as soon as the batch lands", () => {
    /**
     * With chat already flowing, the reply to something new used to join a
     * queue that emits on its own slow clock: the streamer waited out a
     * provider round trip and then up to another five seconds. Measured
     * across seeds: 0.3s now, 2.4s before, worst case 5.75s.
     */
    const delays: number[] = [];
    for (let seed = 0; seed < 12; seed += 1) {
      const engine = new SimulationEngine({
        seed,
        now: 0,
        emotes: FIXTURE_EMOTES,
        settings: { messagesPerSecond: 0.2 },
      });
      engine.beginSession(0);
      engine.handleTranscript("so the roof is leaking again", 0, undefined, true);

      const landing: Array<{ at: number; ticket: number; count: number }> = [];
      let replyLandedAt = -1;
      let delay = -1;

      for (let now = 0; now <= 90_000; now += 250) {
        // Spoken well into the session, so the queue is full when it lands.
        if (now === 30_000) {
          engine.handleTranscript("chat what do you think honestly", now, undefined, true);
        }
        for (const batch of landing.filter((b) => b.at === now)) {
          engine.supplyReactions(
            Array.from({ length: batch.count }, (_, i) => ({ text: `${now}-${i} words about that` })),
            now,
            batch.ticket,
          );
          if (now > 30_000 && replyLandedAt < 0) replyLandedAt = now;
        }
        const request = engine.nextGeneration(now);
        if (request) {
          landing.push({ at: now + LATENCY_MS, ticket: engine.generationTicket!, count: request.count });
        }
        if (engine.tick(now).length > 0 && replyLandedAt >= 0 && delay < 0) {
          delay = now - replyLandedAt;
        }
      }

      if (delay >= 0) delays.push(delay);
    }

    expect(delays.length).toBeGreaterThan(8);
    const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
    expect(mean).toBeLessThan(1_000);
  });
});
