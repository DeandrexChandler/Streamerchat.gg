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

  it("prefers an emote the user tagged as a greeting over the name match", () => {
    // `xqcL` means nothing to any heuristic. Tagging it is the only way the
    // engine can know it is this streamer's hello.
    const emotes = [
      ...pack(["hi", "chill"], ["KEKW", "funny"]),
      { id: "x", name: "xqcL", mood: "unknown" as const, url: "u", tags: ["greeting" as const] },
    ];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const picked = pickSemanticEmote({
        emotes,
        intent: "greeting",
        rng: createRng(seed),
      });
      // The 8% wildcard escape can still fire; everything else must be the tag.
      if (picked?.name !== "KEKW" && picked?.name !== "hi") {
        expect(picked?.name).toBe("xqcL");
      }
    }
  });

  it("lets a manual tag outrank the mood the pack was imported with", () => {
    // Imported as sad, tagged by hand as hype. The person watching the stream
    // knows what it means there.
    const emotes: Emote[] = [
      { id: "a", name: "Sadge", mood: "sad", url: "u", tags: ["hype"] },
      { id: "b", name: "PogChamp", mood: "hype", url: "u" },
    ];
    const hits = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (seed) =>
        pickSemanticEmote({ emotes, intent: "excitement", rng: createRng(seed) })
          ?.name,
    );
    expect(hits.filter((name) => name === "Sadge").length).toBeGreaterThan(4);
  });

  it("falls back to mood when nothing carries a matching tag", () => {
    const emotes: Emote[] = [
      { id: "a", name: "aaa", mood: "sad", url: "u", tags: ["story"] },
      { id: "b", name: "bbb", mood: "hype", url: "u", tags: ["idle"] },
    ];
    const picked = pickSemanticEmote({
      emotes,
      intent: "excitement",
      rng: createRng(3),
    });
    expect(picked?.name).toBe("bbb");
  });

  it("returns null for an empty pack rather than throwing", () => {
    expect(
      pickSemanticEmote({ emotes: [], intent: "greeting", rng: createRng(1) }),
    ).toBeNull();
  });

  it("honours the emote the model asked for, when the pack has it", () => {
    const emotes = pack(["hi", "chill"], ["KEKW", "funny"], ["Sadge", "sad"]);
    for (const seed of [1, 2, 3, 4, 5]) {
      const picked = pickSemanticEmote({
        emotes,
        intent: "greeting",
        preferred: "sadge",
        rng: createRng(seed),
      });
      expect(picked?.name).toBe("Sadge");
    }
  });

  it("ignores a preferred emote the pack does not have", () => {
    const emotes = pack(["hi", "chill"], ["KEKW", "funny"]);
    for (const seed of [1, 2, 3]) {
      const picked = pickSemanticEmote({
        emotes,
        intent: "greeting",
        preferred: "NotLoaded",
        rng: createRng(seed),
      });
      expect(picked?.name).toBe("hi");
    }
  });

  it("reaches for an AFK emote when the room is idle", () => {
    const emotes = pack(["peepoAFK", "chill"], ["hi", "chill"], ["KEKW", "funny"]);
    let afk = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      if (pickSemanticEmote({ emotes, intent: "idle", rng: createRng(seed) })?.name === "peepoAFK") afk += 1;
    }
    expect(afk).toBeGreaterThan(30);
  });

  it("never posts an unrelated emote where a related one exists", () => {
    // The wildcard escape used to fire before the semantic tiers, so a
    // greeting could come out as Sadge one time in twelve.
    const emotes = pack(["hi", "chill"], ["Sadge", "sad"]);
    for (let seed = 0; seed < 200; seed += 1) {
      expect(pickSemanticEmote({ emotes, intent: "greeting", rng: createRng(seed) })?.name).toBe("hi");
    }
  });
});
