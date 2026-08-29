import { describe, expect, it } from "vitest";
import { canFill, decorateWithEmotes, fill, generateFromPool, pickEmote } from "../generators/pool";
import { createRng } from "../rng";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import type { ResponseEntry, Viewer } from "../types";

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

describe("canFill", () => {
  it("accepts an entry with no slots", () => {
    expect(canFill({ text: "nice" }, { keywords: [], emotes: [] })).toBe(true);
  });

  it("rejects a {kw} entry when no keywords exist", () => {
    expect(canFill({ text: "the {kw} though" }, { keywords: [], emotes: [] })).toBe(false);
  });

  it("accepts a {kw} entry when a keyword exists", () => {
    expect(canFill({ text: "the {kw} though" }, { keywords: ["roof"], emotes: [] })).toBe(true);
  });

  it("rejects a {user} entry with no reply target", () => {
    expect(canFill({ text: "@{user} same" }, { keywords: [], emotes: [] })).toBe(false);
  });
});

describe("fill", () => {
  it("substitutes keyword and user slots", () => {
    const rng = createRng(1);
    expect(fill({ text: "the {kw} though" }, { keywords: ["roof"], emotes: [] }, rng))
      .toBe("the roof though");
    expect(fill({ text: "@{user} same" }, { keywords: [], emotes: [], replyTo: "bob" }, rng))
      .toBe("@bob same");
  });

  it("replaces every occurrence of a slot", () => {
    const rng = createRng(1);
    expect(fill({ text: "{kw} {kw}" }, { keywords: ["roof"], emotes: [] }, rng))
      .toBe("roof roof");
  });
});

describe("generateFromPool", () => {
  const entries: ResponseEntry[] = [
    { text: "alpha" },
    { text: "beta" },
    { text: "gamma" },
  ];

  it("returns text and the template it came from", () => {
    const result = generateFromPool(entries, viewer(), {}, { keywords: [], emotes: [] }, createRng(1));
    expect(result).not.toBeNull();
    expect(entries.map((e) => e.text)).toContain(result!.template);
  });

  it("returns null when nothing is fillable", () => {
    const result = generateFromPool(
      [{ text: "the {kw}" }],
      viewer(),
      {},
      { keywords: [], emotes: [] },
      createRng(1),
    );
    expect(result).toBeNull();
  });

  it("avoids recently-used templates", () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const result = generateFromPool(
        entries,
        viewer(),
        {},
        { keywords: [], emotes: [], recentTexts: new Set(["alpha", "beta"]) },
        rng,
      );
      expect(result!.template).toBe("gamma");
    }
  });

  it("allows a repeat rather than falling silent when the pool is exhausted", () => {
    const result = generateFromPool(
      entries,
      viewer(),
      {},
      { keywords: [], emotes: [], recentTexts: new Set(["alpha", "beta", "gamma"]) },
      createRng(1),
    );
    expect(result).not.toBeNull();
  });

  it("biases toward tags the personality favours", () => {
    const rng = createRng(9);
    const tagged: ResponseEntry[] = [
      { text: "hyped", tags: ["hype"] },
      { text: "plain" },
    ];
    let hyped = 0;
    for (let i = 0; i < 500; i++) {
      const r = generateFromPool(tagged, viewer(), { hype: 8 }, { keywords: [], emotes: [] }, rng);
      if (r!.template === "hyped") hyped++;
    }
    expect(hyped / 500).toBeGreaterThan(0.7);
  });

  it("favours short entries for terse viewers", () => {
    const rng = createRng(3);
    const mixed: ResponseEntry[] = [
      { text: "W", length: "tiny" },
      { text: "a much longer sentence", length: "long" },
    ];
    let tiny = 0;
    for (let i = 0; i < 500; i++) {
      const r = generateFromPool(mixed, viewer({ verbosity: 0 }), {}, { keywords: [], emotes: [] }, rng);
      if (r!.template === "W") tiny++;
    }
    expect(tiny / 500).toBeGreaterThan(0.8);
  });
});

describe("pickEmote", () => {
  it("returns null with no emotes", () => {
    expect(pickEmote([], "excitement", "positive", createRng(1))).toBeNull();
  });

  it("strongly prefers moods matching the intent", () => {
    // Regression: random selection produced "monkaS Sadge PogU", mixing grief
    // and hype in one message.
    const rng = createRng(4);
    let onMood = 0;
    for (let i = 0; i < 500; i++) {
      const emote = pickEmote(FIXTURE_EMOTES, "struggle", "negative", rng)!;
      if (["sad", "funny", "love"].includes(emote.mood)) onMood++;
    }
    expect(onMood / 500).toBeGreaterThan(0.8);
  });

  it("suppresses hype emotes on negative sentiment", () => {
    const rng = createRng(6);
    let hype = 0;
    for (let i = 0; i < 500; i++) {
      if (pickEmote(FIXTURE_EMOTES, "struggle", "negative", rng)!.mood === "hype") hype++;
    }
    expect(hype / 500).toBeLessThan(0.05);
  });
});

describe("decorateWithEmotes", () => {
  const context = { intent: "excitement", sentiment: "positive" } as const;

  it("returns the text unchanged with no emotes available", () => {
    expect(decorateWithEmotes("hello", viewer(), [], context, createRng(1))).toBe("hello");
  });

  it("never decorates a viewer with zero emote affinity", () => {
    const rng = createRng(2);
    const v = viewer({ emoteAffinity: 0, verbosity: 0.5 });
    for (let i = 0; i < 100; i++) {
      expect(decorateWithEmotes("hello", v, FIXTURE_EMOTES, context, rng)).toBe("hello");
    }
  });

  it("repeats a single emote rather than mixing different ones", () => {
    // Real emote spam is "KEKW KEKW KEKW", not three different emotes.
    const rng = createRng(8);
    const v = viewer({ verbosity: 0, emoteAffinity: 1 });
    for (let i = 0; i < 200; i++) {
      const out = decorateWithEmotes("x", v, FIXTURE_EMOTES, context, rng);
      const tokens = out.split(" ");
      if (tokens.length > 1 && !tokens.includes("x")) {
        expect(new Set(tokens).size).toBe(1);
      }
    }
  });
});

describe("streamer and topic slots", () => {
  const entry = { text: "how's it going {streamer}" };
  const topicEntry = { text: "wait is this {topic}" };

  it("is unfillable when no streamer name is set", () => {
    expect(canFill(entry, { keywords: [], emotes: [] })).toBe(false);
  });

  it("is fillable once a streamer name is set", () => {
    expect(canFill(entry, { keywords: [], emotes: [], streamer: "dre" })).toBe(true);
  });

  it("substitutes the streamer name", () => {
    const out = fill(entry, { keywords: [], emotes: [], streamer: "dre" }, createRng(1));
    expect(out).toBe("how's it going dre");
  });

  it("is unfillable when no topic is set", () => {
    expect(canFill(topicEntry, { keywords: [], emotes: [] })).toBe(false);
  });

  it("substitutes the topic", () => {
    const out = fill(topicEntry, { keywords: [], emotes: [], topic: "minecraft" }, createRng(1));
    expect(out).toBe("wait is this minecraft");
  });

  it("treats an empty string as unset, since that is the schema default", () => {
    expect(canFill(entry, { keywords: [], emotes: [], streamer: "" })).toBe(false);
  });
});
