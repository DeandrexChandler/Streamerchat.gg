import { describe, expect, it } from "vitest";
import { isLikelyArtefact } from "../provider";

describe("isLikelyArtefact", () => {
  it.each([
    "thanks",
    "Thank you.",
    "thanks for watching",
    "bye",
    "you",
    "okay",
    "uh",
    "hmm",
    "subscribe",
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

  it("rejects very short fragments", () => {
    expect(isLikelyArtefact("a")).toBe(true);
    expect(isLikelyArtefact("hi")).toBe(true);
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
