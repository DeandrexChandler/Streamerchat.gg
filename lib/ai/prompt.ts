import type { CandidateRequest, IdleStage } from "./provider";
import { GAME_EVENTS } from "./moment";
import { EMOTE_TAGS } from "../engine/types";

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

/**
 * Recent chat lines shown, so a batch does not echo what just went out.
 *
 * Three, not twelve. More turned the model's attention toward continuing
 * chat's own conversation; the job is answering the streamer.
 */
const MAX_RECENT_IN_PROMPT = 3;

/**
 * How chat writes.
 *
 * The register matters more than any single rule: this is a group of people
 * texting the streamer directly, not an audience commentating and not an
 * assistant summarising. Emotes are things people attach to what they said,
 * not a substitute for saying it — a batch that was a third bare emotes
 * read as noise, however good the words between them were.
 */
/** The room is three or four people the streamer knows. */
function conversational(request: CandidateRequest): boolean {
  return (request.roster?.length ?? 0) > 0;
}

/**
 * The length split, which is not the same job at three viewers as at forty.
 *
 * In a crowd, one-word reactions are most of what chat is. In a room of
 * three regulars the same split reads as three people who have nothing to
 * say: "valid", "fair enough", "truuue" on a loop. Sentences carry a
 * conversation; short lines punctuate it.
 */
const LENGTH_CROWD =
  "Length is split down the middle. HALF your lines are one to three words — 'bet', 'Ayo????', 'nah fr', 'mhmm', 'slayyy', 'W take', 'he cooked', 'no shot'. The OTHER HALF are full four-to-ten word thoughts — 'bro spent four hours on that roof', 'wait does it leak when it rains', 'honestly the texture pack carries it'. Count as you go: if the last two were short, write a longer one. Vary the tone and the mood — some hyped, some deadpan, some confused, some warm, some blunt but never mean.";

const LENGTH_ROOM =
  "This is a small room, so people actually talk. MOST lines are real four-to-twelve word thoughts — a question, an opinion, a story, something they noticed, something they remember from earlier. About one line in four is a short reaction ('bet', 'no shot', 'mhmm'). Never stack short agreements: 'valid', 'fair enough', 'truuue' twice in a batch is the tell that nobody is really there. Vary the tone and the mood — some hyped, some deadpan, some confused, some warm, some blunt but never mean.";

const RULES = [
  "Every line is someone talking TO the streamer about what they just said. Not about the stream in general, not to each other.",
  "Mostly lowercase, natural slang, the occasional ALL CAPS line. Typos and stretched words happen: heyyy, slayyy, YOOO, ur, rn, tho. Where a person has their own habits, those win over this.",
  "Answer directly, react with a feeling, ask a follow-up, give an opinion when one was asked for. A couple of lines can be looser or a joke, but the batch stays about what was just said.",
  "Style, not script: 'nah he wylin', 'Ayo????', 'grown adult btw', 'slayyy', 'mhmm', 'i think you can idk tho', 'bet that', 'ooo good idea', 'leave the wall'.",
  "Short lines still react to what was said — not generic filler like nice, real, same, lol stacked up with nothing behind them.",
  "Attach an emote to a line with the \"emote\" field when it fits the feeling. Do not write lines that are only an emote name, except one or two per batch at most.",
  "No trailing punctuation on short lines. No hashtags. No quotation marks. No @mentions. Never number the lines.",
  "NEVER insult, mock, correct or express disappointment in the streamer. Not once, not as a joke. Teasing yourselves is fine.",
  "What the streamer said came from speech recognition, which mangles slang: 'low key' for 'lowkey', 'goaded' for 'goated', initialisms spelled out letter by letter, a name heard as a word. Read it the way it was meant and answer that. Never point out the wording or correct it.",
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

  lines.push(
    "",
    "Rules:",
    `- ${conversational(request) ? LENGTH_ROOM : LENGTH_CROWD}`,
    ...RULES.map((rule) => `- ${rule}`),
  );

  if (request.roster?.length) lines.push("", ...room(request));

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
      `Emotes available, spelled exactly: ${emotes.slice(0, MAX_EMOTES_IN_PROMPT).join(" ")}`,
      "Pick one for a line only when its feeling matches the line. Any other name renders as plain text and looks broken.",
    );
  }

  if (request.frame) {
    lines.push(
      "",
      "The image is the streamer's screen right now. React to what is actually happening in it, not to the game in general. If it contradicts what they said, chat notices that too.",
      `Also return "event": one of ${GAME_EVENTS.join(" | ")} — what the screen shows. Use "unknown" if you cannot tell, "downtime" if nothing is happening.`,
    );
  }

  lines.push(
    "",
    `Return JSON: an object with${request.frame ? ' an "event" string and' : ""} one key "reactions", holding an array of exactly ${count} objects.`,
    "Each object:",
    ...(conversational(request)
      ? ['  { "from": the exact name of the viewer saying it, from the list above,', '    "text": string,']
      : ['  { "text": string,']),
    '    "emotion": one of hype | funny | sad | confused | love | chill,',
    '    "kind": one of answer | reaction | question | opinion | joke | callback | emote,',
    '    "emote": optional — one name from the emotes list to attach to this line, only if its feeling fits,',
    `    "emoteIntent": optional — what the line wants from an emote, one of ${EMOTE_TAGS.join(" | ")}. Say this whenever an emote would fit, even when you also name one: it is what lets a pack without that exact emote still answer with the right kind. ${TAG_GLOSS}`,
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
      return reactingToScreen(request)
        ? request.screen === "asked"
          ? `You are the live chat of a small Twitch stream. The streamer just told chat to look at their screen. ${who} They are looking, right now.`
          : `You are the live chat of a small Twitch stream. Something just happened on the streamer's screen. ${who} They are reacting to it, right now.`
        : drifting(request)
        ? `You are the live chat of a small Twitch stream. ${who} The streamer is busy playing and chat is just hanging out.`
        : request.continuation
        ? `You are the live chat of a small Twitch stream. ${who} They are still talking to the streamer about what the streamer said.`
        : `You are the live chat of a small Twitch stream. The streamer just said something to chat. ${who} They are answering it.`;
  }
}

/**
 * How long chat stays on the streamer's last line before moving on.
 *
 * Idle does not start for minutes, and "stay about THAT line" for all of
 * them is one sentence chewed to nothing. After this, continuations are the
 * room being a room: the game, each other, small talk, the odd callback.
 */
export const DRIFT_AFTER_S = 60;

/** Something just happened on screen, and there is a frame to show it. */
function reactingToScreen(request: CandidateRequest): boolean {
  return request.screen !== undefined && request.frame !== undefined;
}

function drifting(request: CandidateRequest): boolean {
  return request.phase === "active" && request.continuation && request.silenceSeconds >= DRIFT_AFTER_S;
}

/**
 * The room, by name, with the little the engine remembers about each person.
 *
 * This is what makes a regular a person rather than a label stuck on the
 * next line out of the queue: the model writes *as* hazelirl, knowing what
 * hazelirl has been on about, so hazelirl can answer to their own name and
 * the others can answer to it too.
 */
function room(request: CandidateRequest): string[] {
  const roster = request.roster ?? [];
  const lines = [
    "The people in chat right now. These are regulars — they have been here before, they remember this stream, and they know each other:",
    ...roster.map((entry) => {
      // The streamer's own words first: they know their chat, and a
      // hand-written character is worth more than anything measured.
      const character = entry.character ? ` ${entry.character}.` : "";
      const notes = entry.notes ? ` — ${entry.notes}` : "";
      return `  ${entry.name} (${entry.persona})${character}${notes}`;
    }),
    "",
    'Every line is written AS one of these people, in their own voice, and carries "from" with their exact name. Nobody else exists: do not invent names. Spread the lines around rather than giving one person most of them.',
    "They can talk to each other and use each other's names, without an @.",
    "They do not all type the same way. Keep each person's habits — length, caps, punctuation, whether they ask or tell — the same every time they appear, so the streamer can tell who is talking without reading the name. Play it straight: these are small habits, not catchphrases or accents, and nobody announces their own personality.",
  ];

  if (request.addressed) {
    lines.push(
      "",
      `The streamer is talking TO ${request.addressed}. ${request.addressed} answers — that is their line, in their voice, about what was said to them. The others react to that exchange: agreeing, teasing ${request.addressed}, adding their own take. Nobody wonders who was meant.`,
    );
  }

  return lines;
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
  if (reactingToScreen(request)) {
    if (request.screen === "asked") {
      return [
        ...earlier,
        ...(earlier.length > 0 ? [""] : []),
        ...(utterance ? [`The streamer just said: "${utterance}"`, ""] : []),
        "They are pointing chat at their screen. Say what you SEE in the image — the thing they wanted you to look at — and react to it. Do not ask what you are meant to be looking at, and do not talk about the screen in general.",
      ];
    }
    return [
      ...earlier,
      ...(earlier.length > 0 ? [""] : []),
      ...(utterance
        ? [`The streamer last said "${utterance}", about ${describeSilence(silenceSeconds)} ago.`, ""]
        : []),
      "Something just changed on screen. Chat is reacting to THAT, the instant it happened: what the image shows, how it feels, what it means for the run. Short and fast — this is the first second of the reaction, not the analysis.",
    ];
  }

  if (drifting(request)) {
    return [
      ...earlier,
      ...(earlier.length > 0 ? [""] : []),
      `The streamer last said "${utterance}", about ${describeSilence(silenceSeconds)} ago, and has been busy playing since. That is normal on a stream, and nobody mentions that they have gone quiet.`,
      "",
      "Chat is just being chat: reacting to the game and what is on screen, talking to each other, small talk, jokes, backseating, the odd callback to what they said. For this batch lines can be about the stream in general and to each other.",
    ];
  }

  if (continuation) {
    return [
      ...earlier,
      ...(earlier.length > 0 ? [""] : []),
      "The streamer's last words to chat were:",
      `  "${utterance}"`,
      "",
      `That was about ${describeSilence(silenceSeconds)} ago and they haven't said anything since. Chat is still on it: late answers, follow-up questions, opinions, someone riffing on it, someone who only just read it. Stay about THAT line — do not start new subjects, and do not react as though it was just said this second.`,
    ];
  }

  return [
    ...earlier,
    ...(earlier.length > 0 ? [""] : []),
    "The streamer just said, to chat:",
    `  "${utterance}"`,
    "",
    request.classification.intent === "directive" ? DIRECTIVE_NOTE : ANSWER_NOTE,
  ];
}

/** The tags whose names do not explain themselves. */
const TAG_GLOSS =
  "aura = confident, cool, 'he's him'; sus = suspicious, side-eye; troll = smug or sarcastic; cope = copium, denial; comfort = hugs, sympathy; crazy = unhinged; watching = eyes glued, popcorn; freaky = flirty jokes; respect = o7, F; idle = bored or afk.";

const ANSWER_NOTE =
  "Answer THAT. Every line responds to it: answers it, feels something about it, asks about it, or gives the opinion it asked for. If it changes or contradicts something said earlier, chat notices.";

/**
 * The streamer asked chat to post something.
 *
 * The engine posts the requested token itself, from about half the room, so
 * the model's job is the other half — the people reacting to being asked.
 * Left to itself the model wrote the token too, and the two stacked into a
 * wall with nothing readable in it.
 */
const DIRECTIVE_NOTE =
  "They told chat to post something. About half of chat just posts it, and that part is already handled. Write what the rest of chat says: reacting to being asked, hyping it up, joking about it, the odd one adding a word or two to it. Do not write lines that are only the thing they asked for.";

function describeSilence(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
