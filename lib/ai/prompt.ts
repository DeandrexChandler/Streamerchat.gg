import type { CandidateRequest } from "./provider";

/**
 * Builds the generation prompt.
 *
 * Kept apart from the transport because this, not the model, is where output
 * quality comes from. The AI writes roughly six-word lines for about 5% of
 * substantive messages; a careful prompt on a cheap model beats a lazy prompt
 * on an expensive one, and separating them means the prompt can be tested
 * without a network.
 *
 * Everything here fights one failure: chat that reads as generated. The
 * instructions are mostly prohibitions because the default register of an
 * instruction-tuned model — complete sentences, correct punctuation, helpful
 * tone — is exactly wrong for a Twitch chat.
 */

/**
 * Emote names sent to the model.
 *
 * A full imported pack is several hundred names. Sending all of them would
 * dominate the prompt, cost more than the generation itself, and give the
 * model a haystack it mostly ignores. A sample is enough to establish the
 * vocabulary.
 */
const MAX_EMOTES_IN_PROMPT = 40;

/** Recent lines shown so a refill doesn't echo what just went out. */
const MAX_RECENT_IN_PROMPT = 12;

const RULES = [
  "Write like real Twitch chat, not like an assistant.",
  "All lowercase unless an emote or a word like W or GG needs caps.",
  "Very short. Most lines are one to five words.",
  "No trailing punctuation. No emoji. No hashtags. No quotation marks.",
  "No complete sentences with correct grammar — chat does not write like that.",
  "Never number the lines or add any commentary.",
  "Viewers may be confused, may derail, may tease each other, and may make fun of themselves.",
  "NEVER insult, mock, correct or express disappointment in the streamer. Not once, not as a joke.",
  "Do not all react the same way — some agree, some miss the point, some talk about something else.",
];

export function buildPrompt(request: CandidateRequest): string {
  const { classification, emotes, recent, streamer, topic, count } = request;

  const lines: string[] = [
    `You are generating ${count} separate Twitch chat messages reacting to what a streamer just said.`,
    "",
    "Rules:",
    ...RULES.map((rule) => `- ${rule}`),
    "",
    "The moment:",
    `- What the streamer is doing: ${classification.intent}`,
    `- Mood: ${classification.sentiment}`,
    `- Energy (0-1): ${classification.energy.toFixed(2)}`,
  ];

  if (classification.keywords.length > 0) {
    lines.push(`- They mentioned: ${classification.keywords.join(", ")}`);
  }
  if (streamer) lines.push(`- Streamer name: ${streamer}`);
  if (topic) lines.push(`- Playing: ${topic}`);

  if (emotes.length > 0) {
    lines.push(
      "",
      `Emotes: ${emotes.slice(0, MAX_EMOTES_IN_PROMPT).join(" ")}`,
      "Use only emotes from that list, spelled exactly. Any other name renders as plain text and looks broken. Most lines should have no emote at all.",
    );
  }

  if (recent.length > 0) {
    lines.push(
      "",
      "Just said in chat — do not repeat these or write near-duplicates:",
      ...recent.slice(-MAX_RECENT_IN_PROMPT).map((line) => `- ${line}`),
    );
  }

  lines.push(
    "",
    `Return exactly ${count} lines as a JSON array of strings. No other text.`,
  );

  return lines.join("\n");
}
