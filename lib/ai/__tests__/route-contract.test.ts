import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Intent, Sentiment } from "../../engine/types";

/**
 * The route's request schema, mirrored.
 *
 * The route itself imports next/server, which cannot be constructed in this
 * environment. What is actually worth pinning is the contract: that the schema
 * accepts what the client sends and rejects what it must, and that the intent
 * list stays in step with the engine's own union.
 */
const IntentSchema: z.ZodType<Intent> = z.enum([
  "greeting",
  "question_to_chat",
  "excitement",
  "struggle",
  "achievement",
  "story",
  "confusion",
  "showing",
  "farewell",
  "mundane",
]);

const SentimentSchema: z.ZodType<Sentiment> = z.enum([
  "positive",
  "negative",
  "neutral",
]);

const RequestSchema = z.object({
  classification: z.object({
    intent: IntentSchema,
    sentiment: SentimentSchema,
    energy: z.number().min(0).max(1),
    keywords: z.array(z.string().max(40)).max(12),
    confidence: z.number().min(0).max(1),
  }),
  emotes: z.array(z.string().max(60)).max(200).default([]),
  recent: z.array(z.string().max(200)).max(30).default([]),
  streamer: z.string().max(40).optional(),
  topic: z.string().max(80).optional(),
  count: z.number().int().min(1).max(24).default(12),
  model: z.string().max(60).optional(),
});

const valid = {
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
    const parsed = RequestSchema.parse({ classification: valid.classification });
    expect(parsed).toMatchObject({ emotes: [], recent: [], count: 12 });
  });

  it("rejects an intent the engine does not define", () => {
    const bad = { ...valid, classification: { ...valid.classification, intent: "vibing" } };
    expect(RequestSchema.safeParse(bad).success).toBe(false);
  });

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

  it("rejects an oversized streamer name", () => {
    const bad = { ...valid, streamer: "x".repeat(41) };
    expect(RequestSchema.safeParse(bad).success).toBe(false);
  });
});
