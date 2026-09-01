import { z } from "zod";
import type { Intent, Sentiment } from "../engine/types";

/**
 * Wire schema for a candidate request.
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

export const CandidateRequestSchema = z.object({
  classification: z.object({
    intent: z.enum(INTENTS),
    sentiment: z.enum(SENTIMENTS),
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
