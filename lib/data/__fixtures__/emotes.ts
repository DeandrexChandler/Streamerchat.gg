import type { Emote } from "../../engine/types";

/**
 * Emote corpus for tests.
 *
 * Real 7TV ids and CDN urls rather than invented ones, so a test that
 * accidentally depends on url shape fails here rather than in production.
 * Nothing is fetched — these are literals and the suite stays offline.
 *
 * Covers all six known moods so mood-sensitive selection can be tested
 * without importing a live pack.
 */
export const FIXTURE_EMOTES: readonly Emote[] = [
  { id: "01F61B1440000991F7SWQNMVX7", name: "KEKW", mood: "funny", url: "https://cdn.7tv.app/emote/01F61B1440000991F7SWQNMVX7/2x.webp", width: 64, height: 64 },
  { id: "01F00Z3A9G0007E4VV006YKSK9", name: "OMEGALUL", mood: "funny", url: "https://cdn.7tv.app/emote/01F00Z3A9G0007E4VV006YKSK9/2x.webp", width: 64, height: 64 },
  { id: "01EZPG1FN80001SNAW00ADK2DY", name: "Sadge", mood: "sad", url: "https://cdn.7tv.app/emote/01EZPG1FN80001SNAW00ADK2DY/2x.webp", width: 64, height: 64 },
  { id: "01F010G3WG0007E4VV006YKSKP", name: "PepeHands", mood: "sad", url: "https://cdn.7tv.app/emote/01F010G3WG0007E4VV006YKSKP/2x.webp", width: 64, height: 64 },
  { id: "01F6NPHCN0000BEKN8ZXWQNSDC", name: "monkaW", mood: "sad", url: "https://cdn.7tv.app/emote/01F6NPHCN0000BEKN8ZXWQNSDC/2x.webp", width: 64, height: 64 },
  { id: "01F6MZGCNG000255K4X1K7NTHR", name: "GIGACHAD", mood: "hype", url: "https://cdn.7tv.app/emote/01F6MZGCNG000255K4X1K7NTHR/2x.webp", width: 64, height: 64 },
  { id: "01F6P0803G000898NRWSAKGYXT", name: "POGGERS", mood: "hype", url: "https://cdn.7tv.app/emote/01F6P0803G000898NRWSAKGYXT/2x.webp", width: 64, height: 64 },
  { id: "01F6NPP6YG00013ACMMJP3W06V", name: "peepoLove", mood: "love", url: "https://cdn.7tv.app/emote/01F6NPP6YG00013ACMMJP3W06V/2x.webp", width: 64, height: 64 },
  { id: "01F6T8NM9R0007M5BTFWSP1YSJ", name: "Clueless", mood: "confused", url: "https://cdn.7tv.app/emote/01F6T8NM9R0007M5BTFWSP1YSJ/2x.webp", width: 64, height: 64 },
  { id: "01F6MA6Y100002B6P5MWZ5D916", name: "Hmm", mood: "confused", url: "https://cdn.7tv.app/emote/01F6MA6Y100002B6P5MWZ5D916/2x.webp", width: 64, height: 64 },
  { id: "01F6MQ33FG000FFJ97ZB8MWV52", name: "catJAM", mood: "chill", url: "https://cdn.7tv.app/emote/01F6MQ33FG000FFJ97ZB8MWV52/2x.webp", width: 64, height: 64 },
  { id: "01F6MXJD8R000F76KNAAV5HDGD", name: "Bedge", mood: "chill", url: "https://cdn.7tv.app/emote/01F6MXJD8R000F76KNAAV5HDGD/2x.webp", width: 64, height: 64 },
];
