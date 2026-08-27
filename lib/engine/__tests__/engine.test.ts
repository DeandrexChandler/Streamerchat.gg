import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import {
  DEFAULT_EMOTES,
  buildEmoteIndex,
  isEmoteOnly,
} from "../../data/emotes";

const emoteIndex = buildEmoteIndex(DEFAULT_EMOTES);
import type { ChatMessage } from "../types";
import type { SimulationSettings } from "../../config/settings";

/** Runs the engine over a virtual clock and collects everything it emits. */
function run(
  engine: SimulationEngine,
  durationMs: number,
  script: Array<[ms: number, text: string]> = [],
  stepMs = 250,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  let next = 0;
  for (let now = 0; now <= durationMs; now += stepMs) {
    while (next < script.length && script[next][0] <= now) {
      engine.handleTranscript(script[next][1], now);
      next++;
    }
    out.push(...engine.tick(now));
  }
  return out;
}

const make = (settings: Partial<SimulationSettings> = {}, seed = 1234) =>
  new SimulationEngine({
    seed,
    now: 0,
    emotes: DEFAULT_EMOTES,
    settings: { aiShare: 0, ...settings },
  });

describe("SimulationEngine", () => {
  it("produces messages in response to speech", () => {
    const messages = run(make(), 20_000, [[1000, "let's go that was amazing"]]);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("is fully deterministic for a given seed", () => {
    const script: Array<[number, string]> = [
      [1000, "hey everyone welcome in"],
      [8000, "chat what do you think"],
    ];
    const a = run(make({}, 777), 40_000, script).map((m) => `${m.at}|${m.username}|${m.text}`);
    const b = run(make({}, 777), 40_000, script).map((m) => `${m.at}|${m.username}|${m.text}`);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
  });

  it("differs between seeds", () => {
    const script: Array<[number, string]> = [[1000, "hey everyone welcome in"]];
    const a = run(make({}, 1), 20_000, script).map((m) => m.text);
    const b = run(make({}, 2), 20_000, script).map((m) => m.text);
    expect(a).not.toEqual(b);
  });

  it("never emits messages with the same timestamp out of order", () => {
    const messages = run(make(), 60_000, [[1000, "let's go"]]);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].at).toBeGreaterThanOrEqual(messages[i - 1].at);
    }
  });

  it("spreads a burst over time rather than dumping it at once", () => {
    // The core anti-pattern this engine exists to avoid.
    const messages = run(make(), 15_000, [[1000, "LET'S GO that was insane!"]]);
    const times = new Set(messages.map((m) => m.at));
    expect(messages.length).toBeGreaterThan(3);
    expect(times.size).toBeGreaterThan(2);
  });

  it("reports whether it reacted to an utterance", () => {
    const engine = make({ idleEnabled: false });
    const outcome = engine.handleTranscript("chat what do you think", 1000);
    expect(outcome?.reacted).toBe(true);
    expect(outcome?.queued).toBeGreaterThan(0);
  });

  it("ignores transcripts that are too short to be speech", () => {
    const engine = make();
    expect(engine.handleTranscript("a", 1000)).toBeNull();
    expect(engine.handleTranscript("  ", 1000)).toBeNull();
  });

  it("produces idle chatter during silence", () => {
    const messages = run(make({ idleAfterSeconds: 10 }), 90_000);
    expect(messages.filter((m) => m.kind === "idle").length).toBeGreaterThan(0);
  });

  it("produces no idle chatter when disabled", () => {
    const messages = run(make({ idleEnabled: false }), 120_000);
    expect(messages.filter((m) => m.kind === "idle")).toHaveLength(0);
  });

  it("does not repeat the same message text back to back", () => {
    // Regression: chat used to say "that's so pretty" three times in six
    // seconds, which is the loudest possible tell that lines come from a list.
    const messages = run(make(), 180_000, [
      [1000, "look at this, check it out"],
      [30_000, "chat what do you think"],
      [60_000, "let's go we did it"],
    ]);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].text).not.toBe(messages[i - 1].text);
    }
  });

  it("keeps verbatim repeats rare across a whole session", () => {
    const messages = run(make(), 240_000, [[1000, "hey everyone welcome in"]]);
    const counts = new Map<string, number>();
    for (const m of messages) counts.set(m.text, (counts.get(m.text) ?? 0) + 1);
    const worst = Math.max(...counts.values());
    expect(worst / messages.length).toBeLessThan(0.15);
  });

  it("never has a viewer reply to themselves", () => {
    // Regression: idle side-replies used to target the speaker's own name.
    const messages = run(make({ sideConversationChance: 0.6 }), 180_000, [
      [1000, "hey everyone"],
      [40_000, "chat what do you think"],
    ]);
    const replies = messages.filter((m) => m.replyTo);
    expect(replies.length).toBeGreaterThan(0);
    for (const reply of replies) {
      expect(reply.replyTo).not.toBe(reply.username);
    }
  });

  it("reuses viewers rather than inventing a name per message", () => {
    // Persistent identities are what make chat feel like a room of people.
    const messages = run(make({ audienceSize: 25 }), 180_000, [
      [1000, "hey everyone welcome in"],
      [30_000, "let's go"],
    ]);
    const unique = new Set(messages.map((m) => m.username)).size;
    expect(messages.length).toBeGreaterThan(unique);
    expect(unique).toBeLessThanOrEqual(25);
  });

  it("gives a viewer a stable colour across their messages", () => {
    const messages = run(make(), 120_000, [[1000, "hey everyone"]]);
    const colors = new Map<string, string>();
    for (const m of messages) {
      if (colors.has(m.username)) expect(colors.get(m.username)).toBe(m.color);
      colors.set(m.username, m.color);
    }
  });

  it("respects the per-minute rate limit", () => {
    const messages = run(make({ maxMessagesPerMinute: 10, chatSpeed: 1 }), 60_000, [
      [1000, "LET'S GO INSANE AMAZING!!!"],
      [5000, "chat what do you think"],
      [9000, "look at this"],
    ]);
    expect(messages.length).toBeLessThanOrEqual(11);
  });

  it("scales the rate cap with chat speed", () => {
    // maxMessagesPerMinute is a safety valve against a runaway director, not a
    // pacing control. Holding it fixed clamped the top speed setting straight
    // back down to a readable trickle, which is what made "CHAOS" feel tame.
    const script: Array<[number, string]> = [
      [1000, "LET'S GO INSANE AMAZING!!!"],
      [5000, "chat what do you think"],
      [9000, "look at this"],
    ];
    const slow = run(make({ maxMessagesPerMinute: 10, chatSpeed: 1 }, 5), 60_000, script);
    const fast = run(make({ maxMessagesPerMinute: 10, chatSpeed: 6 }, 5), 60_000, script);
    expect(fast.length).toBeGreaterThan(slow.length);
    expect(fast.length).toBeLessThanOrEqual(61);
  });

  it("produces more messages at higher chatSpeed", () => {
    const script: Array<[number, string]> = [[1000, "chat what do you think"]];
    const slow = run(make({ chatSpeed: 0.5 }, 55), 30_000, script).length;
    const fast = run(make({ chatSpeed: 2.5 }, 55), 30_000, script).length;
    expect(fast).toBeGreaterThan(slow);
  });

  it("drops messages blocked by the profanity filter", () => {
    const engine = make({ profanityMode: "filter", blockedWords: ["hi", "yo", "hey", "hello"] });
    const messages = run(engine, 20_000, [[1000, "hey everyone welcome in"]]);
    for (const m of messages) {
      expect(m.text.toLowerCase()).not.toMatch(/\b(hi|yo|hey|hello)\b/);
    }
  });

  it("emits no AI-sourced messages when aiShare is 0", () => {
    const engine = make({ aiShare: 0 });
    engine.supplyAiCandidates(["an ai line", "another ai line"]);
    const messages = run(engine, 60_000, [[1000, "chat what do you think"]]);
    expect(messages.every((m) => m.source !== "ai")).toBe(true);
  });

  it("can use supplied AI candidates when aiShare is high", () => {
    // AI only fills "engaged"/"invested" messages, which are a minority of
    // traffic by design, and whether any given burst contains one depends on
    // the RNG path. Sweeping seeds rather than pinning one keeps this from
    // breaking every time an unrelated default shifts the random stream.
    const sawAi = [1, 2, 3, 4, 5, 6].some((seed) => {
      const engine = make({ aiShare: 0.4 }, seed);
      engine.supplyAiCandidates(
        Array.from({ length: 40 }, (_, i) => `an ai written candidate line ${i}`),
      );
      const messages = run(engine, 400_000, [
        [1_000, "chat what do you think about the roof or the walls"],
        [40_000, "look at this, check out how it turned out"],
        [90_000, "so yesterday this really funny thing happened at work"],
        [150_000, "I have no idea how any of this works, I'm completely lost"],
        [220_000, "come on, this is so annoying, not again"],
        [300_000, "chat should I keep going or call it here"],
      ]);
      return messages.some((m) => m.source === "ai");
    });

    expect(sawAi).toBe(true);
  });

  it("spends AI on only a small slice of traffic", () => {
    // AI fills "engaged"/"invested" messages only — generating "W" or an
    // emote through a language model would be waste. So even at a high
    // aiShare, AI lines should stay a small fraction of everything emitted.
    //
    // Note this asserts on *how often* AI is used, not on how long its output
    // is: the text is whatever the caller supplied, so asserting on length
    // would only be testing the fixture.
    const engine = make({ aiShare: 0.4 }, 246);
    engine.supplyAiCandidates(
      Array.from({ length: 200 }, (_, i) => `a written out candidate line ${i}`),
    );
    const messages = run(engine, 400_000, [
      [1_000, "chat what do you think about the roof"],
      [60_000, "look at this, check out how it turned out"],
      [140_000, "so yesterday something really funny happened"],
      [240_000, "come on, this is so annoying, not again"],
      [320_000, "chat should I keep going or call it here"],
    ]);

    const ai = messages.filter((m) => m.source === "ai").length;
    expect(messages.length).toBeGreaterThan(30);
    expect(ai / messages.length).toBeLessThan(0.2);
  });

  it("does not want an AI refill when the tier is disabled", () => {
    const engine = make({ aiShare: 0 });
    const outcome = engine.handleTranscript("something vague", 1000);
    expect(engine.wantsAiRefill(outcome)).toBe(false);
  });

  it("wants an AI refill on a high-energy moment", () => {
    const engine = make({ aiShare: 0.1 });
    const outcome = engine.handleTranscript(
      "LET'S GO THAT WAS ABSOLUTELY INSANE AMAZING!!!",
      1000,
      0.95,
    );
    expect(outcome!.classification.energy).toBeGreaterThan(0.6);
    expect(engine.wantsAiRefill(outcome)).toBe(true);
  });

  it("never spends an AI call on an utterance chat ignored", () => {
    // No point generating a novel line for something nobody responded to.
    const engine = make({ aiShare: 0.2 });
    const ignored = { classification: { intent: "mundane" as const, sentiment: "neutral" as const, energy: 0.1, keywords: [], confidence: 0.15 }, reacted: false, queued: 0 };
    expect(engine.wantsAiRefill(ignored)).toBe(false);
  });

  it("flush() clears queued messages", () => {
    const engine = make();
    engine.handleTranscript("LET'S GO that was insane", 0);
    expect(engine.stats().pending).toBeGreaterThan(0);
    engine.flush();
    expect(engine.stats().pending).toBe(0);
  });

  it("reports coherent stats", () => {
    const engine = make();
    const messages = run(engine, 60_000, [[1000, "hey everyone"]]);
    const stats = engine.stats();
    expect(stats.released).toBe(messages.length);
    expect(stats.audience).toBeGreaterThan(0);
    expect(
      Object.values(stats.bySource).reduce((a, b) => a + b, 0),
    ).toBe(messages.length);
  });

  it("applies updated settings without a restart", () => {
    const engine = make({ idleEnabled: true, idleAfterSeconds: 5 });
    engine.updateSettings({ idleEnabled: false });
    const messages = run(engine, 120_000);
    expect(messages.filter((m) => m.kind === "idle")).toHaveLength(0);
  });

  it("survives a tick with no emotes configured", () => {
    const engine = new SimulationEngine({ seed: 5, now: 0, emotes: [], settings: { aiShare: 0 } });
    expect(() => run(engine, 60_000, [[1000, "hey everyone"]])).not.toThrow();
  });

  it("holds a steady message rate over a long session", () => {
    const messages = run(make({ idleAfterSeconds: 12 }), 600_000);
    const perMinute = messages.length / 10;
    // Idle-only chat should stay conversational, not silent and not a flood.
    expect(perMinute).toBeGreaterThan(3);
    expect(perMinute).toBeLessThan(60);
  });
});

describe("SimulationEngine pacing", () => {
  /** Inter-message gaps in ms across a scripted session. */
  function gaps(seed: number): number[] {
    const engine = make({ idleAfterSeconds: 12 }, seed);
    const messages = run(engine, 300_000, [
      [1000, "hey everyone welcome in"],
      [40_000, "chat what do you think about the roof"],
      [80_000, "LET'S GO that was insane!"],
      [140_000, "look at this, check it out"],
      [200_000, "come on, this is so annoying"],
    ]);
    const out: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      out.push(messages[i].at - messages[i - 1].at);
    }
    return out;
  }

  it("produces tight clusters of near-simultaneous messages", () => {
    // Real chat piles on: two people hit enter within a few hundred ms.
    const tight = gaps(4242).filter((g) => g <= 500).length;
    expect(tight).toBeGreaterThan(0);
  });

  it("produces long pauses as well as clusters", () => {
    const slow = gaps(4242).filter((g) => g >= 3000).length;
    expect(slow).toBeGreaterThan(0);
  });

  it("is not metronomic — gaps spread across multiple buckets", () => {
    // Regression: an eased-curve scheduler produced a near-constant ~2s gap,
    // which read as machine-generated even though the message text was fine.
    const all = gaps(4242);
    const buckets = [
      all.filter((g) => g < 500).length,
      all.filter((g) => g >= 500 && g < 1500).length,
      all.filter((g) => g >= 1500 && g < 3000).length,
      all.filter((g) => g >= 3000).length,
    ];
    expect(buckets.filter((n) => n > 0).length).toBeGreaterThanOrEqual(3);
    // No single bucket may dominate.
    expect(Math.max(...buckets) / all.length).toBeLessThan(0.7);
  });

  it("reacts faster to high-energy moments than to mundane ones", () => {
    const firstGap = (text: string, seed: number) => {
      const engine = make({ idleEnabled: false }, seed);
      const messages = run(engine, 30_000, [[1000, text]]);
      return messages.length > 0 ? messages[0].at - 1000 : Infinity;
    };
    // Averaged over seeds so a single unlucky draw can't flake the test.
    const avg = (text: string) => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => firstGap(text, s));
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    };
    expect(avg("LET'S GO THAT WAS AMAZING INCREDIBLE!!!")).toBeLessThan(
      avg("okay so anyway"),
    );
  });
});

describe("username generation", () => {
  it("keeps usernames unique", () => {
    const engine = make({ audienceSize: 60 }, 5150);
    const messages = run(engine, 200_000, [[1000, "hey everyone"]]);
    const byName = new Map<string, string>();
    for (const m of messages) {
      // Same name must always mean the same viewer.
      if (byName.has(m.username)) expect(byName.get(m.username)).toBe(m.viewerId);
      byName.set(m.username, m.viewerId);
    }
  });
});

describe("SimulationEngine message shape", () => {
  /** Word-count histogram over a long multi-seed session. */
  function lengthMix(seeds: number[]) {
    const counts = { one: 0, few: 0, medium: 0, long: 0, total: 0 };

    for (const seed of seeds) {
      const engine = make({ idleAfterSeconds: 12 }, seed);
      const messages = run(engine, 400_000, [
        [1_000, "hey everyone welcome in"],
        [30_000, "chat what do you think about the roof or the walls"],
        [70_000, "LET'S GO that was insane!"],
        [110_000, "look at this, check out how it turned out"],
        [160_000, "come on, this is so annoying, not again"],
        [210_000, "so yesterday this really funny thing happened at work"],
        [260_000, "finally, we did it, got it"],
        [310_000, "I have no idea how this works, I'm lost"],
      ]);

      for (const m of messages) {
        const words = m.text.trim().split(/\s+/).filter(Boolean).length;
        counts.total++;
        // Emote spam counts as the shortest kind of message regardless of
        // token count — see isEmoteOnly().
        if (words <= 1 || isEmoteOnly(m.text, emoteIndex)) counts.one++;
        else if (words <= 3) counts.few++;
        else if (words <= 6) counts.medium++;
        else counts.long++;
      }
    }

    return counts;
  }

  const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

  it("is dominated by emotes and single words", () => {
    // The realism failure this replaced: a wall of articulate 4-6 word
    // statements, as if every viewer were competing to say something clever.
    const mix = lengthMix(SEEDS);
    expect(mix.one / mix.total).toBeGreaterThan(0.4);
  });

  it("keeps medium-length statements a minority", () => {
    const mix = lengthMix(SEEDS);
    expect(mix.medium / mix.total).toBeLessThan(0.25);
  });

  it("produces full sentences occasionally but rarely", () => {
    const mix = lengthMix(SEEDS);
    const share = mix.long / mix.total;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.1);
  });

  it("ignores a meaningful share of what the streamer says", () => {
    // Chat that responds to literally every utterance feels relentless.
    const engine = make({ idleAfterSeconds: 12 }, 4321);
    const script: Array<[number, string]> = Array.from({ length: 24 }, (_, i) => [
      i * 8_000 + 1_000,
      "okay so anyway I think we're just about done with this part here",
    ]);
    run(engine, 220_000, script);
    expect(engine.stats().ignored).toBeGreaterThan(6);
  });

  it("still answers every direct question to chat", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const engine = make({ idleEnabled: false }, seed);
      const messages = run(engine, 40_000, [
        [1_000, "chat what do you think, should I do the roof or the walls"],
      ]);
      expect(messages.length).toBeGreaterThan(0);
    }
  });

  it("does not post reply-shaped affirmations into silence", () => {
    // "true", "gotcha", "makes sense" only mean something as a response;
    // posted into an empty chat they read as agreeing with nobody.
    const engine = make({ idleAfterSeconds: 10 }, 8080);
    const messages = run(engine, 300_000);
    const idleTexts = messages
      .filter((m) => m.kind === "idle")
      .map((m) => m.text.toLowerCase());

    expect(idleTexts.length).toBeGreaterThan(5);
    for (const text of idleTexts) {
      expect(["true", "gotcha", "i see", "makes sense", "fair", "sure"]).not.toContain(text);
    }
  });
})

describe("SimulationEngine audience size", () => {
  /** Distinct usernames seen over a long idle session. */
  function distinctNames(audienceSize: number, seed: number): number {
    const engine = make({ audienceSize, idleAfterSeconds: 10 }, seed);
    const messages = run(engine, 600_000);
    return new Set(messages.map((m) => m.username)).size;
  }

  it("keeps a small audience to a consistent roster", () => {
    // A small stream should feel like the same handful of people. Churn is
    // deliberately slow at this size so you learn who the regulars are.
    const engine = make({ audienceSize: 10, idleAfterSeconds: 10 }, 606);
    const messages = run(engine, 600_000);
    const names = new Set(messages.map((m) => m.username));
    expect(messages.length).toBeGreaterThan(50);
    expect(names.size).toBeLessThan(22);
  });

  it("shows more unique names as the audience grows", () => {
    const seeds = [3, 14, 15];
    const small = seeds.map((s) => distinctNames(10, s));
    const large = seeds.map((s) => distinctNames(200, s));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(large)).toBeGreaterThan(avg(small) * 2);
  });

  it("grows the population toward a raised audience setting", () => {
    const engine = make({ audienceSize: 10, idleAfterSeconds: 10 }, 77);
    run(engine, 30_000);
    engine.updateSettings({ audienceSize: 60 });
    run(engine, 400_000);
    expect(engine.stats().audience).toBeGreaterThan(40);
  });

  it("shrinks the population toward a lowered audience setting", () => {
    const engine = make({ audienceSize: 120, idleAfterSeconds: 10 }, 78);
    run(engine, 30_000);
    engine.updateSettings({ audienceSize: 15 });
    run(engine, 400_000);
    expect(engine.stats().audience).toBeLessThan(60);
  });

  it("keeps every username unique through churn", () => {
    // Churn frees a departed viewer's vocabulary for reuse; that must never
    // produce two live viewers sharing a name.
    const engine = make({ audienceSize: 150, idleAfterSeconds: 10 }, 99);
    const messages = run(engine, 500_000);
    const byName = new Map<string, string>();
    for (const m of messages) {
      const existing = byName.get(m.username);
      if (existing) expect(existing).toBe(m.viewerId);
      byName.set(m.username, m.viewerId);
    }
  });
});

describe("SimulationEngine viewer count", () => {
  /** Viewer counts sampled across a session. */
  function samples(target: number, seed: number): number[] {
    const engine = make({ audienceSize: target, idleAfterSeconds: 10 }, seed);
    const out: number[] = [];
    for (let t = 0; t <= 180_000; t += 250) {
      engine.tick(t);
      if (t % 3000 === 0) out.push(engine.stats().audience);
    }
    return out;
  }

  it("stays near the configured audience", () => {
    for (const target of [25, 500, 8000]) {
      const values = samples(target, 11);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(Math.abs(mean - target) / target).toBeLessThan(0.15);
    }
  });

  it("keeps moving rather than settling on a number", () => {
    // A viewer count frozen on a number reads as the setting echoed back, not
    // as an audience. The property that matters is that it changes between
    // samples — a bounded random walk naturally revisits values, so counting
    // distinct ones would be asserting the wrong thing.
    const values = samples(500, 12);
    let unchanged = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] === values[i - 1]) unchanged++;
    }
    expect(unchanged / values.length).toBeLessThan(0.1);
  });

  it("rarely lands exactly on the configured number", () => {
    const values = samples(500, 13);
    const exact = values.filter((v) => v === 500).length;
    expect(exact / values.length).toBeLessThan(0.05);
  });

  it("scales its wobble with audience size", () => {
    // Counting noise grows with the square root of the count: a 10-viewer
    // stream moves by ones, a 10,000-viewer stream by tens.
    const spread = (target: number) => {
      const values = samples(target, 14);
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread(8000)).toBeGreaterThan(spread(25) * 5);
  });

  it("tracks a changed audience setting", () => {
    const engine = make({ audienceSize: 50, idleAfterSeconds: 10 }, 15);
    run(engine, 30_000);
    engine.updateSettings({ audienceSize: 3000 });
    run(engine, 200_000);
    const value = engine.stats().audience;
    expect(value).toBeGreaterThan(2500);
    expect(value).toBeLessThan(3500);
  });

  it("never reports fewer than one viewer", () => {
    const engine = make({ audienceSize: 5, idleAfterSeconds: 10 }, 16);
    for (let t = 0; t <= 120_000; t += 250) {
      engine.tick(t);
      expect(engine.stats().audience).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("SimulationEngine AI spend", () => {
  it("does not spend more on AI just because chat is faster", () => {
    // The whole point of the budget: turning chat speed up 10x emits ~13x the
    // messages, but the streamer is saying exactly the same things, so the
    // number of refills worth making has not changed. Tying spend to message
    // volume would multiply the bill for no extra value.
    const refillsAt = (chatSpeed: number) => {
      const engine = make({ aiShare: 0.2, chatSpeed }, 909);
      let refills = 0;
      let next = 0;
      const script: Array<[number, string]> = Array.from(
        { length: 40 },
        (_, i) => [i * 15_000, "okay so anyway I think we should try this next"],
      );
      for (let t = 0; t <= 600_000; t += 250) {
        while (next < script.length && script[next][0] <= t) {
          const outcome = engine.handleTranscript(script[next++][1], t);
          if (engine.wantsAiRefill(outcome, t)) {
            engine.recordAiCall(t);
            refills++;
          }
        }
        engine.tick(t);
      }
      return refills;
    };

    const slow = refillsAt(1);
    const fast = refillsAt(12);
    expect(fast).toBeLessThanOrEqual(slow + 1);
  });

  it("stops asking for refills once the budget is exhausted", () => {
    const engine = make({ aiShare: 0.3 }, 42);
    for (let i = 0; i < 30; i++) engine.recordAiCall(i * 30_000);

    const outcome = engine.handleTranscript("something quite ambiguous here", 1_000_000);
    // Far inside the minimum interval since the last recorded call.
    expect(engine.wantsAiRefill(outcome, 30 * 30_000 + 1000)).toBe(false);
  });

  it("stops asking for refills while backing off from a failure", () => {
    const engine = make({ aiShare: 0.3 }, 43);
    engine.recordAiFailure(0);
    const outcome = engine.handleTranscript("something quite ambiguous here", 5_000);
    expect(engine.wantsAiRefill(outcome, 5_000)).toBe(false);
  });

  it("reports what the AI tier has cost so far", () => {
    const engine = make({ aiShare: 0.3 }, 44);
    engine.recordAiCall(0);
    engine.recordAiCall(30_000);
    const stats = engine.aiBudgetStats(60_000);
    expect(stats.calls).toBe(2);
    expect(stats.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("SimulationEngine repeat cap", () => {
  /**
   * Most times any single viewer repeated one exact text inside the engine's
   * lookback window.
   *
   * Windowed, because the cap is windowed: over a long session a viewer may
   * legitimately reach the limit, have it age out, and reach it again. A
   * lifetime count would be asserting a guarantee the engine never made.
   */
  function worstPerViewer(messages: ChatMessage[], window = 250): number {
    let worst = 0;
    for (let i = 0; i < messages.length; i++) {
      const slice = messages.slice(Math.max(0, i - window + 1), i + 1);
      const counts = new Map<string, number>();
      for (const m of slice) {
        const key = `${m.viewerId}\u0000${m.text}`;
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        if (n > worst) worst = n;
      }
    }
    return worst;
  }

  it("never lets one viewer repeat a message more than three times", () => {
    const messages = run(make({ idleAfterSeconds: 10 }, 555), 400_000, [
      [1_000, "hey everyone welcome in"],
      [60_000, "LET'S GO that was insane!"],
      [140_000, "chat what do you think"],
    ]);
    expect(messages.length).toBeGreaterThan(80);
    expect(worstPerViewer(messages)).toBeLessThanOrEqual(3);
  });

  it("holds the per-viewer cap at the highest chat speed", () => {
    const messages = run(make({ chatSpeed: 12, idleAfterSeconds: 10 }, 556), 200_000, [
      [1_000, "LET'S GO that was absolutely insane!"],
    ]);
    expect(messages.length).toBeGreaterThan(300);
    expect(worstPerViewer(messages)).toBeLessThanOrEqual(3);
  });

  it("DOES let a crowd pile onto the same reaction", () => {
    // The whole point of making the cap per-viewer. Many different people
    // posting "W" at the same moment is real chat, and capping it globally
    // made hype moments feel damped.
    const messages = run(make({ chatSpeed: 12, idleAfterSeconds: 10 }, 557), 200_000);

    const byText = new Map<string, Set<string>>();
    for (const m of messages) {
      const viewers = byText.get(m.text) ?? new Set<string>();
      viewers.add(m.viewerId);
      byText.set(m.text, viewers);
    }

    const widest = Math.max(...[...byText.values()].map((v) => v.size));
    expect(widest).toBeGreaterThan(3);
  });

  it("keeps emote spam inside one message untouched", () => {
    // Repeated emotes within a single line are encouraged, not capped — that
    // is what real emote spam looks like.
    const messages = run(make({ chatSpeed: 12, idleAfterSeconds: 10 }, 558), 200_000);
    const spammed = messages.filter(
      (m) => isEmoteOnly(m.text, emoteIndex) && m.text.split(/\s+/).length >= 4,
    );
    expect(spammed.length).toBeGreaterThan(5);
  });

  it("still emits plenty of messages despite the cap", () => {
    const messages = run(make({ chatSpeed: 12, idleAfterSeconds: 10 }, 559), 120_000);
    expect(messages.length / 2).toBeGreaterThan(150);
  });

  it("lets a viewer fire off several different lines in a row, rarely", () => {
    const messages = run(make({ idleAfterSeconds: 10 }, 560), 500_000, [
      [1_000, "hey everyone welcome in"],
      [80_000, "LET'S GO that was insane!"],
      [200_000, "chat what do you think about this"],
      [320_000, "look at this, check it out"],
    ]);

    let runs = 0;
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].viewerId === messages[i - 1].viewerId) runs++;
    }

    expect(runs).toBeGreaterThan(0);
    // Rare: this should read as someone typing fast, not as a tiny audience.
    expect(runs / messages.length).toBeLessThan(0.15);
  });
});

describe("SimulationEngine viewer count", () => {
  /** Viewer counts sampled across a session. */
  function samples(target: number, seed: number): number[] {
    const engine = make({ audienceSize: target, idleAfterSeconds: 10 }, seed);
    const out: number[] = [];
    for (let t = 0; t <= 180_000; t += 250) {
      engine.tick(t);
      if (t % 3000 === 0) out.push(engine.stats().audience);
    }
    return out;
  }

  it("stays near the configured audience", () => {
    for (const target of [25, 500, 8000]) {
      const values = samples(target, 11);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(Math.abs(mean - target) / target).toBeLessThan(0.15);
    }
  });

  it("keeps moving rather than settling on a number", () => {
    // A viewer count frozen on a number reads as the setting echoed back, not
    // as an audience. The property that matters is that it changes between
    // samples — a bounded random walk naturally revisits values, so counting
    // distinct ones would be asserting the wrong thing.
    const values = samples(500, 12);
    let unchanged = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] === values[i - 1]) unchanged++;
    }
    expect(unchanged / values.length).toBeLessThan(0.1);
  });

  it("rarely lands exactly on the configured number", () => {
    const values = samples(500, 13);
    const exact = values.filter((v) => v === 500).length;
    expect(exact / values.length).toBeLessThan(0.05);
  });

  it("scales its wobble with audience size", () => {
    // Counting noise grows with the square root of the count: a 10-viewer
    // stream moves by ones, a 10,000-viewer stream by tens.
    const spread = (target: number) => {
      const values = samples(target, 14);
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread(8000)).toBeGreaterThan(spread(25) * 5);
  });

  it("tracks a changed audience setting", () => {
    const engine = make({ audienceSize: 50, idleAfterSeconds: 10 }, 15);
    run(engine, 30_000);
    engine.updateSettings({ audienceSize: 3000 });
    run(engine, 200_000);
    const value = engine.stats().audience;
    expect(value).toBeGreaterThan(2500);
    expect(value).toBeLessThan(3500);
  });

  it("never reports fewer than one viewer", () => {
    const engine = make({ audienceSize: 5, idleAfterSeconds: 10 }, 16);
    for (let t = 0; t <= 120_000; t += 250) {
      engine.tick(t);
      expect(engine.stats().audience).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("SimulationEngine AI spend", () => {
  it("does not spend more on AI just because chat is faster", () => {
    // The whole point of the budget: turning chat speed up 10x emits ~13x the
    // messages, but the streamer is saying exactly the same things, so the
    // number of refills worth making has not changed. Tying spend to message
    // volume would multiply the bill for no extra value.
    const refillsAt = (chatSpeed: number) => {
      const engine = make({ aiShare: 0.2, chatSpeed }, 909);
      let refills = 0;
      let next = 0;
      const script: Array<[number, string]> = Array.from(
        { length: 40 },
        (_, i) => [i * 15_000, "okay so anyway I think we should try this next"],
      );
      for (let t = 0; t <= 600_000; t += 250) {
        while (next < script.length && script[next][0] <= t) {
          const outcome = engine.handleTranscript(script[next++][1], t);
          if (engine.wantsAiRefill(outcome, t)) {
            engine.recordAiCall(t);
            refills++;
          }
        }
        engine.tick(t);
      }
      return refills;
    };

    const slow = refillsAt(1);
    const fast = refillsAt(12);
    expect(fast).toBeLessThanOrEqual(slow + 1);
  });

  it("stops asking for refills once the budget is exhausted", () => {
    const engine = make({ aiShare: 0.3 }, 42);
    for (let i = 0; i < 30; i++) engine.recordAiCall(i * 30_000);

    const outcome = engine.handleTranscript("something quite ambiguous here", 1_000_000);
    // Far inside the minimum interval since the last recorded call.
    expect(engine.wantsAiRefill(outcome, 30 * 30_000 + 1000)).toBe(false);
  });

  it("stops asking for refills while backing off from a failure", () => {
    const engine = make({ aiShare: 0.3 }, 43);
    engine.recordAiFailure(0);
    const outcome = engine.handleTranscript("something quite ambiguous here", 5_000);
    expect(engine.wantsAiRefill(outcome, 5_000)).toBe(false);
  });

  it("reports what the AI tier has cost so far", () => {
    const engine = make({ aiShare: 0.3 }, 44);
    engine.recordAiCall(0);
    engine.recordAiCall(30_000);
    const stats = engine.aiBudgetStats(60_000);
    expect(stats.calls).toBe(2);
    expect(stats.estimatedTokens).toBeGreaterThan(0);
  });
});

