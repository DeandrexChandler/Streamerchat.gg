import type { Reaction } from "./reaction";

/**
 * Sanitises model output before it can reach the renderer.
 *
 * This is the boundary between untrusted text and someone's live broadcast,
 * so it assumes the model will misbehave: emit numbered lists, wrap lines in
 * quotes, write paragraphs, repeat itself, or ignore the tone rules.
 *
 * Profanity is deliberately NOT re-checked here. `engine.ts` runs
 * `filter.apply()` over every released message regardless of source, so a
 * second pass would be redundant and would drift out of sync with whatever
 * filter mode the user has chosen.
 */

/**
 * Real chat is short. Beyond this a line reads as someone composing a post,
 * which is the most obvious tell that messages are generated.
 *
 * The cap does double duty: it also bounds how much any single bad line can
 * say if it slips past the tone check below.
 */
/**
 * Raised from 12. That cap forbade the one tier capable of writing a real
 * sentence from writing one, which is most of why chat read as a wall of
 * one-word reactions.
 */
const MAX_WORDS = 30;
const MAX_CHARS = 200;

/**
 * Recent chat lines compared against for duplicates.
 *
 * Short: the point is stopping an immediate echo, not enforcing global
 * novelty. Real chat repeats itself constantly.
 */
const RECENT_WINDOW = 8;

/** How many echoes to release when nothing else survived. */
const ECHO_FALLBACK = 4;

/**
 * Lines that bite the broadcaster.
 *
 * CLAUDE.md is unambiguous: chat may be confused, may derail, may tease each
 * other and may be self-deprecating, but it never dunks on the streamer.
 *
 * This check is defence in depth, not a guarantee — a regex cannot understand
 * tone. Three things carry that rule together: the prompt states it, this
 * catches the blunt cases, and MAX_WORDS limits the damage of anything that
 * gets through. It is written to be conservative in one direction: it only
 * fires on second-person address, so "i suck at this" and "chat is washed"
 * both survive, and praise like "you're cracked" survives too.
 */
const SECOND_PERSON = /\b(?:you(?:'re|re| are)?|u|ur|your)\b/i;
const HOSTILE =
  /\b(?:suck|sucks|trash|garbage|awful|terrible|washed|bad|mid|worst|pathetic|useless|embarrassing|choking|choked|griefing|throwing|throw)\b/i;

/** Removes the formatting models add when asked for a list. */
function clean(raw: string): string {
  let text = raw.trim();

  // "1. ", "2) ", "- ", "* " — the bullet form requires trailing whitespace,
  // or "**bold**" would lose its first star and survive the emphasis strip.
  text = text.replace(/^\s*(?:\d+\s*[.)]\s*|[-*•]\s+)/, "");
  // Markdown emphasis, including the doubled form.
  text = text.replace(/(\*\*|__|\*|_)(.+?)\1/g, "$2");
  // Surrounding quotes, straight or curly.
  text = text.replace(/^["'“‘]+|["'”’]+$/g, "");

  return text.trim();
}

/**
 * Dismissals that need no pronoun to land.
 *
 * Caught from live output: the model answered a streamer telling a story with
 * "didnt ask". None of these mention "you", so the second-person check above
 * never sees them, but aimed at the broadcaster every one is a dunk.
 *
 * Matched on a normalised copy so "didn't"/"didnt" and spacing variants are
 * the same phrase.
 */
const DISMISSIVE = [
  "didnt ask",
  "did not ask",
  "who asked",
  "nobody asked",
  "no one asked",
  "dont care",
  "do not care",
  "ratio",
  "skill issue",
  "cope harder",
  "get good",
  "git gud",
  "touch grass",
  "yawn",
  "boring stream",
];

function isHostileToStreamer(text: string): boolean {
  if (SECOND_PERSON.test(text) && HOSTILE.test(text)) return true;

  const normalised = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return DISMISSIVE.some(
    (phrase) =>
      normalised === phrase ||
      normalised.startsWith(`${phrase} `) ||
      normalised.endsWith(` ${phrase}`) ||
      normalised.includes(` ${phrase} `),
  );
}

/**
 * Cleans, filters and deduplicates a batch of generated reactions.
 *
 * `recent` is the rolling window of what chat has already said; anything
 * matching it is dropped, because an AI refill echoing a line that went out
 * ten seconds ago is worse than no refill at all.
 */
export interface ValidationResult {
  reactions: Reaction[];
  /** How many fell to each rule. Reported so an empty batch names its cause. */
  rejected: {
    empty: number;
    tooLong: number;
    hostile: number;
    duplicate: number;
    /** Bare-emote lines beyond the share a normal batch may carry. */
    emoteSurplus: number;
  };
  /**
   * True when dedup against recent chat emptied the batch and it was allowed
   * back in. An echoed greeting beats a dead chat, but it is worth surfacing.
   */
  echoed: boolean;
}

export interface ValidationOptions {
  /** Emote names the pack can render, to recognise a bare-emote line. */
  emotes?: readonly string[];
  /**
   * The streamer asked chat to post something ("spam W", "say hi").
   *
   * The engine posts the token itself from about half the room, so the
   * model's batch is the talk around it. Lines that are only the token —
   * "W", "WWWWW", "hiiiii" — are capped harder, or they stack on the
   * engine's spam into a wall.
   */
  directive?: boolean;
}

/** Bare-token share a directive batch may carry: the engine supplies the spam. */
const MAX_DIRECTIVE_BARE_SHARE = 0.1;

/**
 * Whether a line is only emotes and one repeated word.
 *
 * "W W W", "WWWWW", "hiiiii", "PogChamp hi" — nothing anyone reads.
 * Repeated letters collapse, so "hiiiii" and "hi" are the same word.
 */
function isBare(text: string, emoteNames: ReadonlySet<string>): boolean {
  const words = text
    .split(/\s+/)
    .filter((word) => word && !emoteNames.has(word))
    .map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1"));
  return new Set(words).size <= 1 && words.every((word) => word.length <= 3);
}

/**
 * The most of a normal batch that may be bare emotes.
 *
 * A quarter is generous — the target is closer to one line in ten — but
 * this is a backstop against the model ignoring the prompt, not a quota.
 * Surplus bare-emote lines are dropped, never replaced: the words in the
 * batch stay, and the room says fewer things rather than canned things.
 */
const MAX_EMOTE_ONLY_SHARE = 0.25;

export function validateReactions(
  reactions: readonly Reaction[],
  recent: readonly string[],
  options: ValidationOptions = {},
): ValidationResult {
  /**
   * Only the last few lines.
   *
   * The whole recent buffer was used, which for a greeting is fatal: chat's
   * greeting vocabulary is about six words wide, so after one round of hellos
   * every subsequent greeting batch deduplicated to nothing and the streamer
   * was told the AI had produced nothing usable.
   */
  const window = recent.slice(-RECENT_WINDOW);
  const seen = new Set(window.map((line) => line.trim().toLowerCase()));
  const rejected = { empty: 0, tooLong: 0, hostile: 0, duplicate: 0, emoteSurplus: 0 };
  const emoteNames = new Set(options.emotes ?? []);
  const out: Reaction[] = [];
  /** Survived every rule except the recent-chat check. */
  const echoes: Reaction[] = [];

  for (const reaction of reactions) {
    if (typeof reaction?.text !== "string") {
      rejected.empty += 1;
      continue;
    }

    const text = clean(reaction.text);
    if (!text) {
      rejected.empty += 1;
      continue;
    }
    if (text.length > MAX_CHARS || text.split(/\s+/).length > MAX_WORDS) {
      rejected.tooLong += 1;
      continue;
    }
    if (isHostileToStreamer(text)) {
      rejected.hostile += 1;
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      rejected.duplicate += 1;
      // Held aside rather than discarded, in case nothing else survives.
      if (!echoes.some((e) => e.text.toLowerCase() === key)) {
        echoes.push({ ...reaction, text });
      }
      continue;
    }
    seen.add(key);

    out.push({ ...reaction, text });
  }

  /**
   * Bare emotes are seasoning, not the meal.
   *
   * Kept from the front of the batch in the order the model wrote them, so
   * the ones that survive are the ones it reached for first.
   */
  if (out.length > 0 && (options.directive || emoteNames.size > 0)) {
    const share = options.directive ? MAX_DIRECTIVE_BARE_SHARE : MAX_EMOTE_ONLY_SHARE;
    const allowed = Math.max(1, Math.floor(out.length * share));
    let kept = 0;
    for (let i = 0; i < out.length; i += 1) {
      const bare = options.directive
        ? isBare(out[i].text, emoteNames)
        : out[i].text.split(/\s+/).every((word) => emoteNames.has(word));
      if (!bare) continue;
      if (kept < allowed) {
        kept += 1;
        continue;
      }
      out.splice(i, 1);
      i -= 1;
      rejected.emoteSurplus += 1;
    }
  }

  /**
   * Silence is worse than an echo.
   *
   * If every line duplicated something chat said recently, releasing a couple
   * of them is a far better outcome than telling the streamer the AI failed.
   * They said hello twice; chat saying hello twice is correct.
   */
  if (out.length === 0 && echoes.length > 0) {
    return { reactions: echoes.slice(0, ECHO_FALLBACK), rejected, echoed: true };
  }

  return { reactions: out, rejected, echoed: false };
}
