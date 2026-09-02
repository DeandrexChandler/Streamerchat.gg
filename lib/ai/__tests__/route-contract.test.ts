import { describe, expect, it } from "vitest";
import { CandidateRequestSchema as RequestSchema } from "../schema";

/**
 * The route's own schema, imported rather than mirrored.
 *
 * It used to be copied into this file, and the copies drifted the moment
 * `directive` was added — the test kept passing while every directive request
 * to the live route came back "invalid".
 */
const valid = {
  utterance: "look at this roof I just built",
  history: ["I think I'm gonna play Minecraft"],
  classification: {
    intent: "excitement",
    sentiment: "positive",
    energy: 0.8,
    keywords: ["clutch"],
    confidence: 0.4,
  },
  emotes: ["KEKW"],
  recent: ["no shot"],
  count: 12,
};

describe("chat-candidates request contract", () => {
  it("accepts what the client sends", () => {
    expect(RequestSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults the optional collections", () => {
    const parsed = RequestSchema.parse({
      utterance: "hello",
      classification: valid.classification,
    });
    expect(parsed).toMatchObject({ emotes: [], recent: [], history: [], count: 16 });
  });

  it("rejects a request with no transcript", () => {
    // The whole point of the pipeline: a request that cannot say what the
    // streamer said is not a request worth making.
    const withoutTranscript = { ...valid, utterance: undefined };
    expect(RequestSchema.safeParse(withoutTranscript).success).toBe(false);
  });

  it("rejects an intent the engine does not define", () => {
    const bad = { ...valid, classification: { ...valid.classification, intent: "vibing" } };
    expect(RequestSchema.safeParse(bad).success).toBe(false);
  });

  it.each(["directive", "question_to_chat", "story", "mundane"])(
    "accepts the %j intent the engine can actually emit",
    (intent) => {
      const req = { ...valid, classification: { ...valid.classification, intent } };
      expect(RequestSchema.safeParse(req).success).toBe(true);
    },
  );

  it("rejects out-of-range energy", () => {
    const bad = { ...valid, classification: { ...valid.classification, energy: 4 } };
    expect(RequestSchema.safeParse(bad).success).toBe(false);
  });

  it("caps how many emotes a request may carry", () => {
    const bad = { ...valid, emotes: Array.from({ length: 201 }, () => "x") };
    expect(RequestSchema.safeParse(bad).success).toBe(false);
  });

  it("caps how many lines may be requested", () => {
    expect(RequestSchema.safeParse({ ...valid, count: 500 }).success).toBe(false);
  });

  it("caps how much history may be sent", () => {
    const long = Array.from({ length: 13 }, () => "an utterance");
    expect(RequestSchema.safeParse({ ...valid, history: long }).success).toBe(false);
  });

  it("rejects an oversized streamer name", () => {
    const bad = { ...valid, streamer: "x".repeat(41) };
    expect(RequestSchema.safeParse(bad).success).toBe(false);
  });
});
