# Fix queue

Reported from a five minute live session, 2026-09-20. One at a time, in
whatever order the owner picks. Nothing here is started.

Each entry records what was seen, what the code does now, and where it
lives — so picking one up later does not mean re-deriving it.

---

## 1. No way to mute the mic while chat keeps going

**Seen:** no control to stop the mic without stopping chat.

**Now:** the only stop is Pause, which halts the whole simulation —
`pause()` in `lib/react/use-simulator.ts` tears down `MicSession`, stops the
recogniser, drops the queue and freezes release. There is no mute anywhere
in the codebase.

**Shape of the fix:** a mute that stops transcription reaching
`handleTranscript` while the engine keeps ticking. Open question worth
deciding first: does mute release the microphone entirely (browser
recording indicator goes off, matches the existing privacy stance from
`pause()`) or keep the level meter alive? Releasing it is the honest
version and costs a permission-free restart on unmute.

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

## 4. One chatter posting four times in a row, replying to themselves

**Seen:** a single name posting four consecutive messages, and appearing to
hold a conversation with itself. Twitch itself caps this.

**Now:** `MAX_CONSECUTIVE = 5` in `lib/engine/roster.ts`. Too high. The
self-reply reads worse than the repetition and may be a separate cause —
the model writes lines that answer each other and the engine can hand two
of them to the same viewer.

**Shape of the fix:** lower the cap to 2 or 3, and check whether consecutive
messages from one viewer are being allowed to form a question/answer pair.
Worth measuring what the real channels did: the sampler in
`scripts/sample-chat.ts` already reports this.

---

## 5. Idle mode arrives far too early

**Seen:** chat gives up and goes idle before there is time to play or
think.

**Now:** `IDLE_AFTER_MS = 60_000` in `lib/engine/generation.ts`, with
stages at 60s, 150s, 300s and 600s.

**Shape of the fix:** raise the first threshold and probably stretch the
later stages with it. Interacts with item 2: once screen events can pull a
batch forward reliably, silence during gameplay matters much less, because
the game is doing the talking.

---

## 6. Remove the Emotes toggle

**Owner's reasoning:** redundant. Someone who does not want emotes imports
none.

**Now:** `emotesEnabled` in `lib/config/settings.ts`, rendered as a Toggle
in `ControlPanel.tsx`, and read in `lib/engine/director.ts` in four places.

**Shape of the fix:** delete the setting and the toggle; the director's
existing empty-pack handling already covers the no-emotes case. Check
`emoteOnlyMode` separately — it is a different switch and was not mentioned.

---

## 7. Remove the default emote list

**Owner's reasoning:** no emotes unless the user imports them.

**Now:** first run auto-imports the top 150 popular 7TV emotes —
`lib/react/use-simulator.ts` around line 197, guarded by `hasAutoImported()`
in `lib/config/emote-store.ts`.

**Shape of the fix:** delete the auto-import and the flag that guards it.
Note the consequence: a fresh install has no emotes at all until the user
visits the emotes page, so every emote share in the engine reads as zero
and chat is pure text. That is the intended behaviour but it changes what a
first session looks like, and the tests that assume a stocked pack will
need to say so explicitly.
