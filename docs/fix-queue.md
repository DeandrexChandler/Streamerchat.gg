# Fix queue

Reported from a five minute live session, 2026-09-20. One at a time, in
whatever order the owner picks.

Each entry records what was seen, what the code does now, and where it
lives — so picking one up later does not mean re-deriving it.

---

## 1. No way to mute the mic while chat keeps going — done

A mic button beside the mic meter in the control panel: its ring moves with your voice while
live, and it turns red with a struck-through mic when muted. It releases the microphone the same
way Pause does (recording indicator off) while chat, typed input, idle and
screen events carry on. Stays muted across Pause, Play and Clear until
switched back; unmuting reopens the mic only while chat is running.

---

## 2. "Watch my screen" is far too slow to respond — done

Where the time went, worst case about 20–30s from a death to chat noticing:
up to 12s of trigger cooldown, waiting for any refill already on the wire,
a full-size batch (~4s), and then its lines appended *behind* a queue of up
to 24s of chat about whatever came before.

Now: the screen batch is small (6–12 lines, measured 1.2–2.6s against
3.9–4.1s for 30), goes to the front of the queue, drops a routine refill
that was in the way, and the prompt leads with "something just changed on
screen". Cooldown 12s → 8s. It also works before the streamer has said
anything, once the arrival wave is out. Expected event-to-first-line: about
2–3 seconds.

Not done: a streaming/realtime model (what Cluely-style tools use). That is
a second Gemini model and breaks the one-model rule; revisit only if 2–3s
still feels slow live.

---

## 3. Capture on a hotkey rather than continuously — dropped

Makes reactions later, not sooner. Recorded in the roadmap's deferred list,
along with a screen-share privacy warning for Phase 3.

---

## 4. One chatter posting four times in a row, replying to themselves — done

- Cause of the self-replies: in a developing topic the director brought back
  a past participant without the speaking cooldown, so whoever just spoke
  was often next, on lines that build on each other. Returning voices now
  sit out their cooldown like everyone else.
- `MAX_CONSECUTIVE` 5 → 3.
- Rolling cap: no viewer posts more than 3 lines in 10 seconds, in a row or
  not (`MAX_POSTS_IN_WINDOW`, `POST_WINDOW_MS` in `lib/engine/roster.ts`).
  Free again once the window passes.
- The sampler now reports back-to-back share, longest run and most lines by
  one person in 5s. caseoh_ (803 lines) and valkyrae (17 lines, 4 chatters):
  0% back to back, at most 3–5 in 5s.
- Not done: the model marking which line answers which. Revisit if a
  question and its answer still land on one name a few lines apart.

---

## 5. Idle mode arrives far too early — done

- Idle stages now at 5 / 8 / 12 / 20 minutes (were 1 / 2.5 / 5 / 10).
- After a minute on the streamer's last line, continuations drift to normal
  stream chatter — the game, each other, small talk — and never mention the
  quiet (`DRIFT_AFTER_S` in `lib/ai/prompt.ts`).
- With capture on, a screen event resets the idle clock. Idle only comes
  when the streamer and the screen are both quiet.

---

## 6. Remove the Emotes toggle — done

The setting and toggle are gone. An empty pack is the only way to turn
emotes off.

---

## 7. Remove the default emote list — done

No first-run import. A fresh install is pure text until a pack is imported
from the emotes page; the banner in the simulator says so.
