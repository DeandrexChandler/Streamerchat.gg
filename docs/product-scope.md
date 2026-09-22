# Product scope

## What this is

An AI wrapper for a simulated Twitch chat.

The streamer presses Play. AI generates believable viewers and messages. The
chat flows continuously at the selected speed. Streamer speech or typed input
gives the AI new context. Prolonged silence causes AI-generated idle
conversation.

Built for two real people with low-viewership streams. Success is a manual
session where the chat feels continuously alive, contextually responsive,
varied, and recognisably like Twitch chat — and then goes into OBS.

## The one rule

**The AI writes every line chat says. Deterministic code decides everything
else.**

Deterministic code owns: timing, scheduling, rate limiting, who speaks,
usernames and colours, personalities, per-viewer memory and repetition rules,
emote selection, safety filtering, compact context construction, queue refill
timing, and the displayed viewer count.

The AI owns: wording and conversational content. It receives compact context
and returns structured lines with a little metadata (emotion, kind, an
optional emote preference, eagerness). It never picks a username, a
timestamp, or an image.

There is no deterministic fallback for chat text. If the AI is unavailable,
that batch is silent, the cause is logged server-side, and the next batch
tries again on its own. Nothing canned is ever shown as chat.

## Provider

One provider, one model, fixed:

| | |
|---|---|
| Provider | Google Gemini |
| Model | `gemini-3.5-flash-lite` |
| Key | `GOOGLE_API_KEY` in `.env.local` |

There is no provider or model selection anywhere — not in the UI, not in the
environment. The model was chosen by measurement (see `lib/ai/gemini.ts`).

## Phases

| Phase | Begins | Ends | What the AI is asked for |
|---|---|---|---|
| Startup | Play | first accepted input, or 5 min | early-arrival chat; one greeting per person, then chatter |
| Active | accepted mic or typed input, or a screen event | next input, or 5 min with no input and no screen event | reactions to what was said; continuations when the batch drains, drifting to general chatter after 60s |
| Idle | 5 min without input or screen event | next input or screen event | reactions to the silence, escalating through four stages |

Idle is always on. Its stages by silence: 5–8 min *the streamer is
focused*; 8–12 min *the streamer may be busy*; 12–20 min *is the streamer
still there?*; 20+ min *chat is entertaining itself*. Each stage is a
different prompt, and a stage change invalidates what was queued for the
previous one.

New streamer input at any point: flushes the pending queue, keeps released
history, resets the silence clock, and asks for a fresh batch.

## Continuous chat

While running, the queue is never empty except while a request is in
flight, after a failed request (with a short backoff), or while paused,
stopped or cleared. Batches are requested at a low-water mark, sized to
about twenty seconds of chat at the configured rate, and released one line
at a time by the scheduler. Measured: four to six AI calls a minute at every
tier. Never one call per message.

If chat regularly goes silent while running, that is a bug.

## Viewer identity

At most ten visible personalities, sized by speed tier:

| Tier | Roster | Displayed viewers |
|---|---|---|
| ~0.2/sec | 5 | 3–11 |
| ~0.5/sec | 8 | 12–24 |
| ~1/sec | 10 | 25–180 |
| ~1.5/sec | 10 | 181–500 |
| ~2/sec | 10 | 501–1000 |
| CHAOS | 10 | 1000+ |

The displayed count and the roster are different things. Names and colours
(fixed Twitch palette) are stable for the session. At the two fastest tiers
one regular leaves and one new name arrives every minute or two; the roster
never grows and a departed name is never reissued.

Each viewer carries: name, colour, personality, activity, verbosity, emote
affinity, last-spoke time, everything they have said this session, and when
they last performed each conversational action. Custom viewers later are the
same shape with identity supplied by hand.

## Repetition rules

- A viewer never posts the same line twice in a session. Normalised, so
  `hey`, `heyyy`, `hey!!` and `KEKW KEKW KEKW` versus `KEKW` are one thing.
  Checked against the model's line as well as the rendered one, so `insane`
  and `insane KEKW` from one person count as the same.
- A viewer greets once and says goodbye once per session, whatever the words.
- A speaking cooldown scales with the tier (about 30s slow, 1s at CHAOS),
  waived during a hype moment.
- At most five consecutive messages from one viewer.
- Different viewers may say the same thing. A pile-on is real.
- If nobody eligible can say a line, it waits, then moves to the back of the
  queue, then is dropped if still unsayable. A slot is delayed, never faked.

## Emotes

7TV import stays. Selection is deterministic: the model's stated emote
preference (if the pack has it) → a user-assigned tag → a name that means
the moment (`hi`, `wave`, `pog`, `afk`) → a mood match → a wildcard. Nothing
unrelated is posted where something related exists.

Greetings, farewells, hype and directives are answered mostly with emotes.
`spam W` posts the token. Idle posts the occasional AFK emote. Emote-only
mode renders every line as emotes.

## Settings

Chat speed, emotes on/off, emote-only mode, profanity mode and word lists,
streamer name, stream topic, timestamps, message buffer. Nothing else.

## Explicitly out of scope for this phase

Manual emote tagging and overrides. UI and dashboard redesign. OBS validation
and polish. Custom viewer configuration. Saved sessions and settings.
Authentication. Security hardening for hosted deployment. Billing and
monetisation. SaaS deployment. New providers. Model selectors. Badges.
Analytics. Marketing pages.
