import { z } from "zod";
import type { Intent, Sentiment } from "../engine/types";

/**
 * Wire schema for a batch request.
 *
 * Lives here rather than inside the route so the route and its tests share one
 * definition. They were duplicated, and the copies drifted the moment a new
 * intent was added.
 */

const INTENTS = [
  "greeting",
  "question_to_chat",
  "directive",
  "excitement",
  "struggle",
  "achievement",
  "story",
  "confusion",
  "showing",
  "farewell",
  "mundane",
] as const;

const SENTIMENTS = ["positive", "negative", "neutral"] as const;

/**
 * Compile-time exhaustiveness.
 *
 * `z.ZodType<Intent>` alone does NOT catch an omission — a narrower union is
 * still assignable to Intent, so a missing value type-checks fine and then
 * rejects live requests at runtime. That is exactly what happened when
 * `directive` was added: the build stayed green and every directive request
 * came back "invalid".
 */
type MissingIntent = Exclude<Intent, (typeof INTENTS)[number]>;
type MissingSentiment = Exclude<Sentiment, (typeof SENTIMENTS)[number]>;
const _intentsAreExhaustive: MissingIntent extends never ? true : never = true;
const _sentimentsAreExhaustive: MissingSentiment extends never ? true : never = true;
void _intentsAreExhaustive;
void _sentimentsAreExhaustive;

/**
 * Free text that is trimmed to its cap rather than refused.
 *
 * Everything here is built by the engine from speech and memory, and a
 * refusal is silent by design — the same oversized transcript rode in every
 * following request, so one long run-on silenced chat for minutes. The cap
 * still bounds the prompt; it just no longer costs the whole batch.
 */
const text = (max: number) => z.string().transform((value) => value.slice(0, max));

export const CandidateRequestSchema = z
  .object({
    phase: z.enum(["startup", "active", "idle"]).default("active"),
    /** What the streamer said. Empty only during startup. */
    utterance: text(1000).default(""),
    /** Recent utterances, oldest first. Capped so a long stream cannot grow the prompt without bound. */
    history: z.array(text(1000)).max(12).default([]),
    classification: z.object({
      intent: z.enum(INTENTS),
      sentiment: z.enum(SENTIMENTS),
      energy: z.number().min(0).max(1),
      keywords: z.array(z.string().max(40)).max(12),
      confidence: z.number().min(0).max(1),
    }),
    continuation: z.boolean().default(false),
    silenceSeconds: z.number().min(0).max(100_000).default(0),
    idleStage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    emotes: z.array(z.string().max(60)).max(200).default([]),
    recent: z.array(text(200)).max(30).default([]),
    /**
     * Nullish rather than optional: JSON.stringify drops `undefined`, but any
     * caller that sends an explicit `null` should be treated as "not set" rather
     * than failing the whole request over an absent nicety.
     */
    streamer: text(40).nullish().transform((v) => v ?? undefined),
    topic: text(80).nullish().transform((v) => v ?? undefined),
    count: z.number().int().min(1).max(70).default(16),
    /**
     * Base64 JPEG of the streamer's screen. Capped well under the route's
     * body limit: the client downscales to 384px, which lands around 20KB.
     */
    frame: z.string().max(300_000).optional(),
    screen: z.enum(["changed", "asked"]).optional(),
    /**
     * The room, at the slow tiers. Capped: twelve regulars is the largest
     * roster the engine builds, and a short profile each is all the model
     * is given.
     */
    roster: z
      .array(
        z.object({
          name: z.string().max(40),
          // Archetype plus typing habits plus what they bring up: the whole
          // voice, which is a sentence, not a label.
          persona: text(200),
          notes: text(400).optional(),
          character: text(200).optional(),
        }),
      )
      .max(12)
      .optional(),
    addressed: z.string().max(40).optional(),
    customTags: z
      .array(z.object({ name: text(24), description: text(120) }))
      .max(16)
      .optional(),
    callbacks: z.array(text(200)).max(3).optional(),
    /** DEV-MODEL-TOGGLE: which model answers. Removed once one is chosen. */
    devModel: z.enum(["gemini", "openai"]).optional(),
  })
  .refine(
    // A screen batch may come before the streamer has said anything: the
    // game is what is being reacted to.
    (request) => request.phase !== "active" || request.screen !== undefined || request.utterance.trim().length > 0,
    { message: "an active batch needs something the streamer said", path: ["utterance"] },
  );
