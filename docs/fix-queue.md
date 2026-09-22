# Fix queue

Reported from a five minute live session, 2026-09-20. One at a time, in
whatever order the owner picks.

Each entry records what was seen, what the code does now, and where it
lives — so picking one up later does not mean re-deriving it.

---

## 1. No way to mute the mic while chat keeps going — done

"Mute mic" toggle in the control panel. It releases the microphone the same
way Pause does (recording indicator off) while chat, typed input, idle and
screen events carry on. Stays muted across Pause, Play and Clear until
switched back; unmuting reopens the mic only while chat is running.

---

## 2. "Watch my screen" is far too slow to respond

**Seen:** noticeable lag between something happening and chat reacting.

**Now:** a frame rides along with a batch, and the whole batch waits on one
Gemini call. Measured latency in this session was 5.5 to 7.5 seconds, with
one 12 second timeout. `SCREEN_TRIGGER_COOLDOWN_MS` in
`lib/engine/engine.ts` adds up to 12 more before a screen change can pull a
batch forward. Worst case is roughly 20 seconds from event to first line.

**Owner's direction:** paid solutions are acceptable here. Look at how
Cluely and Clicky handle screen-aware latency.

**Shape of the fix:** the batch model is the problem, not the provider —
one slow call gates every line. Worth considering a small fast call for the
event label only, separate from the batch that writes the words, so chat
can react before it knows what to say. Note this breaks the "never one call
per message" rule in CLAUDE.md if done carelessly.

---

## 3. Capture on a hotkey rather than continuously

**Owner's idea:** only capture when a hotkey is pressed, which sidesteps the
privacy surface of continuous capture.

**Now:** `ScreenCapture` in `lib/audio/screen-capture.ts` holds the stream
for the whole session once the toggle is on, and `grab()` is called on every
batch.

**Shape of the fix:** keep the stream but only `grab()` on the hotkey, or
only start the stream on the hotkey. The first is far simpler and already
most of the privacy benefit, since nothing leaves the machine between
presses. Interacts with item 2: hotkey capture makes latency worse, not
better, unless the press itself triggers the batch.

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
