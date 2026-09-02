import { describe, expect, it } from "vitest";
import { TopicTracker, MAX_TOPICS, TOPIC_FLOOR } from "../topics";
import type { Classification } from "../types";

function classification(patch: Partial<Classification> = {}): Classification {
  return {
    intent: "mundane",
    sentiment: "neutral",
    energy: 0.2,
    keywords: [],
    confidence: 0.5,
    ...patch,
  };
}

const BIG = classification({
  intent: "achievement",
  sentiment: "positive",
  energy: 0.9,
  confidence: 1,
  keywords: ["boss"],
});
const SMALL = classification({ intent: "mundane", confidence: 0.15, energy: 0.05 });

describe("momentum seeding", () => {
  it("rates an achievement far above background muttering", () => {
    const t = new TopicTracker();
    const big = t.observe(BIG, "BRO I JUST BEAT IT", 0)!;
    const small = new TopicTracker().observe(SMALL, "im grabbing some water", 0)!;
    expect(big.seed).toBeGreaterThan(small.seed * 2.5);
  });

  it("gives a directive a high floor even when said flatly", () => {
    const t = new TopicTracker();
    const topic = t.observe(
      classification({ intent: "directive", energy: 0.05, confidence: 1 }),
      "spam W",
      0,
    )!;
    expect(topic.seed).toBeGreaterThanOrEqual(0.75);
  });

  it("gives a direct question the same floor", () => {
    const t = new TopicTracker();
    const topic = t.observe(
      classification({ intent: "question_to_chat", energy: 0.05, confidence: 1 }),
      "chat what do you think",
      0,
    )!;
    expect(topic.seed).toBeGreaterThanOrEqual(0.75);
  });
});

describe("decay", () => {
  it("halves over one half-life", () => {
    const t = new TopicTracker();
    const topic = t.observe(BIG, "beat it", 0)!;
    const half = t.momentumOf(topic, topic.halfLifeMs);
    expect(half).toBeCloseTo(topic.seed / 2, 2);
  });

  it("an interesting event outlives a boring one", () => {
    const big = new TopicTracker();
    big.observe(BIG, "beat it", 0);
    const small = new TopicTracker();
    small.observe(SMALL, "grabbing water", 0);

    // 25 seconds later the boring one is gone and the big one is not.
    big.prune(25_000);
    small.prune(25_000);
    expect(big.active(25_000).length).toBe(1);
    expect(small.active(25_000).length).toBe(0);
  });

  it("removes a topic once it falls under the floor", () => {
    const t = new TopicTracker();
    const topic = t.observe(BIG, "beat it", 0)!;
    // Far enough out that decay is well below the floor.
    const late = topic.halfLifeMs * 8;
    expect(t.momentumOf(topic, late)).toBeLessThan(TOPIC_FLOOR);
    t.prune(late);
    expect(t.active(late)).toHaveLength(0);
  });

  it("never keeps a topic past its absolute lifetime", () => {
    const t = new TopicTracker();
    // Reinforced constantly, so decay alone would never remove it.
    for (let at = 0; at <= 200_000; at += 5_000) t.observe(BIG, "beat it", at);
    t.prune(200_000);
    for (const topic of t.active(200_000)) {
      expect(200_000 - topic.startedAt).toBeLessThanOrEqual(180_000);
    }
  });
});

describe("reinforcement", () => {
  it("sustains one topic rather than starting a second", () => {
    const t = new TopicTracker();
    t.observe(BIG, "I beat the boss", 0);
    t.observe(BIG, "the boss is finally down", 4_000);
    expect(t.active(4_000)).toHaveLength(1);
  });

  it("resets the decay clock, so a fed topic lives longer", () => {
    const fed = new TopicTracker();
    fed.observe(BIG, "beat the boss", 0);
    fed.observe(BIG, "that boss took forever", 15_000);

    const ignored = new TopicTracker();
    ignored.observe(BIG, "beat the boss", 0);

    expect(fed.momentumOf(fed.active(20_000)[0], 20_000)).toBeGreaterThan(
      ignored.momentumOf(ignored.active(20_000)[0], 20_000),
    );
  });

  it("starts a separate topic for unrelated content", () => {
    const t = new TopicTracker();
    t.observe(BIG, "I beat the boss", 0);
    t.observe(
      classification({ intent: "question_to_chat", keywords: ["dinner"], confidence: 1 }),
      "chat what should I eat later",
      2_000,
    );
    expect(t.active(2_000).length).toBe(2);
  });
});

describe("concurrency", () => {
  function distinct(i: number) {
    return classification({
      intent: "showing",
      energy: 0.6,
      confidence: 0.9,
      keywords: [`thing${i}`],
    });
  }

  it("runs several conversations at once", () => {
    const t = new TopicTracker();
    for (let i = 0; i < MAX_TOPICS; i++) t.observe(distinct(i), `subject ${i}`, i * 500);
    expect(t.active(2_000)).toHaveLength(MAX_TOPICS);
  });

  it("evicts the weakest when full", () => {
    const t = new TopicTracker();
    t.observe(SMALL, "boring thing", 0);
    for (let i = 0; i < MAX_TOPICS; i++) t.observe(distinct(i), `subject ${i}`, 100 + i * 100);
    const utterances = t.active(1_000).map((x) => x.utterance);
    expect(utterances).not.toContain("boring thing");
  });

  it("never lets background muttering evict a directive", () => {
    const t = new TopicTracker();
    t.observe(
      classification({ intent: "directive", energy: 0.5, confidence: 1, keywords: ["spam"] }),
      "spam W",
      0,
    );
    for (let i = 0; i < MAX_TOPICS + 3; i++) {
      t.observe(classification({ confidence: 0.15, keywords: [`filler${i}`] }), `filler ${i}`, 100 + i * 100);
    }
    expect(t.active(2_000).some((x) => x.intent === "directive")).toBe(true);
  });
});

describe("stages", () => {
  it("walks from reacting through to referencing", () => {
    const t = new TopicTracker();
    const topic = t.observe(BIG, "beat it", 0)!;
    expect(t.stageOf(topic, 500)).toBe("reacting");
    expect(t.stageOf(topic, 6_000)).toBe("developing");
    expect(t.stageOf(topic, 20_000)).toBe("referencing");
  });
});

describe("participants", () => {
  it("remembers who has spoken in a topic", () => {
    const t = new TopicTracker();
    const topic = t.observe(BIG, "beat it", 0)!;
    t.recordParticipation(topic, "v1");
    t.recordParticipation(topic, "v1");
    t.recordParticipation(topic, "v2");
    expect(topic.participants.get("v1")).toBe(2);
    expect(topic.participants.size).toBe(2);
  });
});
