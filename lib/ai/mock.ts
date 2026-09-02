import type { CandidateProvider, CandidateRequest } from "./provider";
import type { Reaction } from "./reaction";

/**
 * Offline stand-in for the real provider.
 *
 * Exists so scheduling, timing, emote selection and UI work can be tested
 * without spending a request. On a free tier the scarce resource during
 * development is requests per day, and a morning of clicking through the
 * simulator will exhaust it faster than any real session.
 *
 * It echoes the utterance back so a trace is unambiguous: if these lines
 * appear, the transcript reached the generator.
 */
const SHAPES: ReadonlyArray<(said: string) => Reaction> = [
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

export function createMockProvider(): CandidateProvider {
  return {
    name: "mock",
    async generate(request: CandidateRequest): Promise<Reaction[]> {
      const said = request.utterance.trim() || "nothing";
      return Array.from({ length: request.count }, (_, i) =>
        SHAPES[i % SHAPES.length](said),
      );
    },
  };
}
