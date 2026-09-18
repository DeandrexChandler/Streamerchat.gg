import { describe, expect, it } from "vitest";
import { shouldReact } from "../attention";
import { createRng } from "../rng";
import type { Classification, Intent } from "../types";

const classification = (patch: Partial<Classification> = {}): Classification => ({
  intent: "mundane",
  sentiment: "neutral",
  energy: 0.2,
  keywords: [],
  confidence: 0.5,
  ...patch,
});


const quiet = { recentVolume: 0, repeatsPrevious: false, repeatedAfterIgnore: false };

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
        repeatedAfterIgnore: false,
      }),
    ).toBe(1);
  });

  it("answers most casual talk and still skips a little", () => {
    /**
     * `mundane` is around 60% of natural speech, so this band is the
     * product's response rate. It was capped at 0.3, then 0.8 with two
     * dampers that were always firing once chat became continuous; both
     * read as chat ignoring the streamer. The gate keeps a small skip so
     * chat is not a metronome, and that is all it keeps.
     */
    const rate = reactionRate(
      classification({ intent: "mundane", confidence: 0.15, energy: 0.15 }),
    );
    expect(rate).toBeGreaterThan(0.75);
    expect(rate).toBeLessThan(0.97);
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

  it("does not penalise a repeated intent", () => {
    // `mundane` is the majority bucket, so "same intent as last time" was
    // true for nearly every consecutive sentence and normal speech carried
    // a permanent penalty for not changing subject.
    const fresh = reactionRate(classification({ intent: "story", energy: 0.2 }));
    const repeat = reactionRate(classification({ intent: "story", energy: 0.2 }), {
      recentVolume: 0,
      repeatsPrevious: true,
      repeatedAfterIgnore: false,
    });
    expect(repeat).toBeCloseTo(fresh, 1);
  });

  it("does not penalise repetition when the streamer is escalating", () => {
    // Saying "oh no. oh no no no" twice is escalation, not repetition.
    const c = classification({ intent: "struggle", energy: 0.9, confidence: 0.9 });
    const fresh = reactionRate(c);
    const repeat = reactionRate(c, { recentVolume: 0, repeatsPrevious: true, repeatedAfterIgnore: false });
    expect(repeat).toBeCloseTo(fresh, 1);
  });

  it("does not tire out — chat is always busy now", () => {
    // Fatigue was tuned for a chat that went quiet between utterances. With
    // continuous chat "recent volume" sat at its cap permanently, which cost
    // three in ten of everything the streamer said.
    const c = classification({ intent: "showing", confidence: 0.8 });
    const rested = reactionRate(c, { recentVolume: 0, repeatsPrevious: false, repeatedAfterIgnore: false });
    const busy = reactionRate(c, { recentVolume: 60, repeatsPrevious: false, repeatedAfterIgnore: false });
    expect(busy).toBeCloseTo(rested, 1);
  });

  it("never suppresses reaction entirely, however tired", () => {
    const rate = reactionRate(classification({ intent: "excitement", energy: 1 }), {
      recentVolume: 10_000,
      repeatsPrevious: true,
      repeatedAfterIgnore: false,
    });
    expect(rate).toBeGreaterThan(0);
  });
});

describe("attention over natural speech", () => {
  const NATURAL: Array<Partial<Classification>> = [
    { intent: "mundane", confidence: 0.15, energy: 0.04 },
    { intent: "mundane", confidence: 0.15, energy: 0.03 },
    { intent: "mundane", confidence: 0.15, energy: 0.11 },
    { intent: "mundane", confidence: 0.15, energy: 0.01 },
    { intent: "mundane", confidence: 0.15, energy: 0.05 },
    { intent: "confusion", confidence: 0.8, energy: 0.02 },
    { intent: "excitement", confidence: 0.87, energy: 0.01 },
    { intent: "achievement", confidence: 0.75, energy: 0.07 },
    { intent: "struggle", confidence: 0.9, energy: 0.12 },
    { intent: "showing", confidence: 0.95, energy: 0.05 },
  ];

  function rate(repeatsIntent: boolean, volume: number): number {
    const rng = createRng(11);
    let reacted = 0;
    const runs = 40;
    for (let i = 0; i < runs; i += 1) {
      for (const patch of NATURAL) {
        if (
          shouldReact(
            classification(patch),
            { recentVolume: volume, repeatsPrevious: repeatsIntent, repeatedAfterIgnore: false },
            rng,
          )
        ) {
          reacted += 1;
        }
      }
    }
    return reacted / (runs * NATURAL.length);
  }

  it("reacts to most of what is said", () => {
    expect(rate(false, 12)).toBeGreaterThan(0.6);
  });

  it("still holds up while chat is busy", () => {
    expect(rate(false, 40)).toBeGreaterThan(0.45);
  });

  it("is not crushed by consecutive utterances sharing an intent", () => {
    // Talking normally means several mundane sentences in a row. That must not
    // read as "repeating yourself".
    expect(rate(true, 12)).toBeGreaterThan(0.55);
  });

  it("still ignores some things — chat is not a metronome", () => {
    expect(rate(false, 12)).toBeLessThan(0.95);
  });
});

describe("repeating yourself", () => {
  it("answers a repeat that followed silence", () => {
    // Saying it again right after being ignored means it did not land.
    // Treating that as less interesting is exactly backwards.
    const rng = createRng(5);
    let reacted = 0;
    for (let i = 0; i < 200; i += 1) {
      if (
        shouldReact(
          classification({ intent: "mundane", confidence: 0.15, energy: 0.03 }),
          { recentVolume: 20, repeatsPrevious: true, repeatedAfterIgnore: true },
          rng,
        )
      ) {
        reacted += 1;
      }
    }
    expect(reacted / 200).toBeGreaterThan(0.8);
  });

  it("a direct question is always answered", () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i += 1) {
      expect(
        shouldReact(
          classification({ intent: "question_to_chat", confidence: 1 }),
          { recentVolume: 200, repeatsPrevious: true, repeatedAfterIgnore: false },
          rng,
        ),
      ).toBe(true);
    }
  });
});
