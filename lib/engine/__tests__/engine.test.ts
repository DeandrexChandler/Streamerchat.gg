import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { buildEmoteIndex, isEmoteOnly } from "../../data/emotes";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";

const emoteIndex = buildEmoteIndex(FIXTURE_EMOTES);
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
    emotes: FIXTURE_EMOTES,
    settings: { aiShare: 0, ...settings },
  });

describe("SimulationEngine", () => {






  it("never emits messages with the same timestamp out of order", () => {
    const messages = run(make(), 60_000, [[1000, "let's go"]]);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].at).toBeGreaterThanOrEqual(messages[i - 1].at);
    }
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




  it("drops messages blocked by the profanity filter", () => {
    const engine = make({ profanityMode: "filter", blockedWords: ["hi", "yo", "hey", "hello"] });
    const messages = run(engine, 20_000, [[1000, "hey everyone welcome in"]]);
    for (const m of messages) {
      expect(m.text.toLowerCase()).not.toMatch(/\b(hi|yo|hey|hello)\b/);
    }
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

  /**
   * These replace three tests that asserted the opposite: that one-word
   * messages exceeded 40%, medium statements stayed under 25%, and full
   * sentences were rare. That shape measured out as 77% of output at three
   * words or fewer with a mean of 2.5 words and nothing above twelve — a wall
   * of "W" and "hm" rather than a room of people.
   *
   * Asserted as a distribution, never per message: short lines are still
   * useful and still the bulk of a pile-on.
   */
  it("no longer lets tiny comments dominate", () => {
    const mix = lengthMix(SEEDS);
    expect(mix.one / mix.total).toBeLessThan(0.55);
  });

  it("makes real replies common rather than exceptional", () => {
    const mix = lengthMix(SEEDS);
    expect((mix.medium + mix.long) / mix.total).toBeGreaterThan(0.3);
  });

  it("still produces plenty of short reactions", () => {
    // The other failure mode: every viewer composing a paragraph.
    const mix = lengthMix(SEEDS);
    expect(mix.one / mix.total).toBeGreaterThan(0.2);
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



  it("never reports fewer than one viewer", () => {
    const engine = make({ audienceSize: 5, idleAfterSeconds: 10 }, 16);
    for (let t = 0; t <= 120_000; t += 250) {
      engine.tick(t);
      expect(engine.stats().audience).toBeGreaterThanOrEqual(1);
    }
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


  it("DOES let a crowd pile onto the same reaction", () => {
    // The whole point of making the cap per-viewer. Many different people
    // posting "W" at the same moment is real chat, and capping it globally
    // made hype moments feel damped.
    const messages = run(make({ messagesPerSecond: 4, idleAfterSeconds: 10 }, 557), 200_000);

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
    const messages = run(make({ messagesPerSecond: 4, idleAfterSeconds: 10 }, 558), 200_000);
    const spammed = messages.filter(
      (m) => isEmoteOnly(m.text, emoteIndex) && m.text.split(/\s+/).length >= 4,
    );
    expect(spammed.length).toBeGreaterThan(5);
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



  it("never reports fewer than one viewer", () => {
    const engine = make({ audienceSize: 5, idleAfterSeconds: 10 }, 16);
    for (let t = 0; t <= 120_000; t += 250) {
      engine.tick(t);
      expect(engine.stats().audience).toBeGreaterThanOrEqual(1);
    }
  });
});



describe("emote-only mode", () => {

  function run(emotes: readonly typeof FIXTURE_EMOTES[number][]): string[] {
    const engine = new SimulationEngine({
      seed: 7,
      now: 0,
      emotes,
      settings: { audienceSize: 40, aiShare: 0, emoteOnlyMode: true },
    });
    engine.handleTranscript("let's go that was amazing", 0, 0.8);

    const released: string[] = [];
    for (let t = 0; t <= 60_000; t += 250) {
      for (const m of engine.tick(t)) released.push(m.text);
    }
    return released;
  }



  it("emits nothing rather than blanks when there are no emotes", () => {
    expect(run([])).toHaveLength(0);
  });


});



/**
 * Regression: React logged "two children with the same key" during real use.
 *
 * Idle message ids were `i${now}-${speakerId}` with no per-attempt index,
 * unlike the reaction path which already carried one. That was survivable
 * while idle fired at most once per poll — raising the background flow rate
 * made same-tick collisions from one speaker routine, and duplicate keys make
 * React duplicate or omit messages outright.
 */

/**
 * Regression: chat could not tell an instruction from background talk.
 *
 * "spam W", "chat can you hear me" and "everyone say pog" all classified as
 * `mundane` at 0.15 confidence and produced byte-identical filler — "?", "hm",
 * "just got here", "real". The streamer was talking directly to chat and chat
 * answered with noise.
 */

describe("viewers do not repeat themselves", () => {
  /**
   * The reported bug, verbatim:
   *
   *   quinn: sup
   *   sillyDrift53: hey BlacBushido
   *   quinn: heyyyy
   *   sillyDrift53: hey man !
   *
   * One person greeting twice is the tell. Chat as a whole repeating a phrase
   * is fine and stays allowed.
   */
  it("never lets one viewer post the same line twice", () => {
    const engine = new SimulationEngine({
      seed: 99,
      now: 0,
      emotes: FIXTURE_EMOTES,
      settings: { idleEnabled: false },
    });

    const out: ChatMessage[] = [];
    for (let now = 0; now <= 60_000; now += 250) {
      if (now % 5_000 === 0) {
        engine.handleTranscript("hey what's up chat", now);
        engine.supplyReactions(
          [
            { text: "hey", emotion: "chill" },
            { text: "sup", emotion: "chill" },
            { text: "yo", emotion: "chill" },
          ],
          now,
        );
      }
      out.push(...engine.tick(now));
    }

    const seen = new Map<string, Set<string>>();
    for (const message of out) {
      const said = seen.get(message.username) ?? new Set<string>();
      const normalised = message.text.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      expect(said.has(normalised)).toBe(false);
      said.add(normalised);
      seen.set(message.username, said);
    }
    expect(out.length).toBeGreaterThan(10);
  });

  it("treats heyyyy as the same thing as hey", () => {
    const engine = new SimulationEngine({
      seed: 7,
      now: 0,
      emotes: [],
      settings: { idleEnabled: false },
    });

    engine.handleTranscript("hi everyone", 0);
    engine.supplyReactions(
      Array.from({ length: 40 }, (_, i) =>
        i % 2 === 0
          ? { text: "hey", emotion: "chill" as const }
          : { text: "heyyyy", emotion: "chill" as const },
      ),
      0,
    );

    const out: ChatMessage[] = [];
    for (let now = 0; now <= 40_000; now += 250) out.push(...engine.tick(now));

    for (const [, texts] of groupByUser(out)) {
      const collapsed = texts.map((text) => text.replace(/(.)\1{1,}/g, "$1"));
      expect(new Set(collapsed).size).toBe(collapsed.length);
    }
  });

  it("still lets different viewers say the same thing", () => {
    const engine = new SimulationEngine({
      seed: 3,
      now: 0,
      emotes: [],
      settings: { idleEnabled: false },
    });

    engine.handleTranscript("we just won", 0);
    engine.supplyReactions(
      Array.from({ length: 30 }, () => ({ text: "W", emotion: "hype" as const })),
      0,
    );

    const out: ChatMessage[] = [];
    for (let now = 0; now <= 30_000; now += 250) out.push(...engine.tick(now));

    // A pile-on is many people saying one word. That has to survive.
    expect(out.filter((message) => message.text.includes("W")).length)
      .toBeGreaterThan(3);
  });
});

function groupByUser(messages: ChatMessage[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const message of messages) {
    const texts = grouped.get(message.username) ?? [];
    texts.push(message.text.toLowerCase());
    grouped.set(message.username, texts);
  }
  return grouped;
}

describe("per-viewer repetition, session scope", () => {
  /**
   * A rolling window is not enough.
   *
   * A viewer who says "hey" in the first minute and "heyyy" in the fortieth
   * has still said it twice, and the streamer watching the whole session is
   * the one who notices. Measured: a six-line window lets 40 duplicates
   * through this run; session-scoped memory lets none.
   */
  const longSession = (audienceSize: number) => {
    const engine = new SimulationEngine({
      seed: 21,
      now: 0,
      emotes: [],
      settings: { idleEnabled: false, audienceSize },
    });
    const pool = [
      "same", "fair", "true", "yeah", "real", "facts",
      "valid", "bet", "word", "ok", "sure", "right",
    ];

    const out: ChatMessage[] = [];
    for (let now = 0; now <= 400_000; now += 250) {
      if (now % 10_000 === 0) {
        engine.handleTranscript("what do you all think", now);
        engine.supplyReactions(
          pool.map((text) => ({ text, emotion: "chill" as const })),
          now,
        );
      }
      out.push(...engine.tick(now));
    }
    return { out, pool };
  };

  it("remembers what a viewer said for the whole session, not a window", () => {
    const { out } = longSession(2);

    expect(out.length).toBeGreaterThan(20);
    for (const [, texts] of groupByUser(out)) {
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it("still lets a viewer speak many times with different wording", () => {
    // The other half of the rule. Blocking repeats must not collapse into
    // "one message per person" — that is a room of strangers taking turns.
    const { out, pool } = longSession(2);
    const most = Math.max(
      ...[...groupByUser(out).values()].map((texts) => texts.length),
    );
    expect(most).toBeGreaterThan(pool.length / 2);
  });

  it("hands the line to another viewer instead of dropping the tick", () => {
    // A rejected candidate disqualifies the speaker, not the message.
    // Measured: retrying recovers 23 messages here where bailing out gets 16.
    const { out } = longSession(2);
    expect(out.length).toBeGreaterThan(19);
  });

  it("never lets one viewer greet twice, even across separate greetings", () => {
    /**
     * The cross-topic case. Greeting once per *topic* is not enough: the
     * streamer says hi, wanders off for ninety seconds, says hi again, and
     * that starts a fresh topic with an empty participant list — so the same
     * six people greet all over again. A small audience makes the collision
     * near-certain if the session-scoped rule is not doing the work.
     */
    const engine = new SimulationEngine({
      seed: 11,
      now: 0,
      emotes: [],
      settings: { idleEnabled: false, audienceSize: 4 },
    });

    const out: ChatMessage[] = [];
    for (const [at, text] of [[0, "hey everyone"], [90_000, "hi again chat"]] as const) {
      engine.handleTranscript(text, at);
      engine.supplyReactions(
        ["yo", "hey", "sup", "hii", "hello", "wassup"].map((t) => ({
          text: t,
          emotion: "chill" as const,
        })),
        at,
      );
      for (let now = at; now <= at + 40_000; now += 250) {
        out.push(...engine.tick(now));
      }
    }

    const greeters = out.map((message) => message.username);
    expect(greeters.length).toBeGreaterThan(2);
    expect(new Set(greeters).size).toBe(greeters.length);
  });

  it("keeps message ids unique across retried speakers", () => {
    // The retry loop calls the director more than once per tick. If the
    // sequence counter did not advance on a rejected attempt, two messages in
    // the same millisecond would share an id — which React renders as a
    // duplicated or missing chat line.
    const { out } = longSession(2);
    const ids = out.map((message) => message.id);
    expect(ids.length).toBeGreaterThan(19);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("clears every viewer's history when a new session starts", () => {
    const engine = new SimulationEngine({
      seed: 8,
      now: 0,
      emotes: [],
      settings: { idleEnabled: false },
    });

    const collect = (from: number) => {
      const out: ChatMessage[] = [];
      engine.handleTranscript("hey everyone", from);
      engine.supplyReactions(
        Array.from({ length: 8 }, () => ({
          text: "yo",
          emotion: "chill" as const,
        })),
        from,
      );
      for (let now = from; now <= from + 30_000; now += 250) {
        out.push(...engine.tick(now));
      }
      return out;
    };

    const first = collect(0);
    engine.beginIntro(200_000);
    const second = collect(200_000);

    // Clearing means the same person may greet again in the new session.
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
  });
});

describe("startup arrival", () => {
  const startEngine = (settings = {}) => {
    const engine = new SimulationEngine({
      seed: 5,
      now: 0,
      emotes: FIXTURE_EMOTES,
      settings,
    });
    engine.beginIntro(0);
    return engine;
  };

  /** Ticks a started engine without ever feeding it a transcript. */
  const arrive = (engine: SimulationEngine, untilMs = 20_000) => {
    const out: ChatMessage[] = [];
    for (let now = 0; now <= untilMs; now += 250) out.push(...engine.tick(now));
    return out;
  };

  it("produces chat before the streamer has said anything", () => {
    // The reported bug: Start left the room completely silent, because intro
    // content was an AI request and nothing else was allowed to speak.
    const messages = arrive(startEngine());
    expect(messages.length).toBeGreaterThan(4);
  });

  it("needs no AI batch at all", () => {
    // Nothing supplies reactions here. Arrival is deterministic by design.
    const messages = arrive(startEngine());
    expect(messages.every((message) => message.source === "pool")).toBe(true);
  });

  it("releases them over time rather than dumping them at once", () => {
    const engine = startEngine();
    const firstTick = engine.tick(0);
    const rest = arrive(engine);

    expect(firstTick.length).toBeLessThan(4);
    expect(rest.length).toBeGreaterThan(firstTick.length);
  });

  it("uses a different viewer for every arrival line", () => {
    const names = arrive(startEngine()).map((message) => message.username);
    expect(names.length).toBeGreaterThan(4);
    expect(new Set(names).size).toBe(names.length);
  });

  it("says the kind of thing someone says walking in", () => {
    const texts = arrive(startEngine({ emotesEnabled: false })).map((m) => m.text);
    // Not an exact-match list — the pool is meant to grow — but arrival must
    // read as arrival, not as a reaction to something nobody said.
    const arrivalish = texts.filter((text) =>
      /hi|yo|hey|early|first|here|live|made it|tim(e|ing)|sup|aye|waiting|get it|stream|boot/i.test(
        text,
      ),
    );
    expect(arrivalish.length).toBe(texts.length);
  });

  it("stops the moment the streamer speaks", () => {
    const engine = startEngine();
    for (let now = 0; now <= 3_000; now += 250) engine.tick(now);

    engine.handleTranscript("okay hey chat", 3_000);
    const after: ChatMessage[] = [];
    for (let now = 3_250; now <= 12_000; now += 250) after.push(...engine.tick(now));

    // Nothing generated was supplied, so with arrival cancelled the room has
    // nothing to say. Anything here would be arrival leaking past its phase.
    expect(after).toHaveLength(0);
  });

  it("stops for typed input too, which takes the same path", () => {
    const engine = startEngine();
    for (let now = 0; now <= 3_000; now += 250) engine.tick(now);

    engine.handleTranscript("typing this instead", 3_000, 0);
    const after: ChatMessage[] = [];
    for (let now = 3_250; now <= 12_000; now += 250) after.push(...engine.tick(now));
    expect(after).toHaveLength(0);
  });

  it("closes itself if the streamer never speaks", () => {
    // Otherwise arrival suppresses idle forever and the room dies at Start.
    const engine = startEngine();
    arrive(engine, 30_000);
    expect(engine.isIntroducing).toBe(false);
  });

  it("gives a fresh arrival after a clear and restart", () => {
    const engine = startEngine();
    const first = arrive(engine);
    expect(first.length).toBeGreaterThan(4);

    engine.beginIntro(100_000);
    const second: ChatMessage[] = [];
    for (let now = 100_000; now <= 120_000; now += 250) {
      second.push(...engine.tick(now));
    }
    expect(second.length).toBeGreaterThan(4);
  });
});
