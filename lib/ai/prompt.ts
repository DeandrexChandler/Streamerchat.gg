import type { CandidateRequest, IdleStage } from "./provider";

/**
 * Builds the generation prompt.
 *
 * One prompt per phase, because the three moments are different jobs. A
 * room filling up says different things from a room answering a question,
 * and both are different from a room that has been left alone for five
 * minutes. Sending the same "react to this" framing for all three is how
 * idle chat used to read as replies to nothing.
 *
 * Context is compact: the last few streamer lines, the last few chat lines,
 * a name and a topic. Never a transcript.
 */

/** Recent utterances included as context. Enough to follow a change of mind. */
const MAX_HISTORY = 6;

/**
 * Emote names shown to the model.
 *
 * Exported because the client must not send more than this. It used to send
 * the entire merged pack — several hundred names once a channel pack was
 * imported — which blew past the request schema's cap and got every single
 * generation rejected as malformed. Sending what the prompt actually uses
 * removes the class of bug rather than raising a number.
 */
export const MAX_EMOTES_IN_PROMPT = 40;

/** Recent chat lines shown, so a batch does not echo what just went out. */
const MAX_RECENT_IN_PROMPT = 12;

const RULES = [
  "Write like real Twitch chat, not like an assistant.",
  "Mostly lowercase. Caps are for emphasis, not grammar.",
  "Vary the length. Some one-word reactions, plenty of short replies, a few real sentences.",
  "No trailing punctuation on short lines. No hashtags. No quotation marks.",
  "Never number the lines or add commentary around them.",
  "These are different people: they should not all react the same way.",
  "Some agree, some miss the point, some ask a question, some make a joke, some talk to each other.",
  "NEVER insult, mock, correct or express disappointment in the streamer. Not once, not as a joke.",
];

/**
 * What the room is doing as the silence wears on.
 *
 * The shift is the point. Stage one is people assuming the streamer is
 * concentrating; stage four is a chat that has stopped waiting and started
 * talking among itself. Sending the same "they've gone quiet" line for every
 * stage produces five minutes of "u there?".
 */
const IDLE_FRAMING: Record<IdleStage, string> = {
  1: "The streamer has gone quiet — they seem focused on what they're doing. Chat notices, but assumes they're concentrating. Small observations, patience, a bit of commentary on what's on screen.",
  2: "The streamer has been quiet for a while now. They might be busy, tabbed out, or dealing with something. Chat starts to wonder aloud, jokes about the silence, and talks among itself a little.",
  3: "The streamer has been silent for a long time. Chat is asking whether they're still there — some worried, some joking, some checking their own audio. A few people are talking to each other instead.",
  4: "The streamer has been gone long enough that chat has stopped waiting. People are entertaining themselves: side conversations, unrelated jokes, in-jokes, someone asking what everyone had for dinner. Occasional glance back at the empty stream.",
};

export function buildPrompt(request: CandidateRequest): string {
  const { emotes, recent, streamer, topic, count } = request;

  const lines: string[] = [opening(request)];

  lines.push("", "Rules:", ...RULES.map((rule) => `- ${rule}`));

  if (streamer || topic) {
    lines.push("");
    if (streamer) lines.push(`The streamer is called ${streamer}.`);
    if (topic) lines.push(`They are streaming ${topic}.`);
  }

  lines.push("", ...situation(request));

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
      "Use these where they fit and spelled exactly. Any other name renders as plain text and looks broken.",
    );
  }

  lines.push(
    "",
    `Return JSON: an object with one key "reactions", holding an array of exactly ${count} objects.`,
    "Each object:",
    '  { "text": string,',
    '    "emotion": one of hype | funny | sad | confused | love | chill,',
    '    "kind": one of reaction | question | joke | callback | agree | disagree | emote,',
    '    "emote": optional — one name from the emotes list, if the line really wants one,',
    '    "eagerness": number 0-1, where 1 is a reflexive one-word reply and 0 is someone who took a while to type }',
    "No other text.",
  );

  return lines.join("\n");
}

function opening(request: CandidateRequest): string {
  const { count } = request;
  const who = `Write ${count} separate messages from ${count} different viewers.`;

  switch (request.phase) {
    case "startup":
      return `You are the live chat of a small Twitch stream. The stream just went live and the streamer hasn't spoken yet. ${who}`;
    case "idle":
      return `You are the live chat of a small Twitch stream. ${who}`;
    default:
      return request.continuation
        ? `You are the live chat of a small Twitch stream. ${who}`
        : `You are the live chat of a small Twitch stream. The streamer just spoke. ${who} They are reacting to it.`;
  }
}

/** The part of the prompt that changes with the moment. */
function situation(request: CandidateRequest): string[] {
  const { phase, utterance, history, silenceSeconds, idleStage, continuation } = request;

  const earlier =
    history.length > 0
      ? [
          "What the streamer has said recently, most recent last:",
          ...history.slice(-MAX_HISTORY).map((line) => `  streamer: ${line}`),
        ]
      : [];

  if (phase === "startup") {
    return [
      "People are arriving. This is the first minute of a stream: hellos, 'im early', someone noticing they made it on time, someone asking what's on today, a few just posting an emote. Nobody is reacting to anything yet because nothing has happened.",
      ...(continuation
        ? ["The first wave already said hello — these are the next people in, plus a bit of chatter while everyone waits for the streamer to start talking."]
        : []),
    ];
  }

  if (phase === "idle") {
    const stage = idleStage ?? 1;
    return [
      ...earlier,
      ...(earlier.length > 0 ? [""] : []),
      `${IDLE_FRAMING[stage]} It has been about ${describeSilence(silenceSeconds)} since they last said anything.`,
    ];
  }

  // Active.
  if (continuation) {
    return [
      ...earlier,
      ...(earlier.length > 0 ? [""] : []),
      `The streamer's last line was: "${utterance}"`,
      `That was about ${describeSilence(silenceSeconds)} ago and they haven't said anything since. Chat is still going: follow-ups, people replying to each other, a late reaction, someone changing the subject slightly. Do not react as though they just said it.`,
    ];
  }

  return [
    ...earlier,
    ...(earlier.length > 0 ? [""] : []),
    "The streamer just said:",
    `  "${utterance}"`,
    "",
    "React to THAT. If it changes or contradicts something they said earlier, chat should notice.",
  ];
}

function describeSilence(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
