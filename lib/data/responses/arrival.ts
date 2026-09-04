import type { ResponseEntry } from "../../engine/types";

/**
 * What people say as a stream comes up.
 *
 * The one deliberate exception to "active chat is AI or nothing", and it
 * earns the exception: nobody has spoken yet, so there is nothing for a model
 * to react to. An arriving audience is saying the same six things whatever
 * the stream is — that is genuinely a lookup table, not a generation problem.
 *
 * It is also the first thing the streamer sees after pressing Start, so it
 * must never depend on a network round trip. A cold open with an empty chat
 * reads as a broken app.
 */
export const ARRIVAL: readonly ResponseEntry[] = [
  { text: "hi", weight: 4, length: "tiny", tags: ["short", "greeting"] },
  { text: "yo", weight: 4, length: "tiny", tags: ["short", "greeting"] },
  { text: "YOOO", weight: 3, length: "tiny", tags: ["short", "greeting"] },
  { text: "hey", weight: 3, length: "tiny", tags: ["short", "greeting"] },
  { text: "im early", weight: 3, length: "short", tags: ["short", "greeting"] },
  { text: "first", weight: 2, length: "tiny", tags: ["short", "greeting"] },
  { text: "we're here", weight: 2, length: "short", tags: ["short", "greeting"] },
  { text: "just in time", weight: 2, length: "short", tags: ["short", "greeting"] },
  { text: "streamer booted up stream", weight: 2, length: "medium", tags: ["greeting"] },
  { text: "aye", weight: 2, length: "tiny", tags: ["short", "greeting"] },
  { text: "hello hello", weight: 2, length: "short", tags: ["short", "greeting"] },
  { text: "wassup", weight: 2, length: "tiny", tags: ["short", "greeting"] },
  { text: "here we go", weight: 2, length: "short", tags: ["short", "greeting"] },
  { text: "made it", weight: 2, length: "short", tags: ["short", "greeting"] },
  { text: "sup", weight: 2, length: "tiny", tags: ["short", "greeting"] },
  { text: "lets get it", weight: 2, length: "short", tags: ["short", "hype"] },
  { text: "chat we're live", weight: 1, length: "medium", tags: ["greeting"] },
  { text: "notification gang", weight: 1, length: "short", tags: ["greeting"] },
  { text: "was waiting for this", weight: 1, length: "medium", tags: ["greeting"] },
  { text: "good timing", weight: 1, length: "short", tags: ["short", "greeting"] },
];
