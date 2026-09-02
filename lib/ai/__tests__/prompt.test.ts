import { describe, expect, it } from "vitest";
import { buildPrompt } from "../prompt";
import type { CandidateRequest } from "../provider";

function request(patch: Partial<CandidateRequest> = {}): CandidateRequest {
  return {
    utterance: "look at this roof I just built",
    history: [],
    classification: {
      intent: "excitement",
      sentiment: "positive",
      energy: 0.8,
      keywords: ["clutch", "roof"],
      confidence: 0.4,
    },
    emotes: ["KEKW", "Pog", "catJAM"],
    recent: ["no shot", "actual cinema"],
    count: 12,
    ...patch,
  };
}

describe("buildPrompt", () => {
  it("names the emotes that are actually loaded", () => {
    const prompt = buildPrompt(request());
    expect(prompt).toContain("KEKW");
    expect(prompt).toContain("catJAM");
  });

  it("forbids inventing emotes", () => {
    expect(buildPrompt(request()).toLowerCase()).toContain("spelled exactly");
  });

  it("passes the actual words through, not just a label", () => {
    // The bug this replaces: the model received "intent: excitement" and a
    // keyword list, never the sentence, so it could not react to what was said.
    const prompt = buildPrompt(request({ utterance: "look at this roof I just built" }));
    expect(prompt).toContain("look at this roof I just built");
  });

  it("includes recent chat so it does not repeat", () => {
    expect(buildPrompt(request())).toContain("actual cinema");
  });

  it("asks for the requested number of lines", () => {
    expect(buildPrompt(request({ count: 7 }))).toContain("7");
  });

  it("includes recent streamer history so a change of mind is visible", () => {
    const prompt = buildPrompt(
      request({
        utterance: "never mind lets play Valorant",
        history: ["I think I'm gonna play Minecraft"],
      }),
    );
    expect(prompt).toContain("Minecraft");
    expect(prompt).toContain("Valorant");
  });

  it("states the never-dunk rule", () => {
    expect(buildPrompt(request()).toLowerCase()).toContain("never");
  });

  it("includes the streamer name when set", () => {
    expect(buildPrompt(request({ streamer: "dre" }))).toContain("dre");
  });

  it("includes the topic when set", () => {
    expect(buildPrompt(request({ topic: "minecraft" }))).toContain("minecraft");
  });

  it("omits the streamer line entirely when unset", () => {
    expect(buildPrompt(request())).not.toContain("The streamer is called");
  });

  it("omits the topic line entirely when unset", () => {
    expect(buildPrompt(request())).not.toContain("They are streaming");
  });

  it("handles an empty emote list without emitting a dangling instruction", () => {
    const prompt = buildPrompt(request({ emotes: [] }));
    expect(prompt).not.toContain("Emotes available:");
  });

  it("handles no recent chat", () => {
    const prompt = buildPrompt(request({ recent: [] }));
    expect(prompt).not.toContain("Chat has just posted");
  });

  it("caps how many emotes it lists, so the prompt stays cheap", () => {
    const many = Array.from({ length: 200 }, (_, i) => `emote${i}`);
    const prompt = buildPrompt(request({ emotes: many }));
    expect(prompt).not.toContain("emote199");
  });
})
