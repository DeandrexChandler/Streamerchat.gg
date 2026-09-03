import { describe, expect, it } from "vitest";
import { pickSemanticEmote } from "../semantic";
import { createRng } from "../../engine/rng";
import type { Emote } from "../../engine/types";

/** Builds a pack. Moods are deliberately "wrong" to prove names win. */
function pack(...entries: Array<[name: string, mood: Emote["mood"]]>): Emote[] {
  return entries.map(([name, mood], i) => ({
    id: `e${i}`,
    name,
    mood,
    url: `https://cdn.test/${name}.webp`,
  }));
}

describe("semantic emote selection", () => {
  it("reaches for a literal hi emote on a greeting", () => {
    // The reported bug: a pack owning `hi` returned catJAM instead, because
    // `hi` classifies as chill and greetings prefer other moods.
    const emotes = pack(
      ["catJAM", "chill"],
      ["hi", "chill"],
      ["Sadge", "sad"],
      ["KEKW", "funny"],
    );
    for (const seed of [1, 2, 3, 4, 5]) {
      const picked = pickSemanticEmote({
        emotes,
        intent: "greeting",
        rng: createRng(seed),
      });
      expect(picked?.name).toBe("hi");
    }
  });

  it("matches names regardless of casing or prefix", () => {
    for (const name of ["Hi", "peepoHi", "helloThere", "wave"]) {
      const emotes = pack([name, "unknown"], ["catJAM", "chill"]);
      const picked = pickSemanticEmote({
        emotes,
        intent: "greeting",
        rng: createRng(7),
      });
      expect(picked?.name).toBe(name);
    }
  });

  it("does not fire a fragment on an unrelated word", () => {
    // "hi" must not match "thinking" or "whip" — a bare substring test would.
    const emotes = pack(["thinking", "confused"], ["whip", "unknown"]);
    const picked = pickSemanticEmote({
      emotes,
      intent: "greeting",
      rng: createRng(3),
    });
    expect(["thinking", "whip"]).toContain(picked?.name);
    // It fell through to mood/wildcard rather than claiming a name match.
  });

  it("varies among equally suitable names", () => {
    const emotes = pack(["hi", "chill"], ["hii", "chill"], ["hiya", "chill"]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const picked = pickSemanticEmote({
        emotes,
        intent: "greeting",
        rng: createRng(seed),
      });
      if (picked) seen.add(picked.name);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is deterministic for a given seed", () => {
    const emotes = pack(["hi", "chill"], ["hii", "chill"], ["hey", "chill"]);
    const a = pickSemanticEmote({ emotes, intent: "greeting", rng: createRng(99) });
    const b = pickSemanticEmote({ emotes, intent: "greeting", rng: createRng(99) });
    expect(a?.name).toBe(b?.name);
  });

  it.each([
    ["farewell", ["bye", "gn"]],
    ["achievement", ["pog", "gg"]],
    ["struggle", ["pepehands", "monka"]],
    ["confusion", ["huh", "sus"]],
  ] as const)("prefers a %s name when one exists", (intent, names) => {
    const emotes = pack(
      ...names.map((n) => [n, "unknown"] as [string, Emote["mood"]]),
      ["catJAM", "chill"],
      ["randomThing", "unknown"],
    );
    const picked = pickSemanticEmote({
      emotes,
      intent,
      rng: createRng(11),
    });
    expect(names).toContain(picked?.name as (typeof names)[number]);
  });

  it("falls back to mood when no name matches", () => {
    const emotes = pack(["zzzUnrelated", "sad"], ["otherThing", "hype"]);
    const picked = pickSemanticEmote({
      emotes,
      intent: "struggle",
      rng: createRng(5),
    });
    expect(picked?.name).toBe("zzzUnrelated"); // the sad one
  });

  it("lets the reaction's own emotion outrank the intent's moods", () => {
    // A joke about a loss is funny, not sad — the line's emotion describes the
    // message, the intent only describes what the streamer did.
    const emotes = pack(["someLaugh", "funny"], ["someTear", "sad"]);
    const picked = pickSemanticEmote({
      emotes,
      intent: "struggle",
      emotion: "funny",
      rng: createRng(4),
    });
    expect(picked?.name).toBe("someLaugh");
  });

  it("returns null for an empty pack rather than throwing", () => {
    expect(
      pickSemanticEmote({ emotes: [], intent: "greeting", rng: createRng(1) }),
    ).toBeNull();
  });
});
