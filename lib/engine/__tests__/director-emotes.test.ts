import { describe, expect, it } from "vitest";
import { directOne } from "../director";
import { Population } from "../population";
import { createRng } from "../rng";
import { DEFAULT_SETTINGS } from "../../config/settings";
import type { Emote, Intent } from "../types";
import type { Topic } from "../topics";
import type { QueuedReaction } from "../../ai/reaction";

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

function reaction(text: string): QueuedReaction {
  return { text, emotion: "hype", batchId: 1, createdAt: 0 };
}

/** Runs the director many times and reports what fraction was emotes only. */
function emoteShare(intent: Intent, emotes = EMOTES, runs = 120): number {
  const names = new Set(emotes.map((emote) => emote.name));
  let emoteOnly = 0;
  let produced = 0;

  for (let seed = 0; seed < runs; seed += 1) {
    const rng = createRng(seed);
    const population = new Population(createRng(seed + 1000), 20);
    const result = directOne({
      topic: topic(intent),
      stage: "reacting",
      band: "viral",
      population,
      settings: { ...DEFAULT_SETTINGS, emotesEnabled: true },
      emotes,
      reaction: reaction("some generated sentence"),
      recentTexts: new Set(),
      recentSpeakers: [],
      now: 1_000,
      silentMs: 0,
      sequence: seed,
      rng,
    });
    if (!result) continue;
    produced += 1;
    const words = result.message.text.split(" ");
    if (words.every((word) => names.has(word))) emoteOnly += 1;
  }

  expect(produced).toBeGreaterThan(50);
  return emoteOnly / produced;
}

describe("emote-forward responses", () => {
  it("answers a greeting mostly with emotes", () => {
    expect(emoteShare("greeting")).toBeGreaterThan(0.5);
  });

  it("answers hype mostly with emotes", () => {
    expect(emoteShare("excitement")).toBeGreaterThan(0.3);
  });

  it("still answers a story with words", () => {
    // Replacing an actual reply with a wall of emotes is the failure mode on
    // the other side of this feature.
    expect(emoteShare("story")).toBeLessThan(0.15);
  });

  it("uses only emotes related to the moment", () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const result = directOne({
        topic: topic("greeting"),
        stage: "reacting",
        band: "viral",
        population: new Population(createRng(seed + 1000), 20),
        settings: { ...DEFAULT_SETTINGS, emotesEnabled: true },
        emotes: EMOTES,
        reaction: reaction("hey"),
        recentTexts: new Set(),
        recentSpeakers: [],
        now: 1_000,
        silentMs: 0,
        sequence: seed,
        rng: createRng(seed),
      });
      // Sadge is tagged for nothing and reads as sad; a greeting must not
      // reach for it beyond the deliberate wildcard escape.
      if (result?.message.text.includes("Sadge")) {
        expect(result.message.text).not.toBe("Sadge");
      }
    }
  });

  it("leaves the generated line alone when emotes are switched off", () => {
    expect(emoteShareWithEmotesOff()).toBe(0);
  });

  it("never posts emotes when the pack is empty", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const result = directOne({
        topic: topic("greeting"),
        stage: "reacting",
        band: "viral",
        population: new Population(createRng(seed + 1000), 20),
        settings: { ...DEFAULT_SETTINGS, emotesEnabled: true },
        emotes: [],
        reaction: reaction("hey"),
        recentTexts: new Set(),
        recentSpeakers: [],
        now: 1_000,
        silentMs: 0,
        sequence: seed,
        rng: createRng(seed),
      });
      if (result) expect(result.message.text).toBe("hey");
    }
  });

  it("is reproducible for a given seed", () => {
    const run = () =>
      directOne({
        topic: topic("greeting"),
        stage: "reacting",
        band: "viral",
        population: new Population(createRng(7), 20),
        settings: { ...DEFAULT_SETTINGS, emotesEnabled: true },
        emotes: EMOTES,
        reaction: reaction("hey"),
        recentTexts: new Set(),
        recentSpeakers: [],
        now: 1_000,
        silentMs: 0,
        sequence: 1,
        rng: createRng(42),
      })?.message.text;
    expect(run()).toBe(run());
  });
});

/** Greetings with emotes disabled: counts lines the director altered. */
function emoteShareWithEmotesOff(): number {
  let emoteOnly = 0;
  for (let seed = 0; seed < 60; seed += 1) {
    const result = directOne({
      topic: topic("greeting"),
      stage: "reacting",
      band: "viral",
      population: new Population(createRng(seed + 1000), 20),
      settings: { ...DEFAULT_SETTINGS, emotesEnabled: false },
      emotes: EMOTES,
      reaction: reaction("hey there"),
      recentTexts: new Set(),
      recentSpeakers: [],
      now: 1_000,
      silentMs: 0,
      sequence: seed,
      rng: createRng(seed),
    });
    if (result && result.message.text !== "hey there") emoteOnly += 1;
  }
  return emoteOnly;
}
