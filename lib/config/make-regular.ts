import { PERSONALITY_LIST } from "../data/personalities";
import { generateUsername, USERNAME_COLORS } from "../data/usernames";
import { buildVoice } from "../data/voices";
import { createRng } from "../engine/rng";
import type { PersonalityId } from "../engine/types";
import type { SavedViewer } from "./roster-store";

/**
 * A regular built outside a session, for the editor's "add someone" button.
 *
 * The engine builds its own people inside `Population`; this exists because
 * the settings page has no engine and needs to produce the same shape. It
 * is pinned from birth: anyone the streamer deliberately created should not
 * be rotated away by the next tier change.
 */
export function makeRegular(
  existing: readonly SavedViewer[],
  seed = Date.now(),
): SavedViewer {
  const rng = createRng(seed);
  const taken = new Set(existing.map((viewer) => viewer.name.toLowerCase()));
  const usedWords = new Set(existing.flatMap((viewer) => viewer.nameWords));
  const { name, words } = generateUsername(rng, taken, usedWords);
  const personality = rng.weighted(PERSONALITY_LIST, (p) => p.weight);
  const verbosity = rng.float(...personality.verbosity);

  return {
    id: `edited-${seed}-${Math.round(rng.float(1000, 9999))}`,
    name,
    nameWords: words,
    color: rng.pick(USERNAME_COLORS),
    personality: personality.id,
    activity: rng.float(...personality.activity),
    verbosity,
    emoteAffinity: rng.float(...personality.emoteAffinity),
    voice: buildVoice(rng, personality.id as PersonalityId, verbosity),
    memory: { topics: [], lines: [], addressed: [] },
    pinned: true,
    seenAt: 0,
  };
}
