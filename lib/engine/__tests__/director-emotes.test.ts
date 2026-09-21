import { describe, expect, it } from "vitest";
import { directOne, type DirectOneOptions } from "../director";
import { Population } from "../population";
import { createRng } from "../rng";
import { DEFAULT_SETTINGS } from "../../config/settings";
import type { Emote, Intent } from "../types";
import type { Topic } from "../topics";
import type { QueuedReaction } from "../../ai/reaction";
import type { GenerationPhase } from "../../ai/provider";

/**
 * Emote-forward behaviour.
 *
 * "hi" and "spam W" are answered with emotes in a real chat, not sentences.
 * These pin that down without pinning the exact ratio, which is a tuning knob.
 */

const EMOTES: Emote[] = [
  { id: "1", name: "peepoHi", mood: "chill", url: "u", tags: ["greeting"] },
  { id: "2", name: "PogChamp", mood: "hype", url: "u", tags: ["hype"] },
  { id: "3", name: "Sadge", mood: "sad", url: "u" },
  { id: "4", name: "peepoAFK", mood: "chill", url: "u" },
];

function topic(intent: Intent, extra: Partial<Topic> = {}): Topic {
  return {
    id: "t1",
    startedAt: 0,
    lastReinforcedAt: 0,
    intent,
    sentiment: "positive",
    keywords: [],
    utterance: "hi",
    seed: 0.8,
    halfLifeMs: 30_000,
    participants: new Map(),
    messagesEmitted: 0,
    ...extra,
  };
}

function reaction(text: string, intent: Intent, extra: Partial<QueuedReaction> = {}): QueuedReaction {
  return { text, emotion: "hype", batchId: 1, createdAt: 0, intent, phase: "active", ...extra };
}

function direct(
  seed: number,
  overrides: Partial<DirectOneOptions> & { intent?: Intent; phase?: GenerationPhase } = {},
) {
  const { intent = "greeting", phase = "active", ...rest } = overrides;
  return directOne({
    topic: phase === "active" ? topic(intent) : null,
    stage: "reacting",
    band: "viral",
    population: new Population(createRng(seed + 1000), 20),
    settings: DEFAULT_SETTINGS,
    emotes: EMOTES,
    reaction: reaction("some generated sentence", intent, { phase }),
    phase,
    recentSpeakers: [],
    now: 1_000,
    sequence: seed,
    rng: createRng(seed),
    ...rest,
  });
}

/** Runs the director many times and reports what fraction was emotes only. */
function emoteShare(
  intent: Intent,
  overrides: Partial<DirectOneOptions> & { phase?: GenerationPhase } = {},
  runs = 120,
): number {
  const names = new Set(EMOTES.map((emote) => emote.name));
  let emoteOnly = 0;
  let produced = 0;

  for (let seed = 0; seed < runs; seed += 1) {
    const result = direct(seed, { intent, ...overrides });
    if (!result) continue;
    produced += 1;
    const words = result.message.text.split(" ");
    if (words.every((word) => names.has(word))) emoteOnly += 1;
  }

  expect(produced).toBeGreaterThan(50);
  return emoteOnly / produced;
}

describe("emote-forward responses", () => {
  it("answers a greeting mostly in words, with emotes mixed through", () => {
    // Words carry the answer; emotes punctuate it. A majority of bare
    // emotes is how "hello can yall hear me" got a wall of waves, but too
    // few and they land so far apart that chat reads as a block of prose.
    const share = emoteShare("greeting");
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.45);
  });

  it("keeps hype emote-only lines a minority, but a visible one", () => {
    const share = emoteShare("excitement");
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.5);
  });

  it("never staples an emote onto a line the model gave no feeling for", () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const result = direct(seed, {
        intent: "story",
        reaction: { text: "so what happened next", batchId: 1, createdAt: 0, intent: "story", phase: "active" },
      });
      if (result) expect(result.message.text).toBe("so what happened next");
    }
  });

  it("still answers a story with words", () => {
    // Replacing an actual reply with a wall of emotes is the failure mode on
    // the other side of this feature.
    expect(emoteShare("story")).toBeLessThan(0.4);
  });

  it("posts the occasional idle emote during idle, not a wall of them", () => {
    const share = emoteShare("mundane", { phase: "idle" });
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.3);
  });

  it("reaches for an AFK emote when idle, not a greeting", () => {
    let afk = 0;
    let hi = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const text = direct(seed, { intent: "mundane", phase: "idle" })?.message.text ?? "";
      if (text.includes("peepoAFK")) afk += 1;
      if (text.includes("peepoHi")) hi += 1;
    }
    expect(afk).toBeGreaterThan(hi);
  });

  it("uses only emotes related to the moment", () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const result = direct(seed, { reaction: reaction("hey", "greeting") });
      // Sadge is tagged for nothing and reads as sad; a greeting must not
      // reach for it beyond the deliberate wildcard escape.
      if (result?.message.text.includes("Sadge")) {
        expect(result.message.text).not.toBe("Sadge");
      }
    }
  });

  it("honours the emote the model asked for when the pack has it", () => {
    let honoured = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const result = direct(seed, {
        intent: "story",
        reaction: reaction("no way that happened", "story", { emote: "Sadge" }),
      });
      if (result?.message.text.includes("Sadge")) honoured += 1;
    }
    // Every worded story line with a stated preference should carry it,
    // minus the wildcard escape.
    expect(honoured).toBeGreaterThan(45);
  });

  it("ignores an emote the model invented", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const result = direct(seed, {
        intent: "story",
        reaction: reaction("no way", "story", { emote: "NotARealEmote" }),
      });
      expect(result?.message.text ?? "").not.toContain("NotARealEmote");
    }
  });

  // No pack is the only way to turn emotes off: there is no toggle, and no
  // default pack, so a fresh install runs as pure text until one is imported.
  it("never posts emotes when the pack is empty", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const result = direct(seed, { emotes: [], reaction: reaction("hey", "greeting") });
      if (result) expect(result.message.text).toBe("hey");
    }
  });

  it("labels the source honestly", () => {
    const sources = new Set<string>();
    for (let seed = 0; seed < 80; seed += 1) {
      const result = direct(seed);
      if (result) sources.add(result.message.source);
    }
    expect(sources).toEqual(new Set(["ai", "emote"]));
  });

  it("is reproducible for a given seed", () => {
    const run = () =>
      direct(42, {
        population: new Population(createRng(7), 20),
        reaction: reaction("hey", "greeting"),
        sequence: 1,
      })?.message.text;
    expect(run()).toBe(run());
  });
});

describe("directives", () => {
  it("spams the requested token while the moment is hot", () => {
    let complied = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const result = direct(seed, {
        intent: "directive",
        topic: topic("directive", { directiveTarget: "W" }),
        reaction: reaction("ok chat W", "directive"),
      });
      if (result && /^(W ?)+$/.test(result.message.text)) complied += 1;
    }
    expect(complied).toBeGreaterThan(60);
  });

  it("marks the token as a directive, not as the model's words", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const result = direct(seed, {
        intent: "directive",
        topic: topic("directive", { directiveTarget: "W" }),
        reaction: reaction("ok chat", "directive"),
      });
      if (result && /^(W ?)+$/.test(result.message.text)) {
        expect(result.message.source).toBe("directive");
      }
    }
  });
});

describe("emote-only mode", () => {
  it("renders every line as emotes", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const result = direct(seed, {
        intent: "story",
        settings: { ...DEFAULT_SETTINGS, emoteOnlyMode: true },
        reaction: reaction("a whole sentence", "story"),
      });
      if (!result) continue;
      const names = new Set(EMOTES.map((e) => e.name));
      expect(result.message.text.split(" ").every((w) => names.has(w))).toBe(true);
      expect(result.message.source).toBe("emote");
    }
  });

  it("waits rather than posting blanks with no emotes loaded", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(
        direct(seed, { emotes: [], settings: { ...DEFAULT_SETTINGS, emoteOnlyMode: true } }),
      ).toBeNull();
    }
  });
});
