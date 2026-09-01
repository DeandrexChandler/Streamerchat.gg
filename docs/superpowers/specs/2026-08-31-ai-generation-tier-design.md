# AI generation tier

**Date:** 2026-08-31
**Branch:** `feat/ai-tier`
**Status:** approved, not yet implemented
**Follows:** emote tier and settings IA (merged to `main`)

---

## Why

`lib/engine/ai-budget.ts`, `wantsAiRefill()`, `recordAiCall()`,
`recordAiFailure()` and `supplyAiCandidates()` all exist and are tested.
Nothing generates into them. This spec fills that hole and nothing else.

The tier's job, from CLAUDE.md: novel phrasing for unusual statements,
occasional longer messages, and topping up variety when the classifier is
unsure. It is not "what is the next message" — that stays deterministic.

## Decisions taken

| Question | Decision |
|---|---|
| Architecture | Batched refills into the existing candidate pool. Never in the request path. |
| Model | Gemini 2.5 Flash, configurable in settings |
| Key ownership | Server-side `GOOGLE_API_KEY`, no auth, no billing, no accounts |
| Vision / screen capture | Out of scope — deferred entirely |
| Second provider | Interface only; DeepSeek can slot in later without a rewrite |

## Why Gemini 2.5 Flash

Verified pricing, 2026-08-31:

| Model | In /1M | Out /1M | Cached in | Est. cost at 40 h/mo |
|---|---|---|---|---|
| 2.5 Flash-Lite | $0.10 | $0.40 | $0.01 | $0.48 |
| **2.5 Flash** | **$0.30** | **$2.50** | **$0.03** | **$2.62** |
| 3.6 / 3.7 Flash | $0.75 | $3.75 | $0.075 | $4.10 |
| 3.5 Flash | $1.50 | $9.00 | $0.15 | $9.90 |
| DeepSeek V4 Flash (off-peak) | $0.22 | $0.66 | $0.007 | ~$0.60 |

Costs derived from the budget guard's own ceiling — 90 calls/hour at roughly
700 input and 250 output tokens — not from a per-message model. Context
accumulation is structurally impossible here: the AI never sees more than a
short rolling window, so a four-hour stream costs the same per call as the
first minute.

**Not Flash-Lite.** The failure this project is most exposed to is output that
reads as a corporate mascot. Lite is the likeliest to produce flat phrasing,
and that failure is invisible in tests and obvious on stream. A $2/user/month
saving does not justify it.

**Not 3.5/3.6/3.7.** Five to twenty times the cost to write six-word chat
lines, and heavier instruction-tuned models skew more polite — the wrong
direction for this register.

**Not DeepSeek yet.** Probably better at slang, but the stated first criterion
was reliability and scale, its rate limits are the weaker ones, and its peak
pricing doubles during exactly the hours people stream.

**The model is not where quality comes from here.** The AI writes ~6-word lines
at ~5% of substantive messages under a tightly constrained prompt. The prompt
and the output validation matter more than the model choice, which is why the
model is a setting rather than a constant.

## Security posture, stated plainly

CLAUDE.md requires that any route which spends money be authenticated, rate
limited, and size capped. This one will be rate limited and size capped. It
will **not** be authenticated, because there are no accounts and none are
wanted.

That is acceptable **only while it stays on localhost**. Two consequences,
recorded here so they are not discovered later:

- Exposed to a network, this is an open relay on the owner's API key.
- A copy shipped with the key baked in lets the recipient read the key out of
  the file, and spend against it.

The absolute ceiling is `AiBudget` (90 calls/hour, 400/session), which is the
real backstop. A comment in the route says the same thing.

---

## Components

### `lib/ai/provider.ts`

```ts
export interface CandidateRequest {
  classification: Classification;
  /** Emote names actually loaded, so the model uses real ones. */
  emotes: readonly string[];
  /** Recent chat lines, so it does not repeat what just went out. */
  recent: readonly string[];
  streamer?: string;
  topic?: string;
  /** How many lines to ask for. */
  count: number;
}

export interface CandidateProvider {
  readonly name: string;
  generate(request: CandidateRequest): Promise<string[]>;
}
```

Mirrors `lib/transcription/provider.ts`, which already establishes this pattern
in the codebase. A second model is a new implementation, not a rewrite.

### `lib/ai/prompt.ts`

Builds the request. Separated from the transport so the prompt can be tested
without a network, which matters because the prompt is where the quality is.

Carries: intent, sentiment, energy, keywords, the loaded emote names, a short
window of recent chat, and streamer/topic when set.

Constraints stated in the prompt: lowercase, very short, no punctuation
polish, no emoji, no addressing the broadcaster negatively, use only the emote
names supplied.

### `lib/ai/gemini.ts`

Implements `CandidateProvider` against
`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
Asks for JSON, times out, returns `[]` on any failure rather than throwing.

### `lib/ai/validate.ts`

**The important part.** Model output is untrusted text heading for someone's
live broadcast.

Every returned line is:

- stripped of list numbering, surrounding quotes, and markdown
- rejected if longer than 12 words or 120 characters
- rejected if empty after cleaning
- rejected if it matches a hostile-second-person pattern
- deduplicated against the recent window and against the rest of the batch

Profanity is **not** re-checked here: `engine.ts:249` already runs
`filter.apply()` over every released message regardless of source, so a second
pass would be redundant and would drift out of sync with the user's settings.

The hostile-pattern check is defence in depth, not a guarantee. Three things
carry that rule together: the prompt states it, this check catches the obvious
cases, and the 12-word cap structurally limits how much any single bad line
can say. Stated honestly because a reader will otherwise assume the regex is
load-bearing.

### `app/api/chat-candidates/route.ts`

POST. Holds `GOOGLE_API_KEY` — never `NEXT_PUBLIC_`. Zod-validated body,
size-capped, rate limited through the shared `lib/http/rate-limit.ts`.

Returns `{ lines: string[] }`. Returns `{ lines: [] }` with 200 when no key is
configured: a missing key is a normal state, not an error, because the app is
required to run fully with zero keys set.

### Client wiring

In `use-simulator.ts`, on a final transcript, after `handleTranscript`:

```
if (engine.wantsAiRefill(outcome, now)) {
  engine.recordAiCall(now);
  POST /api/chat-candidates
    -> engine.supplyAiCandidates(validated)
    -> on failure: engine.recordAiFailure(now)
}
```

Fire and forget. Nothing awaits it, nothing blocks on it, and a failure is
invisible to the user beyond slightly less variety.

### Settings

`aiShare` is surfaced on `/settings/chat` — deliberately left out of the last
spec because the tier did not exist. Presented as an off/low/medium slider
rather than a raw probability, with a note that it only affects substantive
messages.

`aiModel` is added to the schema so the model can be A/B'd by ear.

---

## Testing

- Prompt includes supplied emote names, keywords, streamer and topic
- Prompt omits streamer/topic cleanly when unset
- Validator strips numbering, quotes and markdown
- Validator rejects over-length lines
- Validator rejects hostile second-person patterns
- Validator dedupes within a batch and against the recent window
- Gemini provider maps a well-formed response to lines
- Gemini provider returns `[]` on malformed JSON, HTTP error, and timeout
- Route returns `{ lines: [] }` with no key rather than an error
- Route rejects oversized and malformed bodies
- Engine still emits chat when every AI call fails

Manual: `npm run simulate` must produce identical output with no key set, and
a real session with a key must show `ai` appearing in the `by source` counts.

## Out of scope

Screen capture and vision entirely. Accounts, auth, billing, hosting. A second
provider implementation.
