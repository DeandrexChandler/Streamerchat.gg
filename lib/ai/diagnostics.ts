import type { Reaction } from "./reaction";
import type { CandidateRequest } from "./provider";

/**
 * What a batch is made of, for the server log.
 *
 * Not the browser. The streamer cannot act on this and should never see it;
 * the person tuning the prompt can, and one line per batch is how a
 * "feels like emote noise" report becomes a number that moves.
 */

export interface BatchShape {
  lines: number;
  textOnly: number;
  textWithEmote: number;
  emoteOnly: number;
  questions: number;
  /** Lines sharing a content word with the latest streamer input. */
  onTopic: number;
  meanWords: number;
}

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "you", "your", "are", "was",
  "were", "have", "has", "what", "how", "chat", "today", "yall", "guys", "just",
  "like", "about", "gonna", "going", "think", "some", "all", "im", "its", "not",
]);

/** Content words of a line: four or more letters, not filler. */
export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOP.has(word)),
  );
}

export function isEmoteOnly(text: string, emotes: ReadonlySet<string>): boolean {
  const words = text.trim().split(/\s+/);
  return words.length > 0 && words.every((word) => emotes.has(word));
}

export function shapeOf(reactions: readonly Reaction[], request: Pick<CandidateRequest, "emotes" | "utterance">): BatchShape {
  const emotes = new Set(request.emotes);
  const topic = contentWords(request.utterance);
  const shape: BatchShape = {
    lines: reactions.length,
    textOnly: 0,
    textWithEmote: 0,
    emoteOnly: 0,
    questions: 0,
    onTopic: 0,
    meanWords: 0,
  };
  let words = 0;

  for (const reaction of reactions) {
    const text = reaction.text.trim();
    const tokens = text.split(/\s+/);
    words += tokens.length;
    if (isEmoteOnly(text, emotes)) shape.emoteOnly += 1;
    else if (tokens.some((token) => emotes.has(token)) || reaction.emote) shape.textWithEmote += 1;
    else shape.textOnly += 1;
    if (reaction.kind === "question" || text.endsWith("?")) shape.questions += 1;
    const mine = contentWords(text);
    if ([...mine].some((word) => topic.has(word))) shape.onTopic += 1;
  }
  shape.meanWords = reactions.length ? Math.round((words / reactions.length) * 10) / 10 : 0;
  return shape;
}

export function describeShape(shape: BatchShape): string {
  const pct = (n: number) => (shape.lines ? `${Math.round((100 * n) / shape.lines)}%` : "-");
  return (
    `lines=${shape.lines} text=${pct(shape.textOnly)} text+emote=${pct(shape.textWithEmote)} ` +
    `emote-only=${pct(shape.emoteOnly)} questions=${pct(shape.questions)} on-topic=${pct(shape.onTopic)} ` +
    `words=${shape.meanWords}`
  );
}
