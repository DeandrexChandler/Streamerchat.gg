import type { Classification, Intent, Sentiment } from "./types";

/**
 * Deterministic transcript classifier.
 *
 * This is the module that keeps AI out of the hot path. Deciding "the streamer
 * just asked chat something" or "the streamer is frustrated" does not need a
 * language model — pattern matching gets it right the large majority of the
 * time, instantly and for free. The `confidence` it reports is what the
 * director later uses to decide whether a moment is worth spending an AI call
 * on.
 */

/** Signal words per intent. Matched on word boundaries against lowercased text. */
const INTENT_SIGNALS: Readonly<Record<Intent, readonly string[]>> = {
  greeting: [
    "hello", "hi", "hey", "welcome", "good morning", "good evening",
    "what's up", "whats up", "we're live", "were live", "we live",
    "morning everyone", "hey chat", "hi chat", "yo chat",
  ],
  farewell: [
    "goodbye", "good night", "goodnight", "see you", "see ya", "later",
    "wrapping up", "wrap up", "end the stream", "ending stream", "last one",
    "that's it for", "thats it for", "thanks for watching", "gn",
  ],
  question_to_chat: [
    "what do you think", "should i", "chat what", "you guys think",
    "any ideas", "any suggestions", "which one", "help me", "thoughts",
    "am i crazy", "right chat", "anyone know", "does anyone", "tell me",
  ],
  excitement: [
    "let's go", "lets go", "no way", "oh my", "insane", "crazy", "unreal",
    "amazing", "incredible", "holy", "yes yes", "wow", "look at that",
    "that was sick", "so good", "beautiful",
    // Slang. "goes hard" is a phrase on purpose — bare "hard" is difficulty,
    // which belongs to struggle.
    "sick", "clutch", "goes hard", "went hard", "fire", "banger", "goated",
    "cracked", "no shot", "sheesh", "actual cinema", "cinema", "clean",
    "nuts", "peak", "bussin", "cold", "dub", "ez clap", "poggers", "lets goo",
  ],
  struggle: [
    "come on", "why", "are you kidding", "seriously", "this is impossible",
    "i can't", "i cant", "so annoying", "hate this", "frustrating",
    "not again", "every time", "give up", "struggling", "i'm dying",
    "im dying", "so bad at this", "messed up", "ugh", "oh no", "no no",
    "you're kidding", "youre kidding", "come onnn", "nooo", "dang it",
    "what the", "of course", "typical",
    // Slang.
    "cooked", "washed", "griefing", "throwing", "taking forever", "so rough",
    "was rough", "brutal", "clapped", "unlucky", "pain", "diff", "trolling",
    "bruh", "why is this", "not again man", "im done", "i'm done",
  ],
  achievement: [
    "got it", "finally", "did it", "made it", "beat it", "we did it",
    "nailed it", "there we go", "that's it", "thats it", "cleared",
    "completed", "first try", "figured it out",
  ],
  confusion: [
    "i don't know", "i dont know", "no idea", "what is", "how do i",
    "how does", "confused", "wait what", "hold on", "i'm lost", "im lost",
    "does this", "what happened", "not sure", "hmm",
    // Slang and verbal shrugs.
    "huh", "dunno", "no clue", "wdym", "ayo", "wait wait", "what is going on",
    "im lost", "run that back", "come again",
  ],
  showing: [
    "look at", "check this", "check it out", "see this", "take a look",
    "watch this", "here's the", "heres the", "i built", "i made",
    "turned out", "show you", "zoom in",
  ],
  story: [
    "so yesterday", "one time", "back when", "reminds me", "story time",
    "i remember", "the other day", "last week", "funny thing",
    "did i tell you", "long story",
  ],
  mundane: [],
};

const POSITIVE_WORDS = [
  "good", "great", "nice", "love", "happy", "fun", "cool", "awesome",
  "beautiful", "perfect", "amazing", "yes", "thanks", "cozy", "chill",
  "excited", "wonderful", "glad", "enjoy", "pretty", "sweet", "best",
  // Slang praise.
  "sick", "fire", "clean", "goated", "cracked", "clutch", "dub", "banger",
  "peak", "elite", "valid", "based", "bussin", "insane", "nuts", "cinema",
];

const NEGATIVE_WORDS = [
  "bad", "hate", "awful", "terrible", "annoying", "angry", "sad", "worst",
  "broken", "stupid", "boring", "tired", "sorry", "wrong", "fail", "ugh",
  "can't", "cant", "no", "never", "hard", "difficult", "stuck",
  // Slang complaints.
  "cooked", "washed", "mid", "trash", "rough", "brutal", "clapped", "cringe",
  "ass", "garbage", "unlucky", "pain", "griefing",
];

/** Words too common to be useful as template slots. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "so", "because", "as",
  "of", "at", "by", "for", "with", "about", "into", "through", "to", "from",
  "in", "on", "out", "up", "down", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would", "can",
  "could", "should", "i", "you", "he", "she", "it", "we", "they", "me", "him",
  "her", "us", "them", "my", "your", "his", "its", "our", "their", "this",
  "that", "these", "those", "am", "just", "really", "very", "like", "know",
  "think", "get", "got", "go", "going", "want", "one", "now", "here", "there",
  "what", "when", "where", "how", "why", "who", "all", "some", "any", "not",
  "gonna", "kinda", "okay", "ok", "yeah", "yep", "nah", "uh", "um", "well",
  "right", "thing", "stuff", "actually", "literally", "basically", "guys",
  "chat", "guy", "look", "see", "let", "make", "made", "take", "come",
]);

/**
 * Intents that describe a *state* the streamer is still in, and so can carry
 * across a silent utterance. Punctual events are excluded: "hello" and "we
 * did it" describe a moment that has already passed, and inheriting them makes
 * chat greet the streamer in response to an unrelated sentence 8 seconds later.
 */
const SUSTAINED_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "story",
  "struggle",
  "confusion",
  "showing",
]);

function countMatches(haystack: string, needles: readonly string[]): number {
  let hits = 0;
  for (const needle of needles) {
    if (needle.includes(" ")) {
      if (haystack.includes(needle)) hits++;
    } else {
      // Word-boundary match so "hi" doesn't fire inside "this".
      const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(haystack)) hits++;
    }
  }
  return hits;
}

function scoreSentiment(text: string): { sentiment: Sentiment; magnitude: number } {
  const positive = countMatches(text, POSITIVE_WORDS);
  const negative = countMatches(text, NEGATIVE_WORDS);
  const magnitude = positive + negative;

  if (positive > negative) return { sentiment: "positive", magnitude };
  if (negative > positive) return { sentiment: "negative", magnitude };
  return { sentiment: "neutral", magnitude };
}

function extractKeywords(raw: string): string[] {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  // Frequency rank, so a word the streamer repeats wins over a passing mention.
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Estimates how animated the streamer is, 0..1.
 *
 * `audioEnergy` (0..1 RMS from the mic) is folded in when available — it's a
 * better excitement signal than the words alone, because someone shouting
 * "oh no" and someone muttering it produce identical transcripts.
 */
function scoreEnergy(
  raw: string,
  wordCount: number,
  magnitude: number,
  audioEnergy?: number,
): number {
  const letters = raw.replace(/[^a-zA-Z]/g, "");
  const capsRatio = letters.length >= 4
    ? letters.split("").filter((c) => c >= "A" && c <= "Z").length / letters.length
    : 0;

  const exclamations = Math.min(3, (raw.match(/!/g) ?? []).length) / 3;
  const pace = Math.min(1, wordCount / 40);
  const emotional = Math.min(1, magnitude / 4);

  let energy =
    0.35 * emotional + 0.25 * capsRatio + 0.2 * exclamations + 0.2 * pace;

  if (audioEnergy !== undefined) {
    energy = 0.6 * energy + 0.4 * Math.max(0, Math.min(1, audioEnergy));
  }

  return Math.max(0, Math.min(1, energy));
}

export interface ClassifyOptions {
  /** 0..1 mic loudness for this utterance, if the audio pipeline measured it. */
  audioEnergy?: number;
  /**
   * What the streamer was doing a moment ago.
   *
   * Speech arrives one utterance at a time, but people don't reset topic every
   * sentence — mid-story lines like "and then my manager walked in" carry no
   * signal words of their own and would otherwise classify as `mundane`,
   * dropping chat out of the conversation. When the current utterance is
   * genuinely ambiguous, we inherit the previous intent instead.
   */
  previousIntent?: Intent;
  /** Ms since the previous utterance. Inheritance decays with the gap. */
  msSincePrevious?: number;
}

export function classify(
  transcript: string,
  options: ClassifyOptions = {},
): Classification {
  const raw = transcript.trim();
  const lower = raw.toLowerCase();
  const wordCount = raw ? raw.split(/\s+/).length : 0;

  if (wordCount === 0) {
    return {
      intent: "mundane",
      sentiment: "neutral",
      energy: 0,
      keywords: [],
      confidence: 0,
    };
  }

  // Score every intent, then take the best.
  let bestIntent: Intent = "mundane";
  let bestScore = 0;
  for (const [intent, signals] of Object.entries(INTENT_SIGNALS) as [
    Intent,
    readonly string[],
  ][]) {
    const score = countMatches(lower, signals);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // A trailing "?" is strong evidence chat is being addressed, but only if the
  // streamer didn't already land on a more specific intent.
  const endsWithQuestion = /\?\s*$/.test(raw);
  if (endsWithQuestion && (bestScore === 0 || bestIntent === "mundane")) {
    bestIntent = "question_to_chat";
    bestScore = Math.max(bestScore, 1);
  }

  const { sentiment, magnitude } = scoreSentiment(lower);

  // Sentiment disambiguates the two intents that share vocabulary.
  if (bestIntent === "mundane" && magnitude >= 2) {
    bestIntent = sentiment === "positive" ? "excitement" : "struggle";
    bestScore = 1;
  }

  // Inherit the previous intent when this utterance said nothing distinctive
  // and the streamer is still mid-thought.
  const CONTINUATION_WINDOW_MS = 20_000;
  let inherited = false;
  if (
    bestScore === 0 &&
    bestIntent === "mundane" &&
    options.previousIntent &&
    SUSTAINED_INTENTS.has(options.previousIntent) &&
    (options.msSincePrevious ?? Infinity) < CONTINUATION_WINDOW_MS
  ) {
    bestIntent = options.previousIntent;
    inherited = true;
  }

  const energy = scoreEnergy(raw, wordCount, magnitude, options.audioEnergy);

  // Confidence: how much signal did we actually find, relative to how much
  // text we had to work with? A long utterance that matched one keyword is
  // less convincing than a short one that matched the same keyword.
  const density = bestScore / Math.max(1, Math.sqrt(wordCount));
  const confidence = Math.max(
    0,
    Math.min(
      1,
      // Inherited intents are a guess, so they stay in the band where the
      // director is willing to spend an AI call for something better.
      inherited ? 0.4 : bestScore === 0 ? 0.15 : 0.35 + density * 0.9,
    ),
  );

  return {
    intent: bestIntent,
    sentiment,
    energy,
    keywords: extractKeywords(raw),
    confidence,
  };
}
