import type { Personality, PersonalityId } from "../engine/types";

/**
 * Viewer archetypes.
 *
 * `weight` controls how common each archetype is in a fresh population. The
 * shape here is deliberately lurker-heavy: in a real small stream most people
 * present never say anything, a handful carry the conversation, and one person
 * is posting emotes constantly. Flattening these weights is the fastest way to
 * make the chat feel like a bot farm.
 */
export const PERSONALITIES: Readonly<Record<PersonalityId, Personality>> = {
  lurker: {
    id: "lurker",
    label: "Lurker",
    weight: 30,
    activity: [0.02, 0.12],
    verbosity: [0.0, 0.25],
    emoteAffinity: [0.4, 0.8],
    tagBias: { short: 1.6, emote: 1.5, question: 0.3 },
  },
  chatty: {
    id: "chatty",
    label: "Chatty regular",
    weight: 16,
    activity: [0.5, 0.9],
    verbosity: [0.4, 0.75],
    emoteAffinity: [0.2, 0.5],
    tagBias: { conversational: 1.7, short: 0.8 },
  },
  hype: {
    id: "hype",
    label: "Hype viewer",
    weight: 13,
    activity: [0.45, 0.85],
    verbosity: [0.05, 0.3],
    emoteAffinity: [0.6, 0.95],
    tagBias: { hype: 2.0, caps: 1.8, emote: 1.4, calm: 0.4 },
  },
  wholesome: {
    id: "wholesome",
    label: "Wholesome",
    weight: 11,
    activity: [0.3, 0.6],
    verbosity: [0.35, 0.7],
    emoteAffinity: [0.3, 0.6],
    tagBias: { warm: 2.0, compliment: 1.8, snark: 0.2 },
  },
  curious: {
    id: "curious",
    label: "Question asker",
    weight: 9,
    activity: [0.3, 0.65],
    verbosity: [0.4, 0.8],
    emoteAffinity: [0.1, 0.35],
    tagBias: { question: 2.4, conversational: 1.3, emote: 0.5 },
  },
  jokester: {
    id: "jokester",
    label: "Bit-doer",
    weight: 8,
    activity: [0.35, 0.7],
    verbosity: [0.3, 0.7],
    emoteAffinity: [0.35, 0.7],
    tagBias: { joke: 2.2, snark: 1.6, warm: 0.7 },
  },
  emoter: {
    id: "emoter",
    label: "Emote spammer",
    weight: 7,
    activity: [0.55, 0.95],
    verbosity: [0.0, 0.1],
    emoteAffinity: [0.9, 1.0],
    tagBias: { emote: 3.0, short: 2.0, conversational: 0.1, question: 0.1 },
  },
  regular: {
    id: "regular",
    label: "Long-time regular",
    weight: 4,
    activity: [0.4, 0.75],
    verbosity: [0.35, 0.7],
    emoteAffinity: [0.25, 0.55],
    tagBias: { familiar: 2.2, conversational: 1.4 },
  },
  newcomer: {
    id: "newcomer",
    label: "Just arrived",
    weight: 2,
    activity: [0.25, 0.55],
    verbosity: [0.3, 0.6],
    emoteAffinity: [0.15, 0.4],
    tagBias: { newcomer: 3.0, question: 1.5, familiar: 0.1 },
  },
};

export const PERSONALITY_LIST = Object.values(PERSONALITIES);
