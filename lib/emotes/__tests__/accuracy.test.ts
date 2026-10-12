import { describe, expect, it } from "vitest";
import { emotesForPrompt, pickSemanticEmote } from "../semantic";
import { meaningsOf } from "../meaning";
import { createRng } from "../../engine/rng";
import type { Emote } from "../../engine/types";

/**
 * Choosing the right emote for a moment.
 *
 * The rule these all turn on: an emote is posted because it fits, never
 * because it exists. A pack is mostly channel in-jokes whose names mean
 * nothing outside that channel, and the old selector would reach for them
 * as wildcards — `hazelMoment` answering a death, `gachiBASS` answering
 * hello. A line of text with no emote is the better answer.
 */

/** A pack of the shapes a real import contains. */
const PACK: Emote[] = [
  { id: "1", name: "hi", mood: "chill", url: "u" },
  { id: "2", name: "peepoHi", mood: "chill", url: "u" },
  { id: "3", name: "W", mood: "hype", url: "u" },
  { id: "4", name: "GG", mood: "hype", url: "u" },
  { id: "5", name: "KEKW", mood: "funny", url: "u" },
  { id: "6", name: "LUL", mood: "funny", url: "u" },
  { id: "7", name: "Sadge", mood: "sad", url: "u" },
  { id: "8", name: "PepeHands", mood: "sad", url: "u" },
  { id: "9", name: "Pog", mood: "hype", url: "u" },
  { id: "10", name: "bedge", mood: "chill", url: "u" },
  // The rest of any real pack: names that mean nothing to anyone else.
  { id: "11", name: "hazelMoment", mood: "unknown", url: "u" },
  { id: "12", name: "gachiBASS", mood: "unknown", url: "u" },
  { id: "13", name: "forsenCD", mood: "unknown", url: "u" },
];

const pick = (options: Parameters<typeof pickSemanticEmote>[0]) =>
  pickSemanticEmote(options)?.name;

/** What this moment produces across many seeds. */
function spread(options: Omit<Parameters<typeof pickSemanticEmote>[0], "rng">, runs = 40) {
  const seen = new Map<string, number>();
  for (let seed = 0; seed < runs; seed += 1) {
    const name = pick({ ...options, rng: createRng(seed) }) ?? "(none)";
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  return seen;
}

describe("emote accuracy", () => {
  it("takes a hand tag over anything read from the name", () => {
    const emotes: Emote[] = [
      ...PACK,
      // The streamer's own hello, which no heuristic could ever guess.
      { id: "x", name: "forsenCD", mood: "unknown", url: "u", tags: ["greeting"] },
    ];
    const names = spread({ emotes, intent: "greeting" });
    expect(names.get("forsenCD")).toBe(40);
  });

  it("finds an untagged hi emote for a greeting", () => {
    const names = spread({ emotes: PACK, intent: "greeting" });
    expect([...names.keys()].sort()).toEqual(["hi", "peepoHi"]);
  });

  it("answers spam W with agreement, victory or hype — not only a literal W", () => {
    const withoutW = PACK.filter((emote) => emote.name !== "W");
    const names = spread({ emotes: withoutW, intent: "directive", directive: "W" });
    expect(names.has("(none)")).toBe(false);
    for (const name of names.keys()) expect(["GG", "Pog"]).toContain(name);
  });

  it("treats WWW and GG as the same family as W", () => {
    for (const token of ["W", "WWW", "GG"]) {
      const names = spread({ emotes: PACK, intent: "directive", directive: token });
      for (const name of names.keys()) expect(["W", "GG", "Pog"]).toContain(name);
    }
  });

  it("varies among equally suitable emotes without reaching for unrelated ones", () => {
    const names = spread({ emotes: PACK, intent: "excitement" }, 60);
    expect(names.size).toBeGreaterThan(1);
    for (const name of names.keys()) expect(["W", "GG", "Pog", "KEKW", "LUL"]).toContain(name);
  });

  it("never posts an emote nobody can read a meaning from", () => {
    const unreadable = PACK.filter((emote) => meaningsOf(emote.name).length === 0);
    expect(unreadable.length).toBeGreaterThan(0);
    // Every moment, every seed: none of them ever appear.
    for (const intent of ["greeting", "excitement", "struggle", "idle", "mundane"] as const) {
      const names = spread({ emotes: unreadable, intent });
      expect([...names.keys()]).toEqual(["(none)"]);
    }
  });

  it("falls back to an equivalent when the model names an emote the pack lacks", () => {
    const names = spread({
      emotes: PACK,
      intent: "mundane",
      preferred: "OMEGALUL",
      emoteIntent: "laugh",
    });
    expect(names.has("(none)")).toBe(false);
    for (const name of names.keys()) expect(["KEKW", "LUL"]).toContain(name);
  });

  it("uses the emote the model named when the pack has it, whatever the case", () => {
    expect(pick({ emotes: PACK, intent: "mundane", preferred: "kekw", rng: createRng(1) })).toBe("KEKW");
    expect(pick({ emotes: PACK, intent: "mundane", preferred: "Pog", rng: createRng(1) })).toBe("Pog");
  });

  it("matches names through case and pack decoration", () => {
    const odd: Emote[] = [
      { id: "a", name: "widePeepoHappy", mood: "unknown", url: "u" },
      { id: "b", name: "HELLO_there", mood: "unknown", url: "u" },
    ];
    expect(meaningsOf("widePeepoHappy")).toContain("happy");
    expect(pick({ emotes: odd, intent: "greeting", rng: createRng(2) })).toBe("HELLO_there");
  });

  /**
   * Misreads found in a real 659-emote channel pack.
   *
   * The reader used to match the END of a name, so a laughing emote was
   * frustrated ("laugh" ends in "ugh") and BANGER was angry ("anger"). In a
   * struggle moment that posted laughing emotes at the streamer.
   */
  it("reads names by their words, not by how they end", () => {
    for (const name of ["SpeedLaugh", "wideSpeedLaugh", "PepeLaugh", "LacyLaugh"]) {
      expect(meaningsOf(name)).toContain("laugh");
      expect(meaningsOf(name)).not.toContain("frustrated");
    }
    expect(meaningsOf("BANGER")).not.toContain("angry");
    expect(meaningsOf("BANGER")).toContain("hype");
    expect(meaningsOf("MYEYES")).not.toContain("agreement");
    expect(meaningsOf("SillyCatTryingToDrinkWater")).not.toContain("confused");
  });

  it("reads numbered and stretched variants as the word they are", () => {
    expect(meaningsOf("wideSpeedLaugh16")).toContain("laugh");
    expect(meaningsOf("NOOOOOO")).toContain("frustrated");
    expect(meaningsOf("LOLLL")).toContain("laugh");
    expect(meaningsOf("o7")).toEqual(expect.arrayContaining(["respect", "greeting", "farewell"]));
    expect(meaningsOf("o7")).not.toContain("shock");
  });

  it("covers the feelings chat actually has", () => {
    expect(meaningsOf("JUMPSCARE")).toContain("scared");
    expect(meaningsOf("omeSHOCK")).toContain("shock");
    expect(meaningsOf("COPIUM")).toContain("cope");
    expect(meaningsOf("omeDisgust")).toContain("disgust");
    expect(meaningsOf("Susge")).toContain("sus");
    expect(meaningsOf("catJAM")).toContain("dance");
    expect(meaningsOf("catJAM")).not.toContain("idle");
    expect(meaningsOf("RAGEY")).toContain("angry");
    expect(meaningsOf("Prayge")).toContain("respect");
  });

  it("never answers a struggle with a laugh, even when the pack is full of them", () => {
    const pack: Emote[] = ["SpeedLaugh", "wideSpeedLaugh2", "PepeLaugh", "Sadge", "peepoHug"].map(
      (name, i) => ({ id: `${i}`, name, mood: "unknown", url: "u" }),
    );
    const seen = spread({ emotes: pack, intent: "struggle" });
    for (const name of seen.keys()) expect(["Sadge", "peepoHug"]).toContain(name);
  });

  describe("the line's own feeling comes first", () => {
    const room: Emote[] = [
      { id: "1", name: "LaughingHard", mood: "unknown", url: "u", tags: ["laugh", "agreement"] },
      { id: "2", name: "Sadge", mood: "unknown", url: "u" },
      { id: "3", name: "peepoHug", mood: "unknown", url: "u" },
      { id: "4", name: "KEKW", mood: "unknown", url: "u" },
      { id: "5", name: "HUH", mood: "unknown", url: "u" },
    ];

    it("posts a sad emote on a line the model called sad, even in casual chat with a tagged laugh emote", () => {
      // Hand tags used to beat everything: the streamer's laugh emote,
      // tagged for casual chat, answered a sad line.
      const seen = spread({ emotes: room, intent: "mundane", emoteIntent: "sad" });
      for (const name of seen.keys()) expect(["Sadge"]).toContain(name);
    });

    it("posts a confused emote when the model says the line is confused", () => {
      // "chat what if the moon was cheese but louder" — nonsense, and the
      // model knows; the emote has to follow it.
      const seen = spread({ emotes: room, intent: "mundane", emoteIntent: "confused" });
      for (const name of seen.keys()) expect(name).toBe("HUH");
    });

    it("drops the emote the model named when it contradicts the feeling it gave", () => {
      const seen = spread({ emotes: room, intent: "story", preferred: "KEKW", emoteIntent: "sad" });
      expect(seen.has("KEKW")).toBe(false);
    });

    it("reads bad news as bad news, though it classified as a story", () => {
      // "my dog died yesterday": a story, negative. Stories reach for
      // watching and laugh; this one must reach for grief.
      const seen = spread({ emotes: room, intent: "story", sentiment: "negative" });
      for (const name of seen.keys()) expect(["Sadge", "peepoHug"]).toContain(name);
    });

    it("never posts an emote nothing is known about, even when the model names it", () => {
      const pack: Emote[] = [{ id: "1", name: "PLEASE", mood: "unknown", url: "u" }];
      const seen = spread({ emotes: pack, intent: "mundane", preferred: "PLEASE" });
      expect(seen.has("PLEASE")).toBe(false);
    });

    it("reads RIPBOZO as mockery, not grief", () => {
      expect(meaningsOf("RIPBOZO")).toContain("troll");
      expect(meaningsOf("RIPBOZO")).not.toContain("sad");
    });

    it("never laughs after bad news, even when the line or the model asks for it", () => {
      const seen = spread({ emotes: room, intent: "mundane", sentiment: "negative", emoteIntent: "laugh", preferred: "KEKW" });
      for (const name of seen.keys()) expect(["Sadge", "peepoHug"]).toContain(name);
    });

    it("still prefers the streamer's own emote among those that mean the same thing", () => {
      const pack: Emote[] = [
        { id: "1", name: "MySad", mood: "unknown", url: "u", tags: ["sad"] },
        { id: "2", name: "Sadge", mood: "unknown", url: "u" },
      ];
      const seen = spread({ emotes: pack, intent: "mundane", emoteIntent: "sad" });
      expect([...seen.keys()]).toEqual(["MySad"]);
    });
  });

  describe("what the model is offered", () => {
    const pack: Emote[] = [
      "DinkDonk", "COCKA", "LOSER", "ome13", "KEKW", "LUL", "Sadge", "PepeHands", "HUH", "peepoHi", "catJAM",
    ].map((name, i) => ({ id: `${i}`, name, mood: "unknown", url: "u" }));
    const meanings = ["laugh", "sad", "confused", "greeting", "dance"];

    it("offers emotes by what they mean, never the ones nothing is known about", () => {
      // It used to be the first forty in pack order, whatever they were.
      const groups = emotesForPrompt(pack, meanings, createRng(1), 50);
      const offered = groups.flatMap((g) => g.names);
      for (const name of ["DinkDonk", "COCKA", "LOSER", "ome13"]) expect(offered).not.toContain(name);
      expect(groups.find((g) => g.meaning === "sad")?.names.sort()).toEqual(["PepeHands", "Sadge"]);
      expect(groups.find((g) => g.meaning === "confused")?.names).toEqual(["HUH"]);
    });

    it("gives every meaning a turn before any gets a second, under the cap", () => {
      const groups = emotesForPrompt(pack, meanings, createRng(1), 5);
      expect(groups.map((g) => g.meaning)).toEqual(meanings);
      expect(groups.every((g) => g.names.length === 1)).toBe(true);
    });

    it("offers the streamer's own tagged emote first, and leaves out blocked ones", () => {
      const tagged: Emote[] = [
        { id: "a", name: "Sadge", mood: "unknown", url: "u" },
        { id: "b", name: "MySad", mood: "unknown", url: "u", tags: ["sad"] },
        { id: "c", name: "PepeHands", mood: "unknown", url: "u", blocked: true },
      ];
      for (const seed of [1, 2, 3]) {
        const sad = emotesForPrompt(tagged, ["sad"], createRng(seed), 1)[0];
        expect(sad.names).toEqual(["MySad"]);
      }
      expect(emotesForPrompt(tagged, ["sad"], createRng(1), 50)[0].names).not.toContain("PepeHands");
    });
  });

  it("reads what is on screen when capture is on", () => {
    const death = spread({ emotes: PACK, intent: "mundane", event: "death" });
    for (const name of death.keys()) expect(["Sadge", "PepeHands", "KEKW", "LUL"]).toContain(name);

    const win = spread({ emotes: PACK, intent: "mundane", event: "win" });
    for (const name of win.keys()) expect(["W", "GG", "Pog"]).toContain(name);
  });

  it("uses the feeling the model asked for when the moment has nothing", () => {
    const sadOnly = PACK.filter((emote) => ["Sadge", "PepeHands", "hazelMoment"].includes(emote.name));
    const names = spread({ emotes: sadOnly, intent: "greeting", emoteIntent: "sad" });
    for (const name of names.keys()) expect(["Sadge", "PepeHands"]).toContain(name);
  });

  it("posts an anywhere-tagged emote rather than nothing, but only last", () => {
    const emotes: Emote[] = [
      { id: "a", name: "hazelMoment", mood: "unknown", url: "u", tags: ["general"] },
      { id: "b", name: "hi", mood: "chill", url: "u" },
    ];
    // A greeting still prefers the greeting emote...
    expect(pick({ emotes, intent: "greeting", rng: createRng(1) })).toBe("hi");
    // ...and a moment nothing fits gets the one marked usable anywhere.
    expect(pick({ emotes: [emotes[0]], intent: "struggle", rng: createRng(1) })).toBe("hazelMoment");
  });

  it("returns nothing rather than something wrong", () => {
    const wrong: Emote[] = [
      { id: "a", name: "Sadge", mood: "sad", url: "u" },
      { id: "b", name: "PepeHands", mood: "sad", url: "u" },
    ];
    // A win in a pack that only owns grief: no emote is the honest answer.
    expect(pickSemanticEmote({ emotes: wrong, intent: "achievement", event: "win", rng: createRng(1) })).toBeNull();
  });
});

/**
 * The streamer's "never".
 *
 * Tags say where an emote belongs; these say where it must not go, which no
 * amount of tagging can express. KEKW is laughter and belongs in a funny
 * moment, and still must never land straight after a death.
 */
describe("blocked emotes and moments an emote is barred from", () => {
  it("never posts a blocked emote, whatever points at it", () => {
    const emotes: Emote[] = PACK.map((emote) =>
      emote.name === "hi" ? { ...emote, blocked: true, tags: ["greeting"] } : emote,
    );
    // Hand-tagged for greetings, asked for by name, and the moment is a
    // greeting: still never.
    const names = spread({ emotes, intent: "greeting", preferred: "hi" });
    expect(names.has("hi")).toBe(false);
    expect(names.has("peepoHi")).toBe(true);
  });

  it("keeps a barred emote out of that moment, even when the model names it", () => {
    const emotes: Emote[] = PACK.map((emote) =>
      emote.name === "KEKW" ? { ...emote, notFor: ["sad"] } : emote,
    );
    const death = spread({ emotes, intent: "mundane", event: "death", preferred: "KEKW" });
    expect(death.has("KEKW")).toBe(false);
  });

  it("still uses a barred emote in moments it is not barred from", () => {
    const emotes: Emote[] = PACK.map((emote) =>
      emote.name === "KEKW" ? { ...emote, notFor: ["sad"] } : emote,
    );
    // An ordinary line wanting a laugh: nothing sad about it.
    expect(pick({ emotes, intent: "mundane", preferred: "KEKW", rng: createRng(1) })).toBe("KEKW");
  });

  it("returns nothing when every candidate is blocked", () => {
    const emotes: Emote[] = PACK.map((emote) => ({ ...emote, blocked: true }));
    expect(pickSemanticEmote({ emotes, intent: "excitement", rng: createRng(1) })).toBeNull();
  });
});
