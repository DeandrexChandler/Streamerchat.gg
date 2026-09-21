import { z } from "zod";
import type { ChatMessage } from "@/lib/engine/types";

/**
 * Wire format shared by the simulator (publisher), the relay route and the
 * OBS overlay (subscriber).
 *
 * Everything here is validated on the server even though the only intended
 * publisher is our own client. The relay hands whatever it receives to a page
 * that renders it on someone's live broadcast, so "our own client sent it" is
 * not a claim the server can check — the key is a bearer token and bearer
 * tokens leak. Caps are therefore structural, not advisory.
 */

/** Session keys are 32 lowercase hex chars; the range allows for changing that. */
export const OVERLAY_KEY_PATTERN = /^[a-z0-9]{16,48}$/;

export const OverlayKeySchema = z.string().regex(OVERLAY_KEY_PATTERN);

/** One publish carries at most this many messages. */
export const MAX_MESSAGES_PER_PUBLISH = 100;

/**
 * Raw body ceiling. A full 100-message batch is ~20KB; this leaves room
 * without letting a POST allocate anything interesting.
 */
export const MAX_PUBLISH_BODY_BYTES = 64 * 1024;

/**
 * Annotated as ZodType<ChatMessage> deliberately: if the engine's message
 * shape changes and this schema doesn't, the build breaks here rather than
 * silently dropping a field somewhere between the simulator and the stream.
 */
export const OverlayChatMessageSchema: z.ZodType<ChatMessage> = z.object({
  id: z.string().min(1).max(64),
  viewerId: z.string().min(1).max(64),
  username: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/),
  text: z.string().min(1).max(400),
  kind: z.enum(["reaction", "idle", "greeting", "question", "reply", "system"]),
  source: z.enum(["ai", "emote", "directive", "system"]),
  at: z.number().finite(),
  replyTo: z.string().max(40).optional(),
});

export const OverlayPublishSchema = z.object({
  key: OverlayKeySchema,
  messages: z
    .array(OverlayChatMessageSchema)
    .max(MAX_MESSAGES_PER_PUBLISH)
    .default([]),
  /** Wipes the overlay. Sent when the streamer clears the session. */
  clear: z.boolean().default(false),
});


/** SSE event names. `chat` carries `{ messages }`; `clear` carries `{}`. */
export type OverlayEventName = "chat" | "clear";

export interface OverlayPublishResult {
  /** Browser sources currently attached to this key. 0 means nobody is watching. */
  subscribers: number;
}
