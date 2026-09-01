import { describe, expect, it } from "vitest";
import { isLikelyArtefact } from "../provider";

describe("isLikelyArtefact", () => {
  it.each([
    "thanks",
    "Thank you.",
    "thanks for watching",
    "you",
    "uh",
    "subscribe",
    // "bye", "okay" and "hmm" were here and have been deliberately removed:
    // they are things streamers actually say, and dropping them meant chat
    // could never react to them. See "keeps short real speech" below.
  ])("rejects the recogniser artefact %j", (text) => {
    // Whisper hallucinates these during silence; Web Speech produces them from
    // breathing and keyboard noise. Reacting to them looks worse than staying
    // quiet.
    expect(isLikelyArtefact(text)).toBe(true);
  });

  it("rejects punctuation-only output", () => {
    expect(isLikelyArtefact("...")).toBe(true);
    expect(isLikelyArtefact(" . , ! ")).toBe(true);
  });

  it("rejects single characters but keeps two-letter words", () => {
    // "hi" used to be dropped by a length < 3 rule that also killed "yo",
    // "gg" and "ez" — all real speech, and the exact moments worth reacting to.
    expect(isLikelyArtefact("a")).toBe(true);
    expect(isLikelyArtefact("hi")).toBe(false);
  });

  it("rejects hallucinated URLs", () => {
    expect(isLikelyArtefact("www.example.com")).toBe(true);
    expect(isLikelyArtefact("go to https://foo.org")).toBe(true);
  });

  it("accepts real speech", () => {
    expect(isLikelyArtefact("okay so today we're finishing the base")).toBe(false);
    expect(isLikelyArtefact("chat what do you think")).toBe(false);
    expect(isLikelyArtefact("oh no")).toBe(false);
  });

  it("is not fooled by trailing punctuation on real speech", () => {
    expect(isLikelyArtefact("let's go!")).toBe(false);
  });

  it("does not reject a sentence merely containing an artefact word", () => {
    expect(isLikelyArtefact("thanks for hanging out everyone")).toBe(false);
  });
});

/**
 * The filter existed to catch recogniser noise, but it was also eating real
 * speech: a `length < 3` rule killed "yo", "gg" and "ez", and the blocklist
 * contained "okay", "yeah" and "hmm" — all things a streamer genuinely says,
 * and "hmm" is a signal the classifier explicitly handles as confusion.
 *
 * Dropped here, an utterance never reaches the engine at all, so no amount of
 * attention tuning downstream can recover it.
 */
describe("keeps short real speech", () => {
  it.each(["yo", "gg", "ez", "okay", "yeah", "hmm", "oh", "nah", "wow", "bye"])(
    "keeps %j",
    (text) => {
      expect(isLikelyArtefact(text)).toBe(false);
    },
  );
});

describe("still drops genuine recogniser noise", () => {
  it.each([
    "thanks for watching",
    "please subscribe",
    "thank you",
    "you",
    "uh",
    "um",
    "mm",
    "the",
    "a",
    "i",
    "",
    "   ",
    "...",
  ])("drops %j", (text) => {
    expect(isLikelyArtefact(text)).toBe(true);
  });
});
