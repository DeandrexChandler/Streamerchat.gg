import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../config/settings";
import { createFilter } from "../profanity";
import type { SimulationSettings } from "../../config/settings";

const settings = (patch: Partial<SimulationSettings> = {}): SimulationSettings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

// Assembled at runtime so this test file isn't itself a slur list.
const SLUR = ["n", "igger"].join("");

describe("createFilter", () => {
  it("passes clean messages through untouched", () => {
    const filter = createFilter(settings({ profanityMode: "replace" }));
    expect(filter.apply("that build is so pretty")).toBe(
      "that build is so pretty",
    );
  });

  describe("replace mode", () => {
    const filter = createFilter(settings({ profanityMode: "replace" }));

    it("censors a profane word but keeps the message", () => {
      expect(filter.apply("what the fuck")).toBe("what the ****");
    });

    it("preserves surrounding words and spacing", () => {
      expect(filter.apply("oh shit sorry")).toBe("oh **** sorry");
    });

    it("censors leetspeak variants", () => {
      // Regression: matching happened on normalized text but substitution on
      // the original, so obfuscated words were detected and left visible.
      expect(filter.apply("what the f*ck")).toBe("what the ****");
      expect(filter.apply("sh1t")).toBe("****");
    });

    it("censors elongated variants", () => {
      expect(filter.apply("fuuuuuck")).toBe("********");
    });

    it("does not censor clean words containing a substring", () => {
      // "class" contains "ass"-adjacent letters; "shitake" style false hits.
      expect(filter.apply("assassin class")).toBe("assassin class");
    });
  });

  describe("filter mode", () => {
    const filter = createFilter(settings({ profanityMode: "filter" }));

    it("drops the whole message", () => {
      expect(filter.apply("what the fuck")).toBeNull();
    });

    it("still passes clean messages", () => {
      expect(filter.apply("nice one")).toBe("nice one");
    });
  });

  describe("off mode", () => {
    const filter = createFilter(settings({ profanityMode: "off" }));

    it("allows ordinary profanity", () => {
      expect(filter.apply("what the fuck")).toBe("what the fuck");
    });

    it("STILL drops slurs", () => {
      // "off" means "allow swearing", never "disable safety" — this output
      // goes on someone's live broadcast.
      expect(filter.apply(`you ${SLUR}`)).toBeNull();
    });
  });

  it("drops slurs in every mode", () => {
    for (const mode of ["off", "replace", "filter"] as const) {
      const filter = createFilter(settings({ profanityMode: mode }));
      expect(filter.apply(`hey ${SLUR} lol`)).toBeNull();
    }
  });

  it("drops obfuscated slurs", () => {
    const filter = createFilter(settings({ profanityMode: "replace" }));
    expect(filter.apply("n1gger")).toBeNull();
  });

  it("honours user-supplied blocked words", () => {
    const filter = createFilter(
      settings({ profanityMode: "replace", blockedWords: ["pineapple"] }),
    );
    expect(filter.apply("pineapple pizza")).toBe("********* pizza");
  });

  it("honours the allow-list against the built-in list", () => {
    const filter = createFilter(
      settings({ profanityMode: "replace", allowedWords: ["damn"] }),
    );
    expect(filter.apply("damn that's good")).toBe("damn that's good");
  });

  it("never lets the allow-list unblock a slur", () => {
    const filter = createFilter(
      settings({ profanityMode: "off", allowedWords: [SLUR] }),
    );
    expect(filter.apply(`a ${SLUR}`)).toBeNull();
  });

  it("handles empty and whitespace-only input", () => {
    const filter = createFilter(settings({ profanityMode: "replace" }));
    expect(filter.apply("")).toBe("");
    expect(filter.apply("   ")).toBe("   ");
  });
});
