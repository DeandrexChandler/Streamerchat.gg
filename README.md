# StreamerChat.gg

A simulated Twitch chat for streams that are quiet.

You press Play. AI generates a room of viewers and what they say. The chat
flows continuously at the speed you pick. When you talk — into the mic or
by typing — chat reacts to what you actually said. When you go quiet, chat
notices, and after a while starts entertaining itself.

Built for practising audience interaction, making a low-viewer stream feel
less empty, and putting a believable chat into OBS.

**Status: Phase 1, core AI chat.** See `docs/roadmap.md`.

---

## How it works

**The AI writes every line. Deterministic code decides everything else.**

The engine keeps a roster of at most ten viewers with stable names, colours
and personalities. It asks the model for a *batch* of lines — on Play, after
each thing you say, whenever the queue runs low, and at each stage of a
silence — and releases them one at a time at a natural, uneven pace. It
decides who says each line, whether it comes out as words or an emote, and
refuses to let one person repeat themselves.

Nothing canned is ever shown. If the model is unavailable, that batch is
quiet and the next one tries again.

Full description: `docs/product-scope.md`. Internals: `docs/architecture.md`.

---

## Quick start

Requires Node 20+ and a Google AI key.

```bash
npm install
cp .env.example .env.local   # then set GOOGLE_API_KEY
npm run dev
```

Open <http://localhost:3000/simulator>, press Play, allow the microphone,
and talk. Chrome or Edge for speech recognition; typed input works anywhere.

Without a key the simulator runs but the room says nothing — chat is
generated, never canned.

### See it without a browser

```bash
npm run simulate                # scripted session, mock provider, no API calls
SIM_RATE=4 npm run simulate     # a speed tier
npm run simulate -- 12345       # a fixed seed
```

Prints the chat log and pacing health: rate, gap spread, AI batches per
minute by phase, slots that waited, lines dropped, dry ticks.

---

## Configuration

| Variable | Purpose |
|---|---|
| `GOOGLE_API_KEY` | **Required.** Gemini, for all chat generation. |

**Never prefix it with `NEXT_PUBLIC_`.** That inlines the value into the
client bundle and ships your key to every visitor.

The model is fixed at `gemini-3.5-flash-lite`. There is no model or
provider selection.

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Test suite, with a scripted provider — no API calls |
| `npm run simulate` | Headless session through the engine |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |

---

## Layout

```
app/
  (shell)/         simulator, settings, obs
  overlay/         OBS browser source
  api/             chat-candidates, emotes, overlay relay
lib/
  ai/              provider contract, prompts, gemini, mock, validation, config
  engine/          engine, director, scheduler, population, roster, generation
  data/            usernames, personalities, emote index
  emotes/          7TV import, semantic emote selection
  config/          settings + storage
  audio/           mic, VAD
  transcription/   Web Speech
scripts/simulate.ts
docs/
```

---

## License

MIT — see [LICENSE](LICENSE).
