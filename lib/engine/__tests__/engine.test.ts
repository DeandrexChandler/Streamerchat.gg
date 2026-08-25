import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { DEFAULT_EMOTES } from "../../data/emotes";
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
    const messages = run(make({ maxMessagesPerMinute: 10, chatSpeed: 3 }), 60_000, [
      [1000, "LET'S GO INSANE AMAZING!!!"],
      [5000, "chat what do you think"],
      [9000, "look at this"],
    ]);
    expect(messages.length).toBeLessThanOrEqual(11);
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
    // traffic by design — so observing one needs a longer window than the
    // aiShare value alone would suggest.
    const engine = make({ aiShare: 0.4 });
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
    expect(messages.some((m) => m.source === "ai")).toBe(true);
  });

  it("never spends an AI call on a one-word reaction", () => {
    // Generating "W" through a language model is pure waste.
    const engine = make({ aiShare: 0.4 });
    engine.supplyAiCandidates(Array.from({ length: 40 }, () => "x"));
    const messages = run(engine, 300_000, [
      [1_000, "chat what do you think about the roof"],
      [60_000, "look at this"],
      [140_000, "so yesterday something funny happened"],
    ]);
    for (const m of messages.filter((x) => x.source === "ai")) {
      expect(m.text.trim().split(/\s+/).length).toBeGreaterThan(1);
    }
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
        if (words <= 1) counts.one++;
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
