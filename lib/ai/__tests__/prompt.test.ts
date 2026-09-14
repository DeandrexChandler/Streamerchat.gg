import { describe, expect, it } from "vitest";
import { buildPrompt } from "../prompt";
import type { CandidateRequest } from "../provider";

function request(patch: Partial<CandidateRequest> = {}): CandidateRequest {
  return {
    phase: "active",
    continuation: false,
    silenceSeconds: 0,
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

  describe("phases", () => {
    it("frames startup as arrival, with nothing to react to", () => {
      const prompt = buildPrompt(request({ phase: "startup", utterance: "", history: [] }));
      expect(prompt).toMatch(/just went live/i);
      expect(prompt).toMatch(/arriving/i);
      expect(prompt).not.toMatch(/react to that/i);
    });

    it("tells a startup continuation that the first wave already said hello", () => {
      const prompt = buildPrompt(request({ phase: "startup", utterance: "", continuation: true }));
      expect(prompt).toMatch(/already said hello/i);
    });

    it("frames a continuation as chat carrying on, not reacting afresh", () => {
      const prompt = buildPrompt(request({ continuation: true, silenceSeconds: 25 }));
      expect(prompt).toContain("look at this roof I just built");
      expect(prompt).toMatch(/haven't said anything since/i);
      expect(prompt).toMatch(/do not react as though it was just said/i);
      expect(prompt).toMatch(/stay about that line/i);
      expect(prompt).toContain("25 seconds");
    });

    it("escalates idle framing with the stage", () => {
      const one = buildPrompt(request({ phase: "idle", idleStage: 1, silenceSeconds: 70 }));
      const four = buildPrompt(request({ phase: "idle", idleStage: 4, silenceSeconds: 700 }));
      expect(one).toMatch(/focused|concentrating/i);
      expect(four).toMatch(/entertaining themselves/i);
      expect(four).toContain("12 minutes");
      expect(one).not.toMatch(/entertaining themselves/i);
    });

    it("mentions the silence in minutes once it is long", () => {
      const prompt = buildPrompt(request({ phase: "idle", idleStage: 2, silenceSeconds: 180 }));
      expect(prompt).toContain("3 minutes");
    });

    it("offers the model an optional emote field", () => {
      expect(buildPrompt(request())).toContain('"emote"');
    });
  });

  describe("answering the streamer", () => {
    it("puts the latest line in front of the model verbatim, not as a label", () => {
      const prompt = buildPrompt(request({ utterance: "hello can yall hear me" }));
      expect(prompt).toContain('"hello can yall hear me"');
      expect(prompt).toMatch(/the streamer just said, to chat/i);
      expect(prompt).toMatch(/answer that/i);
    });

    it("shows only the last three chat lines", () => {
      const recent = ["one", "two", "three", "four", "five"];
      const prompt = buildPrompt(request({ recent }));
      expect(prompt).toContain("five");
      expect(prompt).toContain("three");
      expect(prompt).not.toContain("  one\n");
      expect(prompt).not.toContain("  two\n");
    });

    it("asks for words first and emotes as attachments", () => {
      const prompt = buildPrompt(request());
      expect(prompt).toMatch(/four words or more/i);
      expect(prompt).toMatch(/do not write lines that are only an emote name/i);
      expect(prompt).toMatch(/talking to the streamer/i);
      expect(prompt).toMatch(/no @mentions/i);
    });

    it("keeps the streamer's earlier lines as compact history", () => {
      const history = Array.from({ length: 10 }, (_, i) => `line ${i}`);
      const prompt = buildPrompt(request({ history }));
      expect(prompt).toContain("line 9");
      expect(prompt).not.toContain("line 0");
    });
  });
});
