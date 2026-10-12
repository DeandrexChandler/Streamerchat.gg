import type {
  CandidateProvider,
  CandidateRequest,
  GenerateOptions,
  GenerationResult,
} from "./provider";
import type { Reaction } from "./reaction";

/**
 * Scripted stand-in for the real provider.
 *
 * Test infrastructure and the headless harness only. It is never selected by
 * configuration and there is no code path by which a running simulator can
 * reach it — the route constructs the Gemini provider unconditionally.
 *
 * Phase-aware so the harness output reads as the moment it is for: a startup
 * batch says hello, an idle batch notices the silence. The active shape echoes
 * the utterance so a trace is unambiguous: if those lines appear, the
 * transcript reached the generator.
 */

const STARTUP: ReadonlyArray<Reaction> = [
  { text: "hi", emotion: "chill", kind: "reaction", eagerness: 1 },
  { text: "YOOO", emotion: "hype", kind: "reaction", eagerness: 1 },
  { text: "im early", emotion: "chill", kind: "reaction", eagerness: 0.9 },
  { text: "streamer just booted up", emotion: "chill", kind: "reaction", eagerness: 0.8 },
  { text: "just in time", emotion: "chill", kind: "reaction", eagerness: 0.7 },
  { text: "we're here", emotion: "hype", kind: "reaction", eagerness: 0.7 },
  { text: "hello hello", emotion: "love", kind: "reaction", eagerness: 0.6 },
  { text: "what are we doing today", emotion: "chill", kind: "question", eagerness: 0.4 },
  { text: "first", emotion: "hype", kind: "reaction", eagerness: 0.9 },
  { text: "notification gang", emotion: "chill", kind: "joke", eagerness: 0.5 },
  { text: "made it", emotion: "chill", kind: "reaction", eagerness: 0.6 },
  { text: "lets gooo", emotion: "hype", kind: "reaction", eagerness: 0.8 },
];

const ACTIVE: ReadonlyArray<(said: string) => Reaction> = [
  (s) => ({ text: `mock: heard "${s}"`, emotion: "chill", kind: "reaction", eagerness: 1 }),
  () => ({ text: "W", emotion: "hype", kind: "reaction", eagerness: 1 }),
  () => ({ text: "LMAO", emotion: "funny", kind: "reaction", eagerness: 0.9 }),
  () => ({ text: "wait what", emotion: "confused", kind: "question", eagerness: 0.8 }),
  () => ({ text: "yooo", emotion: "hype", kind: "reaction", eagerness: 0.9 }),
  (s) => ({ text: `so we're doing ${s.split(" ").slice(-2).join(" ")} now`, emotion: "chill", kind: "joke", eagerness: 0.4 }),
  () => ({ text: "honestly same", emotion: "chill", kind: "agree", eagerness: 0.5 }),
  () => ({ text: "nah i disagree", emotion: "confused", kind: "disagree", eagerness: 0.4 }),
  () => ({ text: "chat what did i miss", emotion: "confused", kind: "question", eagerness: 0.2 }),
  () => ({ text: "i genuinely did not expect that", emotion: "hype", kind: "reaction", eagerness: 0.3 }),
  () => ({ text: "still thinking about that", emotion: "chill", kind: "callback", eagerness: 0.1 }),
  () => ({ text: "peak", emotion: "hype", kind: "reaction", eagerness: 0.7 }),
];

const CONTINUATION: ReadonlyArray<Reaction> = [
  { text: "anyway", emotion: "chill", kind: "reaction", eagerness: 0.5 },
  { text: "still on that", emotion: "chill", kind: "callback", eagerness: 0.3 },
  { text: "no because same", emotion: "funny", kind: "agree", eagerness: 0.6 },
  { text: "ok but what about the other thing", emotion: "confused", kind: "question", eagerness: 0.4 },
  { text: "lol", emotion: "funny", kind: "reaction", eagerness: 0.9 },
  { text: "true", emotion: "chill", kind: "agree", eagerness: 0.8 },
  { text: "chat is cooking today", emotion: "hype", kind: "joke", eagerness: 0.3 },
  { text: "wait go back", emotion: "confused", kind: "question", eagerness: 0.5 },
];

const IDLE: ReadonlyArray<(stage: number) => Reaction> = [
  (n) => ({ text: n >= 3 ? "u still there" : "focused", emotion: "chill", kind: "question", eagerness: 0.6 }),
  (n) => ({ text: n >= 2 ? "streamer afk" : "locked in", emotion: "chill", kind: "reaction", eagerness: 0.8 }),
  () => ({ text: "hello?", emotion: "confused", kind: "question", eagerness: 0.5 }),
  (n) => ({ text: n >= 4 ? "what did everyone have for dinner" : "quiet stream today", emotion: "chill", kind: "joke", eagerness: 0.3 }),
  () => ({ text: "mic muted?", emotion: "confused", kind: "question", eagerness: 0.7 }),
  () => ({ text: "we wait", emotion: "chill", kind: "reaction", eagerness: 0.9 }),
  (n) => ({ text: `mock: idle stage ${n}`, emotion: "chill", kind: "reaction", eagerness: 0.4 }),
  () => ({ text: "chat entertain me", emotion: "funny", kind: "joke", eagerness: 0.3 }),
];

/**
 * Small variations, so a long run does not exhaust the vocabulary.
 *
 * The engine never lets one viewer say the same line twice in a session.
 * A real model writes sixty distinct lines per batch; twelve fixed shapes
 * would run every viewer dry inside a minute at the top tier and make the
 * harness measure the mock's poverty rather than the engine's pacing.
 */
const VARIANTS = [
  "", " fr", " lmao", " tbh", " ngl", " honestly", " no way", " ok",
  " lol", " bro", " tho", " rn", " istg", " omg", " sheesh", " again",
];

const PREFIXES = ["", "ok ", "nah ", "wait ", "yo ", "lmao ", "bro ", "no "];

function vary(reaction: Reaction, index: number): Reaction {
  const suffix = VARIANTS[Math.floor(index / 12) % VARIANTS.length];
  const prefix = PREFIXES[Math.floor(index / (12 * VARIANTS.length)) % PREFIXES.length];
  return { ...reaction, text: `${prefix}${reaction.text}${suffix}` };
}

export function createMockProvider(): CandidateProvider {
  let served = 0;

  return {
    name: "mock",
    async generate(request: CandidateRequest, options?: GenerateOptions): Promise<GenerationResult> {
      const { count } = request;
      const base = served;
      served += count;

      const reactions: Reaction[] = Array.from({ length: count }, (_, i) => {
        const n = base + i;
        if (request.phase === "startup") return vary(STARTUP[n % STARTUP.length], n);
        if (request.phase === "idle") {
          return vary(IDLE[n % IDLE.length](request.idleStage ?? 1), n);
        }
        if (request.continuation) return vary(CONTINUATION[n % CONTINUATION.length], n);
        const said = request.utterance.trim() || "nothing";
        return vary(ACTIVE[n % ACTIVE.length](said), n);
      });

      options?.onLines?.(reactions);
      return { reactions, status: "ok" };
    },
  };
}
