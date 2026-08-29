import type { Emote } from "../engine/types";

/** Case-insensitive lookup used by the message renderer. */
export function buildEmoteIndex(
  emotes: readonly Emote[],
): ReadonlyMap<string, Emote> {
  const index = new Map<string, Emote>();
  for (const emote of emotes) index.set(emote.name.toLowerCase(), emote);
  return index;
}

/** Splits a message into text runs and emote tokens for rendering. */
export type MessageSegment =
  | { type: "text"; value: string }
  | { type: "emote"; emote: Emote };

export function segmentMessage(
  text: string,
  index: ReadonlyMap<string, Emote>,
): MessageSegment[] {
  if (index.size === 0) return [{ type: "text", value: text }];

  const segments: MessageSegment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ type: "text", value: buffer.join(" ") });
      buffer = [];
    }
  };

  for (const token of text.split(" ")) {
    const emote = index.get(token.toLowerCase());
    if (emote) {
      flush();
      segments.push({ type: "emote", emote });
    } else {
      buffer.push(token);
    }
  }

  flush();
  return segments;
}

/**
 * True when every token is an emote.
 *
 * Needed because word count alone misreads emote spam: "KEKW KEKW KEKW KEKW
 * KEKW" is eight tokens but is not an eight-word message — it's the shortest
 * thing chat does. Any length measurement that ignores this reports a chat
 * full of long messages when the opposite is true.
 */
export function isEmoteOnly(
  text: string,
  index: ReadonlyMap<string, Emote>,
): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => index.has(token.toLowerCase()));
}
