import { describe, expect, it } from "vitest";
import { pickDepth, shouldReact, type Depth } from "../attention";
import { createRng } from "../rng";
import type { Classification, Intent, Viewer } from "../types";

const classification = (patch: Partial<Classification> = {}): Classification => ({
  intent: "mundane",
  sentiment: "neutral",
  energy: 0.2,
  keywords: [],
  confidence: 0.5,
  ...patch,
});

const viewer = (patch: Partial<Viewer> = {}): Viewer => ({
  id: "v1",
  name: "tester",
  nameWords: ["tester"],
  color: "#fff",
  personality: "chatty",
  activity: 0.5,
  verbosity: 0.5,
  emoteAffinity: 0.5,
  lastSpokeAt: 0,
  ...patch,
});

const quiet = { recentVolume: 0, repeatsPrevious: false };

/** Fraction of trials in which chat decides to react. */
function reactionRate(
  c: Classification,
  context = quiet,
  trials = 3000,
): number {
  const rng = createRng(99);
  let reacted = 0;
  for (let i = 0; i < trials; i++) {
    if (shouldReact(c, context, rng)) reacted++;
  }
  return reacted / trials;
}

describe("shouldReact", () => {
  it("ALWAYS answers a direct question to chat", () => {
    // Being ignored after asking chat something directly is the one failure
    // that reads as broken rather than as realistic.
    expect(
      reactionRate(classification({ intent: "question_to_chat", confidence: 0.1 })),
    ).toBe(1);
  });

  it("answers a direct question even when chat is exhausted", () => {
    expect(
      reactionRate(classification({ intent: "question_to_chat" }), {
        recentVolume: 500,
        repeatsPrevious: true,
      }),
    ).toBe(1);
  });

  it("mostly ignores low-signal background talk", () => {
    // "okay so anyway I'm just gonna do the roof" deserves silence.
    const rate = reactionRate(
      classification({ intent: "mundane", confidence: 0.15, energy: 0.15 }),
    );
    expect(rate).toBeLessThan(0.3);
  });

  it("reliably reacts to the streamer struggling", () => {
    // Messing up is a real moment; chat sympathising is the point of the app.
    const rate = reactionRate(
      classification({ intent: "struggle", sentiment: "negative", energy: 0.4, confidence: 0.9 }),
    );
    expect(rate).toBeGreaterThan(0.55);
  });

  it("reliably reacts to excitement and achievement", () => {
    for (const intent of ["excitement", "achievement"] as Intent[]) {
      expect(
        reactionRate(classification({ intent, energy: 0.6, confidence: 0.9 })),
      ).toBeGreaterThan(0.6);
    }
  });

  it("reacts more as energy rises", () => {
    const calm = reactionRate(classification({ intent: "story", energy: 0.05 }));
    const loud = reactionRate(classification({ intent: "story", energy: 0.95 }));
    expect(loud).toBeGreaterThan(calm);
  });

  it("reacts less when the classifier is unsure", () => {
    const sure = reactionRate(classification({ intent: "showing", confidence: 1 }));
    const unsure = reactionRate(classification({ intent: "showing", confidence: 0 }));
    expect(unsure).toBeLessThan(sure);
  });

  it("reacts less to a repeated intent", () => {
    const fresh = reactionRate(classification({ intent: "story", energy: 0.2 }));
    const repeat = reactionRate(classification({ intent: "story", energy: 0.2 }), {
      recentVolume: 0,
      repeatsPrevious: true,
    });
    expect(repeat).toBeLessThan(fresh);
  });

  it("does not penalise repetition when the streamer is escalating", () => {
    // Saying "oh no. oh no no no" twice is escalation, not repetition.
    const c = classification({ intent: "struggle", energy: 0.9, confidence: 0.9 });
    const fresh = reactionRate(c);
    const repeat = reactionRate(c, { recentVolume: 0, repeatsPrevious: true });
    expect(repeat).toBeCloseTo(fresh, 1);
  });

  it("reacts less when chat has been busy", () => {
    const c = classification({ intent: "showing", confidence: 0.8 });
    const rested = reactionRate(c, { recentVolume: 0, repeatsPrevious: false });
    const tired = reactionRate(c, { recentVolume: 60, repeatsPrevious: false });
    expect(tired).toBeLessThan(rested);
  });

  it("never suppresses reaction entirely, however tired", () => {
    const rate = reactionRate(classification({ intent: "excitement", energy: 1 }), {
      recentVolume: 10_000,
      repeatsPrevious: true,
    });
    expect(rate).toBeGreaterThan(0);
  });
});

describe("pickDepth", () => {
  /** Depth distribution over many draws. */
  function mix(v: Viewer, energy = 0.3, position = 1): Record<Depth, number> {
    const rng = createRng(7);
    const counts: Record<Depth, number> = {
      ambient: 0, light: 0, engaged: 0, invested: 0,
    };
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      counts[pickDepth({ viewer: v, energy, position }, rng)]++;
    }
    for (const key of Object.keys(counts) as Depth[]) counts[key] /= trials;
    return counts;
  }

  it("makes ambient the most common depth for a typical viewer", () => {
    // Real chat is mostly emotes and single words, not a wall of statements.
    const result = mix(viewer());
    expect(result.ambient).toBeGreaterThan(result.light);
    expect(result.ambient).toBeGreaterThan(result.engaged);
    expect(result.ambient).toBeGreaterThan(result.invested);
  });

  it("keeps full sentences rare", () => {
    expect(mix(viewer()).invested).toBeLessThan(0.12);
  });

  it("makes terse viewers almost entirely ambient", () => {
    expect(mix(viewer({ verbosity: 0 })).ambient).toBeGreaterThan(0.6);
  });

  it("lets verbose viewers write more", () => {
    const terse = mix(viewer({ verbosity: 0 }));
    const wordy = mix(viewer({ verbosity: 1 }));
    expect(wordy.engaged + wordy.invested).toBeGreaterThan(
      terse.engaged + terse.invested,
    );
  });

  it("produces MORE short reactions at high energy, not fewer", () => {
    // Nobody composes a paragraph while shouting.
    const calm = mix(viewer(), 0.05);
    const excited = mix(viewer(), 0.95);
    expect(excited.ambient).toBeGreaterThan(calm.ambient);
    expect(excited.invested).toBeLessThan(calm.invested);
  });

  it("makes the first responder reflexive", () => {
    const first = mix(viewer(), 0.3, 0);
    const later = mix(viewer(), 0.3, 4);
    expect(first.ambient).toBeGreaterThan(later.ambient);
    expect(later.invested).toBeGreaterThan(first.invested);
  });
});
