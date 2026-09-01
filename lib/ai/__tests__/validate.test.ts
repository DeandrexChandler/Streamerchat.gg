import { describe, expect, it } from "vitest";
import { validateCandidates } from "../validate";

describe("validateCandidates", () => {
  it("keeps a plain short line", () => {
    expect(validateCandidates(["that was actually insane"], [])).toEqual([
      "that was actually insane",
    ]);
  });

  it("strips list numbering", () => {
    expect(validateCandidates(["1. no way", "2) actual cinema"], [])).toEqual([
      "no way",
      "actual cinema",
    ]);
  });

  it("strips bullet markers", () => {
    expect(validateCandidates(["- yooo", "* lets go"], [])).toEqual([
      "yooo",
      "lets go",
    ]);
  });

  it("strips surrounding quotes", () => {
    expect(validateCandidates(['"chat is fried"', "'so true'"], [])).toEqual([
      "chat is fried",
      "so true",
    ]);
  });

  it("strips markdown emphasis", () => {
    expect(validateCandidates(["**W**", "_actual gamer_"], [])).toEqual([
      "W",
      "actual gamer",
    ]);
  });

  it("drops lines longer than the word cap", () => {
    const essay = Array.from({ length: 13 }, (_, i) => `word${i}`).join(" ");
    expect(validateCandidates([essay], [])).toEqual([]);
  });

  it("drops lines longer than the character cap", () => {
    expect(validateCandidates(["a".repeat(121)], [])).toEqual([]);
  });

  it("drops lines that are empty after cleaning", () => {
    expect(validateCandidates(["", "   ", '"" ', "3."], [])).toEqual([]);
  });

  it("deduplicates within a batch, case-insensitively", () => {
    expect(validateCandidates(["W", "w", "W "], [])).toEqual(["W"]);
  });

  it("deduplicates against recent chat", () => {
    expect(validateCandidates(["no shot", "first time?"], ["No Shot"])).toEqual([
      "first time?",
    ]);
  });

  it("keeps emotes and gamer shorthand intact", () => {
    expect(
      validateCandidates(["KEKW KEKW KEKW", "W streamer", "GG"], []),
    ).toEqual(["KEKW KEKW KEKW", "W streamer", "GG"]);
  });

  describe("never bites the broadcaster", () => {
    it.each([
      "you suck at this",
      "you're so bad lol",
      "YOU ARE TRASH",
      "you are washed",
      "u suck",
      "you're terrible honestly",
      "ur trash at this",
      "you're awful",
    ])("drops %j", (line) => {
      expect(validateCandidates([line], [])).toEqual([]);
    });

    it.each([
      "didnt ask",
      "didn't ask",
      "who asked",
      "nobody asked",
      "dont care",
      "L + ratio",
      "ratio",
      "skill issue",
      "cope harder",
      "get good",
    ])("drops the dismissive %j", (line) => {
      // Caught live: the model produced "didnt ask" against a streamer telling
      // a story. These carry no second-person pronoun, so the hostility check
      // above never sees them, but pointed at the broadcaster they are dunks.
      expect(validateCandidates([line], [])).toEqual([]);
    });

    it("still allows viewers teasing themselves", () => {
      expect(validateCandidates(["i suck at this game"], [])).toEqual([
        "i suck at this game",
      ]);
    });

    it("still allows viewers teasing each other", () => {
      expect(validateCandidates(["chat is washed"], [])).toEqual([
        "chat is washed",
      ]);
    });

    it("over-rejects rather than risk it — a benign 'you're not bad' is dropped", () => {
      // Deliberate. Losing an occasional harmless line costs nothing; letting
      // one dunk through goes out on a live broadcast. Err toward dropping.
      expect(validateCandidates(["you're not bad"], [])).toEqual([]);
    });

    it("still allows praise in the second person", () => {
      expect(validateCandidates(["you're actually cracked"], [])).toEqual([
        "you're actually cracked",
      ]);
    });
  });
});
