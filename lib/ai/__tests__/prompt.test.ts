import { describe, expect, it } from "vitest";
import { buildPrompt } from "../prompt";
import type { CandidateRequest } from "../provider";

function request(patch: Partial<CandidateRequest> = {}): CandidateRequest {
  return {
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
    expect(buildPrompt(request()).toLowerCase()).toContain("only");
  });

  it("passes the classification through", () => {
    const prompt = buildPrompt(request());
    expect(prompt).toContain("excitement");
    expect(prompt).toContain("positive");
    expect(prompt).toContain("clutch");
  });

  it("includes recent chat so it does not repeat", () => {
    expect(buildPrompt(request())).toContain("actual cinema");
  });

  it("asks for the requested number of lines", () => {
    expect(buildPrompt(request({ count: 7 }))).toContain("7");
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
    const prompt = buildPrompt(request());
    expect(prompt).not.toContain("Streamer name:");
  });

  it("omits the topic line entirely when unset", () => {
    const prompt = buildPrompt(request());
    expect(prompt).not.toContain("Playing:");
  });

  it("handles an empty emote list without emitting a dangling instruction", () => {
    const prompt = buildPrompt(request({ emotes: [] }));
    expect(prompt).not.toContain("Emotes:");
  });

  it("handles no recent chat", () => {
    const prompt = buildPrompt(request({ recent: [] }));
    expect(prompt).not.toContain("Just said:");
  });

  it("caps how many emotes it lists, so the prompt stays cheap", () => {
    const many = Array.from({ length: 200 }, (_, i) => `emote${i}`);
    const prompt = buildPrompt(request({ emotes: many }));
    expect(prompt).not.toContain("emote199");
  });
})
