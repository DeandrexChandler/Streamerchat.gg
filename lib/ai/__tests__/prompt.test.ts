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

    it("lets chat move on from the last line after a minute, without noticing the quiet", () => {
      // Idle is minutes away. Staying on one sentence for all of them is how
      // a room chews a line to nothing.
      const prompt = buildPrompt(request({ continuation: true, silenceSeconds: 90 }));
      expect(prompt).not.toMatch(/stay about that line/i);
      expect(prompt).toMatch(/talking to each other/i);
      expect(prompt).toMatch(/nobody mentions that they have gone quiet/i);
      expect(prompt).toContain("look at this roof I just built");
    });

    it("leads a screen batch with the image, not the last thing said", () => {
      const prompt = buildPrompt(request({ screen: true, frame: "abc", silenceSeconds: 40 }));
      expect(prompt).toMatch(/something just changed on screen/i);
      expect(prompt).not.toMatch(/stay about that line/i);
      // Without a frame there is nothing to react to; it reads as a normal reply.
      expect(buildPrompt(request({ screen: true }))).not.toMatch(/changed on screen/i);
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
      expect(prompt).toMatch(/half your lines are one to three words/i);
      expect(prompt).toMatch(/four-to-ten word thoughts/i);
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

/**
 * The room, at the slow tiers.
 *
 * The model cannot write as hazelirl, or let anyone answer to that name, if
 * it has never seen the roster.
 */
describe("the room", () => {
  const roster = [
    { name: "hazelirl", persona: "chatty regular", notes: 'into: roof, rain; has said: "does it leak"' },
    { name: "milo894", persona: "lurker" },
  ];

  it("names everyone, with what they are known for", () => {
    const prompt = buildPrompt(request({ roster }));
    expect(prompt).toContain("hazelirl (chatty regular)");
    expect(prompt).toContain("does it leak");
    expect(prompt).toContain("milo894 (lurker)");
    expect(prompt).toMatch(/"from"/);
    expect(prompt).toMatch(/do not invent names/i);
  });

  it("says who the streamer is talking to", () => {
    const prompt = buildPrompt(request({ roster, addressed: "hazelirl" }));
    expect(prompt).toMatch(/talking TO hazelirl/);
    expect(prompt).toMatch(/nobody wonders who was meant/i);
  });

  it("asks for sentences in a small room and short reactions in a crowd", () => {
    const room = buildPrompt(request({ roster }));
    const crowd = buildPrompt(request());
    expect(room).toMatch(/MOST lines are real four-to-twelve word thoughts/);
    expect(room).toMatch(/never stack short agreements/i);
    expect(crowd).toMatch(/HALF your lines are one to three words/);
    expect(crowd).not.toMatch(/"from"/);
  });
});
