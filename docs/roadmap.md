# Roadmap

The simulator works and is signed off. Work now runs as five tracks in
parallel: the owner keeps the simulator, and four tracks around it go to
agents. No track waits for another to start. Where two tracks meet, the
meeting point is named below, and whichever merges second wires it in.

## The frozen zone

The simulator and everything that decides what chat says, when it says it,
and how it looks. Only the owner changes it. Agents may import from it and
read it. They never modify or delete anything in it. Adding a new file
alongside it (a new API route, a new shadcn component, a new `lib/` folder)
is fine.

```
app/(shell)/simulator/   app/(shell)/settings/   app/(shell)/emotes/
app/(shell)/obs/         app/overlay/            app/api/
app/components/          app/globals.css         app/layout.tsx
lib/                     components/ui/          scripts/
tailwind.config.js       next.config.ts
```

There is one exception. Track C owns `app/(shell)/layout.tsx`, but only its
navigation and chrome. `<SimulatorSession>` and the `<main>` it sits in stay
exactly as they are: the session surviving navigation and the chat column's
size depend on them.

Every agent PR runs this check, and it must print nothing:

```
git diff --name-only --diff-filter=MDR main... -- 'app/(shell)/simulator' \
  'app/(shell)/settings' 'app/(shell)/emotes' 'app/(shell)/obs' app/overlay \
  app/api app/components app/globals.css app/layout.tsx lib components/ui \
  scripts tailwind.config.js next.config.ts \
  ':!lib/site' ':!lib/account' ':!lib/billing' ':!app/api/auth' ':!app/api/billing'
```

A track owns the files it created, even inside the frozen zone, and may
change them in later PRs: `lib/site/` (A), `lib/account/` and
`app/api/auth/` (B), `lib/billing/` and `app/api/billing/` (D). The check
excludes them. Everything else in the zone stays the owner's.

Plus `npm test`, `npm run typecheck` and `npm run lint`, as always.

## Track S — Simulator (owner)

Phases 1 and 2 are done: AI chat signed off live on 2026-10-06, and emote
accuracy complete. The history is in git and `docs/fix-queue.md`.

- [ ] Transcription (fix queue 24)
- [ ] Confirm live: talking without breaks (25), chat keeping up with
      speech (27), emote choice
- [ ] AI timeouts (28), proposed
- [ ] Pick Gemini or gpt-6-luna and delete everything marked
      `DEV-MODEL-TOGGLE`
- [ ] Custom viewers: up to ten, same shape as generated ones
- [ ] Saved session settings
- [ ] Hosted overlay. Once Track D deploys, the in-memory OBS relay
      (`lib/overlay/hub.ts`) needs a shared broker, because serverless runs
      more than one instance. That change is inside the frozen zone, so it is
      the owner's.

## Track A — Website

Public pages with no app chrome, in `app/(site)/`. `app/page.tsx` becomes
the home page; today it redirects to `/simulator`.

Nav: **Home · Features · Pricing · Creators · Docs · GitHub**. Footer:
**Privacy · Terms**.

- **Home.** What it is, on one screen. Show it working with a recorded clip
  of a real session. Never hardcode chat lines: chat text is only ever
  written by the model.
- **Features.** What CLAUDE.md describes, in a streamer's words: a chat that
  hears you, regulars who remember, emotes that fit, a screen chat reacts to,
  an OBS overlay.
- **Pricing.** Plans come from one file, `lib/site/plans.ts`, which the owner
  edits. Prices are not invented.
- **Creators.** Streamers using it. The page ships with its structure and
  nobody listed until real people agree to be on it.
- **Docs.** Setup: the key, the mic, screen capture, adding the OBS browser
  source.
- **GitHub.** The repo is private. Link it only if it goes public; otherwise
  drop it or swap in a Changelog.
- **Privacy and Terms.** Needed before accounts and payment exist. Mic
  transcripts and screen frames go to the AI provider, and the privacy page
  must say so. Drafted here, reviewed by the owner.

Seam: the Pricing call to action goes to `/signup` once Track B merges, and
to `/simulator` until then.

## Track B — Accounts and login

- Sign up, log in, log out, and an account page, in `app/(auth)/` and
  `lib/account/`.
- `proxy.ts` gates the app pages and `/api/*`. The OBS overlay cannot log
  in, so `/overlay` and `/api/overlay/*` stay open. They are already guarded
  by the session `key` in their URL.
- **Local mode.** With no auth environment variables set, the proxy lets
  everything through. Running on localhost never shows a login.
- Settings stay in browser storage. Syncing them to an account would mean
  editing `lib/config`, which is frozen, so it is not part of this track.
- Exports a way to read the current user, for Tracks C and D.

## Track C — App shell and dashboard

- Navigation in `app/(shell)/layout.tsx`: Dashboard, Simulator, Settings,
  plus Account once Track B merges. Chrome only (see the frozen zone). Keep
  the light page surface; the comment in that file says why.
- `/dashboard` lives inside `(shell)` so a running session survives going
  there. It shows: start or resume, the OBS overlay link, a setup checklist
  (key works, mic allowed, emotes imported) and the regulars at a glance.
  All of it is read from existing modules; nothing in them is edited.
- Account and usage panels appear when Tracks B and D provide the data.
  Until then they are left out, not faked.
- The simulator must look identical afterwards. Compare screenshots taken
  before and after, at desktop width (the app is desktop only).

## Track D — Hosting and billing

- Deployment, environment variables, the production build.
- A database for accounts, subscriptions and usage.
- Billing: checkout, plans from `lib/site/plans.ts`, and a webhook in a new
  route under `app/api/billing/`.
- Usage limits, counted per user in `proxy.ts` on each
  `/api/chat-candidates` request. This counts batches, not cost; good enough
  while one batch costs about the same as the next.
- Hardening. The route's own rate limiter is in-memory per instance, so on
  serverless it is not a global limit. The per-user limit in the proxy is
  the real cap.

Seams: until Track B merges, build against a placeholder user ID. Track B
owns `proxy.ts`; Track D adds its usage check after B merges. Tell the owner
when the deploy is live, so the hosted overlay work in Track S can start.

## Merge order

Every track starts now, each on its own branch and worktree, and reaches
`main` by PR. Tracks A and C merge whenever they are ready. Track B merges
before Track D. When two PRs both add dependencies, regenerate
`package-lock.json` on rebase; don't hand-merge it.

## Open decisions (owner)

- Prices, and whether streamers bring their own Gemini key or the product
  pays. Measured cost is about $0.90–1.90 per streamer-hour. Building does
  not wait on this; real numbers on the Pricing page do.
- Whether the repo goes public, which decides the GitHub tab.
- Who appears on the Creators page.
- Gemini or gpt-6-luna.

## Final product check (last)

- [ ] OBS check on stream, hosted: performance, not chat behaviour. Emotes
      are already verified rendering in a browser source with a real pack.

## Deferred and recorded, not planned

- Badges.
- Analytics.
- Syncing settings and regulars to an account. Needs `lib/config`, so it
  waits for the owner.
- Any second AI provider or model selector, once the toggle is decided.
- Hotkey screen capture (fix queue 3). Dropped: capturing only on a keypress
  makes chat later to react, not sooner, and the streamer's hands are on the
  game.
- The two pre-existing `react-hooks/set-state-in-effect` lint findings in
  `ChatList.tsx`.
- ~~Per-emote usage counts~~. Dropped by the owner: which emotes chat uses
  matters, not how often.
