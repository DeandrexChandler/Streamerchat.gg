import type { CandidateRequest } from "./provider";

/**
 * Builds the generation prompt.
 *
 * The previous version sent an intent label and a keyword list — "What the
 * streamer is doing: greeting" — and never the words themselves. That is why
 * saying "hello" produced nothing relevant and why "actually maybe Valorant"
 * could not possibly read as a change of mind: the model had no access to
 * either sentence, or to the one before it.
 *
 * This one sends the transcript and the recent conversation, which is the
 * entire point of having an AI in the loop.
 */

/** Recent utterances included as context. Enough to follow a change of mind. */
const MAX_HISTORY = 6;

/** Emote names shown. A full pack would dominate the prompt and cost more. */
const MAX_EMOTES_IN_PROMPT = 40;

/** Recent chat lines shown, so a batch does not echo what just went out. */
const MAX_RECENT_IN_PROMPT = 10;

const RULES = [
  "Write like real Twitch chat, not like an assistant.",
  "Mostly lowercase. Caps are for emphasis, not grammar.",
  "Vary the length. Some one-word reactions, plenty of short replies, a few real sentences.",
  "No trailing punctuation on short lines. No hashtags. No quotation marks.",
  "Never number the lines or add commentary around them.",
  "These are different people: they should not all react the same way.",
  "Some agree, some miss the point, some ask a question, some make a joke, some are late.",
  "NEVER insult, mock, correct or express disappointment in the streamer. Not once, not as a joke.",
];

export function buildPrompt(request: CandidateRequest): string {
  const { utterance, history, emotes, recent, streamer, topic, count } = request;

  const lines: string[] = [
    `You are the live chat of a small Twitch stream. The streamer just spoke. Write ${count} separate messages from ${count} different viewers reacting to it.`,
    "",
    "Rules:",
    ...RULES.map((rule) => `- ${rule}`),
  ];

  if (streamer || topic) {
    lines.push("");
    if (streamer) lines.push(`The streamer is called ${streamer}.`);
    if (topic) lines.push(`They are streaming ${topic}.`);
  }

  if (history.length > 0) {
    lines.push(
      "",
      "Earlier in this conversation, most recent last:",
      ...history.slice(-MAX_HISTORY).map((line) => `  streamer: ${line}`),
    );
  }

  lines.push(
    "",
    "The streamer just said:",
    `  "${utterance}"`,
    "",
    "React to THAT. If it changes or contradicts something they said earlier, chat should notice.",
  );

  if (recent.length > 0) {
    lines.push(
      "",
      "Chat has just posted these — do not repeat them or write near-duplicates:",
      ...recent.slice(-MAX_RECENT_IN_PROMPT).map((line) => `  ${line}`),
    );
  }

  if (emotes.length > 0) {
    lines.push(
      "",
      `Emotes available: ${emotes.slice(0, MAX_EMOTES_IN_PROMPT).join(" ")}`,
      "Use these sparingly and spelled exactly. Any other name renders as plain text and looks broken.",
    );
  }

  lines.push(
    "",
    `Return a JSON array of exactly ${count} objects. No other text. Each object:`,
    '  { "text": string,',
    '    "emotion": one of hype | funny | sad | confused | love | chill,',
    '    "kind": one of reaction | question | joke | callback | agree | disagree | emote,',
    '    "eagerness": number 0-1, where 1 is a reflexive one-word reply and 0 is someone who took a while to type }',
  );

  return lines.join("\n");
}
