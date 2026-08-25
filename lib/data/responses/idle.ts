import type { ResponseEntry } from "../../engine/types";

/**
 * Idle chatter, in escalating tiers.
 *
 * The tier is chosen by how long the streamer has been silent. Escalation is
 * the whole point: chat that says "hello??" at 12 seconds and is still saying
 * "hello??" four minutes later is obviously scripted. Real chat gives up on
 * the streamer and starts talking to itself.
 */

/** ~10-25s of silence. Chat barely notices yet. */
export const IDLE_SETTLING: readonly ResponseEntry[] = [
  { text: "hm", length: "tiny", tags: ["short"] },
  { text: "o/", length: "tiny", tags: ["short", "emote"] },
  { text: "how's everyone doing", length: "medium", tags: ["warm", "question"] },
  { text: "chillin", length: "tiny", tags: ["short"] },
  { text: "this music is nice", length: "medium", tags: ["warm"] },
  { text: "just got here", length: "short", tags: ["newcomer"] },
  { text: "lurking", length: "tiny", tags: ["short"] },
  { text: "vibes are good today", length: "medium", tags: ["warm"] },
  { text: "wait what did i miss", length: "medium", tags: ["newcomer", "question"] },
  { text: "hi", length: "tiny", tags: ["short", "warm"] },
];

/** ~25-60s. Chat has noticed the silence and is poking at it. */
export const IDLE_NOTICING: readonly ResponseEntry[] = [
  { text: "streamer locked in", length: "short", tags: ["joke"] },
  { text: "concentration arc", length: "short", tags: ["joke"] },
  { text: "shhh he's focusing", length: "medium", tags: ["joke", "warm"] },
  { text: "is your mic on?", length: "short", tags: ["question"] },
  { text: "hello?", length: "tiny", tags: ["short", "question"] },
  { text: "we lost him", length: "short", tags: ["joke"] },
  { text: "quiet but cozy", length: "medium", tags: ["warm"] },
  { text: "chat we're on our own", length: "medium", tags: ["joke", "conversational"] },
  { text: "i can hear him thinking", length: "medium", tags: ["joke"] },
  { text: "blink twice if you're okay", length: "long", tags: ["joke", "question"] },
  { text: "the silence is kinda peaceful ngl", length: "long", tags: ["warm"] },
  { text: "audio check?", length: "short", tags: ["question"] },
];

/** 60s+. Chat has fully given up and is entertaining itself. */
export const IDLE_RESTLESS: readonly ResponseEntry[] = [
  { text: "chat what are we having for dinner", length: "long", tags: ["conversational", "question"] },
  { text: "anyone else just staring at the screen", length: "long", tags: ["conversational"] },
  { text: "i've been here 10 minutes and heard nothing", length: "long", tags: ["joke"] },
  { text: "we live here now", length: "short", tags: ["joke"] },
  { text: "chat is this a podcast", length: "medium", tags: ["joke", "question"] },
  { text: "starting a book club in here", length: "long", tags: ["joke", "conversational"] },
  { text: "hello??", length: "short", tags: ["question", "short"] },
  { text: "i'm gonna go make tea brb", length: "long", tags: ["conversational"] },
  { text: "this is the quietest stream i've ever loved", length: "long", tags: ["warm", "joke"] },
  { text: "chat introduce yourselves", length: "medium", tags: ["conversational", "question"] },
  { text: "day 4 in the silent stream", length: "medium", tags: ["joke"] },
  { text: "does anyone know what game this is", length: "long", tags: ["question", "newcomer"] },
  { text: "ok but the vibes remain immaculate", length: "long", tags: ["warm"] },
  { text: "streamer ascended", length: "short", tags: ["joke"] },
  { text: "i'm just here for the ambience at this point", length: "long", tags: ["joke", "warm"] },
];

/**
 * Openers for viewer-to-viewer threads. `{user}` is replaced with the username
 * being replied to. These are what create the illusion that chat is a room of
 * people rather than a queue of independent one-liners.
 */
export const SIDE_REPLIES: readonly ResponseEntry[] = [
  { text: "@{user} same honestly", length: "short", tags: ["conversational"] },
  { text: "@{user} LOL", length: "tiny", tags: ["short", "joke"] },
  { text: "@{user} real", length: "tiny", tags: ["short"] },
  { text: "@{user} you're so right", length: "short", tags: ["warm"] },
  { text: "@{user} nah", length: "tiny", tags: ["short", "snark"] },
  { text: "@{user} explain", length: "short", tags: ["question", "snark"] },
  { text: "@{user} i was thinking the same thing", length: "long", tags: ["conversational"] },
  { text: "@{user} what does that even mean", length: "long", tags: ["joke", "snark", "question"] },
  { text: "@{user} welcome!", length: "short", tags: ["warm"] },
  { text: "@{user} finally someone said it", length: "long", tags: ["conversational"] },
  { text: "@{user} hard disagree", length: "short", tags: ["snark"] },
  { text: "@{user} stop you're right", length: "short", tags: ["joke", "warm"] },
];
