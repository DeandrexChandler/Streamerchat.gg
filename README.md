# StreamerChat.gg

A simulated live chat for streams that are quiet.

You talk. A simulated audience reacts — in real time, with recurring names,
personalities, side conversations, and the occasional stretch of boredom when
you stop talking. It's built for practicing audience interaction, making a low
viewer-count stream feel less empty, and generating clip material.

**Status: in active development.** The simulation engine works and is tested.
The microphone pipeline and the rebuilt UI are being wired up next. See
[Roadmap](#roadmap).

---

## How it works

The design principle is that **AI is a component inside the system, not the
system itself**:

```
Microphone → Transcription → Classifier → Director → Scheduler → Chat
                                              ↑
                              pools · templates · AI (~5%)
```

Deterministic code owns everything it reasonably can — timing, message
frequency, usernames, colors, emote choice, personalities, idle behaviour,
scheduling, rate limiting. A language model is used only where language
generation genuinely helps: novel phrasing for unusual statements, and topping
up variety when the classifier is unsure.

This is not an aesthetic preference. It makes the app cheaper, faster, more
predictable, easier to debug, and — most importantly — **fully functional with
no API keys and no network**.

### Why not just send everything to a model?

Because "streamer said something → model writes 12 comments → all 12 appear at
once" does not look like chat. It looks like a chatbot filling a box.

Real chat has structure the model isn't well suited to reproducing on its own:

- **The same people keep talking.** A persistent audience of ~45 viewers is
  created per session, each with a stable name, color, personality, and
  activity level, weighted heavily toward lurkers. A fresh random username on
  every line is the single loudest tell of a fake chat.
- **Reactions arrive in clumps, not evenly.** Two people hit enter within
  200ms, then nothing for four seconds, then a straggler. Gaps are drawn from
  a mixture distribution, because an even spread reads as machine-generated
  regardless of how good the text is.
- **People talk to each other**, not just to the streamer.
- **Chat gets bored** in escalating stages, and eventually gives up on you and
  starts entertaining itself.

The `director` decides what a moment is worth; the `scheduler` decides when
each message lands. Keeping those separate is what prevents the dump-everything
failure mode.

---

## Quick start

Requires Node 20+.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. **No API keys required** — the simulation runs
entirely offline.

### See it without a browser

The fastest way to judge pacing and message quality is the headless harness. It
runs a scripted stream session against a virtual clock and prints the chat log,
no microphone involved:

```bash
npm run simulate            # random seed
npm run simulate -- 12345   # fixed seed, reproducible
```

```
00:16 STREAMER: chat what do you think, should I do the roof first or the walls?
      -> question_to_chat | energy 0.27 | conf 1.00 | kw [first, walls, roof]

00:16 biscuit_: i think so? ICANT
00:17 wobblyclover: @biscuit_ LOL Thonk
00:17 yuki90: i wasn't listening sorry
00:19 kira97: honestly yeah Thonk
00:21 sasha253: roof obviously
00:30 sasha253: @snug_heather you're so right
```

---

## Configuration

Everything is optional. Copy `.env.example` to `.env.local` if you want either
of the extras:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Whisper transcription fallback, for browsers without the Web Speech API |
| `GOOGLE_API_KEY` | The AI generation tier (~5% of messages) |

**Never prefix either with `NEXT_PUBLIC_`.** That inlines the value into the
client bundle and ships your key to every visitor.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Test suite |
| `npm run simulate` | Headless chat simulation |
| `npm run typecheck` | TypeScript, no emit |

---

## Layout

```
app/
  (shell)/         pages with app chrome — simulator, obs
  overlay/         OBS browser source; no chrome, deliberately outside (shell)
  api/             server routes
lib/
  engine/          classifier, director, scheduler, population, rng, filter
  engine/generators/  pool + template + AI tiers
  data/            response pools, personalities, usernames, emotes
  config/          zod-validated settings + storage adapter
  audio/           mic, VAD, utterance batching (plain classes, no React)
scripts/
  simulate.ts      headless harness
```

Chat *behaviour* lives in `lib/data/` as weighted pools and personality
profiles. Adding new reactions is usually a data edit, not a code change —
the goal is to avoid both "everything goes to a model" and "ten thousand
hardcoded strings".

---

## Testing

```bash
npm test
```

127 tests covering classifier intents, scheduler timing and rate limits,
weighted distributions, profanity modes, population dynamics, and end-to-end
determinism.

Randomness runs through a seeded RNG rather than `Math.random()`, so a session
is reproducible from its seed — which makes distributions assertable and lets
a weird-looking chat log be replayed exactly.

Realism regressions are treated as real bugs and get real tests. "Chat repeated
itself three times in six seconds" and "a viewer replied to themselves" are
both covered.

---

## Roadmap

- [x] Simulation engine — population, classifier, director, scheduler, filter
- [x] Headless harness and test suite
- [ ] Microphone pipeline (Web Speech API, Whisper fallback)
- [ ] Rebuilt simulator UI
- [ ] Settings page
- [ ] AI generation tier (Google Gemini)
- [ ] OBS overlay transport

Deliberately deferred until the product works end to end: accounts, database,
analytics, and any marketing surface.

---

## License

MIT — see [LICENSE](LICENSE).
