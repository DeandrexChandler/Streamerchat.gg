import type { ResponsePool } from "../../engine/types";

/**
 * Reaction pools, keyed by what the classifier decided the streamer just did.
 *
 * House style, per the project's "supportive" setting: chat never dunks on the
 * streamer. It *does* get confused, derail, tease each other, and be
 * self-deprecating — that's what keeps it from reading like a corporate
 * mascot. Roasting is aimed sideways or inward, never at the broadcaster.
 *
 * `{kw}` is filled by the template generator with a keyword lifted from the
 * transcript. Entries using it are skipped when no keyword is available, so
 * every slotted line needs a plain sibling nearby.
 */
export const REACTIONS: ResponsePool = {
  greeting: [
    { text: "hi!", length: "tiny", tags: ["warm", "short"] },
    { text: "heyyy", length: "tiny", tags: ["warm", "short"] },
    { text: "yo", length: "tiny", tags: ["short"] },
    { text: "hello hello", length: "short", tags: ["warm"] },
    { text: "good morning (it's 11pm here)", length: "medium", tags: ["joke"] },
    { text: "first time catching you live!", length: "medium", tags: ["newcomer", "warm"] },
    { text: "just got here, what are we doing", length: "medium", tags: ["newcomer", "question"] },
    { text: "hi chat hi streamer", length: "short", tags: ["warm"] },
    { text: "back again", length: "tiny", tags: ["familiar", "short"] },
    { text: "wait i love the new setup", length: "medium", tags: ["compliment", "familiar"] },
    { text: "o/", length: "tiny", tags: ["short", "emote"] },
    { text: "showed up at the perfect time apparently", length: "long", tags: ["newcomer"] },
  ],

  question_to_chat: [
    { text: "yes", length: "tiny", tags: ["short"] },
    { text: "no lol", length: "tiny", tags: ["short", "joke"] },
    { text: "honestly yeah", length: "short", tags: ["conversational"] },
    { text: "i think so?", length: "short", tags: ["conversational"] },
    { text: "hard disagree but go off", length: "medium", tags: ["snark", "joke"] },
    { text: "chat is split on this one", length: "medium", tags: ["conversational"] },
    { text: "the second one for sure", length: "medium", tags: ["conversational"] },
    { text: "whatever you want honestly", length: "medium", tags: ["warm"] },
    { text: "{kw} obviously", length: "short", tags: ["conversational"] },
    { text: "wait what was the question", length: "medium", tags: ["joke", "newcomer"] },
    { text: "i wasn't listening sorry", length: "medium", tags: ["joke"] },
    { text: "do the fun one not the smart one", length: "long", tags: ["joke", "conversational"] },
    { text: "you already know the answer", length: "medium", tags: ["familiar"] },
  ],

  excitement: [
    { text: "LETS GO", length: "tiny", tags: ["hype", "caps", "short"] },
    { text: "YOOO", length: "tiny", tags: ["hype", "caps", "short"] },
    { text: "no way", length: "tiny", tags: ["short"] },
    { text: "NO SHOT", length: "short", tags: ["hype", "caps"] },
    { text: "ok that was actually sick", length: "medium", tags: ["compliment"] },
    { text: "wait that's so cool", length: "medium", tags: ["warm", "compliment"] },
    { text: "chat did we all just see that", length: "long", tags: ["conversational"] },
    { text: "CLIP IT", length: "tiny", tags: ["hype", "caps", "short"] },
    { text: "someone clip that pls", length: "medium", tags: ["conversational"] },
    { text: "i'm actually cheering", length: "medium", tags: ["warm"] },
    { text: "the {kw} part got me", length: "medium", tags: ["conversational"] },
    { text: "okay okay okay", length: "short", tags: ["hype"] },
    { text: "SHEEESH", length: "tiny", tags: ["hype", "caps", "short"] },
  ],

  struggle: [
    { text: "you got this", length: "short", tags: ["warm"] },
    { text: "take your time", length: "short", tags: ["warm"] },
    { text: "so close", length: "tiny", tags: ["short", "warm"] },
    { text: "that was NOT your fault", length: "medium", tags: ["warm", "caps"] },
    { text: "genuinely unlucky", length: "short", tags: ["warm"] },
    { text: "i would've done way worse", length: "medium", tags: ["warm", "joke"] },
    { text: "i'd have quit 20 minutes ago ngl", length: "long", tags: ["joke"] },
    { text: "we believe in you", length: "short", tags: ["warm"] },
    { text: "the {kw} is just broken tbh", length: "medium", tags: ["conversational", "warm"] },
    { text: "deep breath, you're fine", length: "medium", tags: ["warm"] },
    { text: "chat send good vibes", length: "medium", tags: ["conversational", "warm"] },
    { text: "nooo", length: "tiny", tags: ["short"] },
    { text: "it's not you it's the game", length: "medium", tags: ["warm"] },
  ],

  achievement: [
    { text: "LETS GOOO", length: "short", tags: ["hype", "caps"] },
    { text: "knew you'd get it", length: "medium", tags: ["warm", "familiar"] },
    { text: "GG", length: "tiny", tags: ["short"] },
    { text: "that's the one!!", length: "short", tags: ["hype"] },
    { text: "deserved", length: "tiny", tags: ["short", "warm"] },
    { text: "you made that look easy", length: "medium", tags: ["compliment"] },
    { text: "i never doubted you (i did)", length: "long", tags: ["joke", "warm"] },
    { text: "proud of you honestly", length: "medium", tags: ["warm"] },
    { text: "FINALLY", length: "tiny", tags: ["hype", "caps", "short"] },
    { text: "the grind paid off", length: "medium", tags: ["warm"] },
  ],

  story: [
    { text: "no wayyy", length: "short", tags: ["short"] },
    { text: "wait go back", length: "short", tags: ["question"] },
    { text: "and then what", length: "short", tags: ["question", "conversational"] },
    { text: "this is such a good story", length: "medium", tags: ["warm"] },
    { text: "i'm invested now", length: "short", tags: ["conversational"] },
    { text: "the {kw} part is wild", length: "medium", tags: ["conversational"] },
    { text: "chat we're in lore mode", length: "medium", tags: ["joke", "conversational"] },
    { text: "this happened to me too actually", length: "long", tags: ["conversational"] },
    { text: "i need part two", length: "short", tags: ["conversational"] },
    { text: "please tell me it gets better", length: "long", tags: ["question"] },
    { text: "you can't just say that and move on", length: "long", tags: ["conversational", "snark"] },
  ],

  confusion: [
    { text: "same", length: "tiny", tags: ["short"] },
    { text: "i'm equally lost", length: "short", tags: ["conversational"] },
    { text: "wait what", length: "short", tags: ["short"] },
    { text: "chat is anyone following this", length: "long", tags: ["conversational", "question"] },
    { text: "i thought it was just me", length: "medium", tags: ["conversational"] },
    { text: "try the {kw} one", length: "short", tags: ["conversational"] },
    { text: "check the menu maybe?", length: "medium", tags: ["question", "conversational"] },
    { text: "we're all figuring this out together", length: "long", tags: ["warm"] },
    { text: "no idea but i'm rooting for you", length: "long", tags: ["warm", "joke"] },
    { text: "huh", length: "tiny", tags: ["short"] },
  ],

  showing: [
    { text: "ooooh", length: "tiny", tags: ["short"] },
    { text: "that's so pretty", length: "short", tags: ["warm", "compliment"] },
    { text: "wait i love that", length: "short", tags: ["warm", "compliment"] },
    { text: "how long did that take", length: "medium", tags: ["question"] },
    { text: "the detail on the {kw}", length: "medium", tags: ["compliment", "conversational"] },
    { text: "okay that's genuinely impressive", length: "medium", tags: ["compliment"] },
    { text: "i could never", length: "short", tags: ["warm", "joke"] },
    { text: "put a lantern there", length: "short", tags: ["conversational"] },
    { text: "zoom in pls", length: "short", tags: ["question", "short"] },
    { text: "screenshot worthy fr", length: "medium", tags: ["compliment"] },
    { text: "this is my favorite part of the stream", length: "long", tags: ["warm", "familiar"] },
  ],

  farewell: [
    { text: "byeee", length: "tiny", tags: ["warm", "short"] },
    { text: "gn!", length: "tiny", tags: ["warm", "short"] },
    { text: "thanks for streaming", length: "medium", tags: ["warm"] },
    { text: "this was fun", length: "short", tags: ["warm"] },
    { text: "get some rest", length: "short", tags: ["warm"] },
    { text: "same time tomorrow?", length: "medium", tags: ["question", "familiar"] },
    { text: "o7", length: "tiny", tags: ["short", "emote"] },
    { text: "already miss it", length: "short", tags: ["warm", "joke"] },
  ],

  mundane: [
    { text: "true", length: "tiny", tags: ["short"] },
    { text: "fair", length: "tiny", tags: ["short"] },
    { text: "real", length: "tiny", tags: ["short"] },
    { text: "yeah", length: "tiny", tags: ["short"] },
    { text: "mm", length: "tiny", tags: ["short"] },
    { text: "makes sense", length: "short", tags: ["conversational"] },
    { text: "i feel that", length: "short", tags: ["warm"] },
    { text: "hm", length: "tiny", tags: ["short"] },
    { text: "wait really", length: "short", tags: ["question", "short"] },
    { text: "{kw}?", length: "tiny", tags: ["question", "short"] },
    { text: "that's kind of a good point", length: "medium", tags: ["conversational"] },
    { text: "chat thoughts", length: "short", tags: ["conversational", "question"] },
  ],
};
