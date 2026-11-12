# Agent briefs

Four agents, one track each, running in parallel around a simulator nobody
but the owner touches. Read **Everyone** first, then only your own track.
The tracks themselves are defined in `docs/roadmap.md`. This file is how
to execute one.

---

## Everyone

**Read first:** `CLAUDE.md`, then the frozen zone in `docs/roadmap.md`.
Before writing any Next.js code, read the matching guide in
`node_modules/next/dist/docs/`. This is Next 16, and APIs differ from what
you remember. Middleware is now `proxy.ts`: see
`01-app/01-getting-started/16-proxy.md`.

**Git.** Use Homebrew git: `export PATH=/opt/homebrew/bin:$PATH`. The
system git is blocked by an unaccepted Xcode license. You start in your own
worktree on your own branch. Never commit to `main`. Push with:

```
git -c credential.helper= -c credential.helper='!gh auth git-credential' push -u origin HEAD
```

Then open a PR to `main` with `gh pr create`.

**Dev server port:** A 3001, B 3002, C 3003, D 3004
(`npm run dev -- -p 300X`), so the four of you never fight over 3000.

**Desktop only.** StreamerChat.gg is used in a browser on a laptop or
monitor, next to OBS. There is no mobile mode. Build, check and screenshot
at desktop sizes (1440×900, plus 1280×800 if layout is tight). Don't spend
time on phone widths.

**The frozen zone.** Never modify or delete anything in it. Adding new files
next to it is fine. Before every push, run this; it must print nothing:

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

**Done means:**
- The frozen check prints nothing.
- `npm test`, `npm run typecheck` and `npm run lint` pass. Two lint findings
  in `ChatList.tsx` already exist and are known.
- You opened what you built in a browser and it works. Screenshots go in the
  PR.
- Every pure function you wrote with a branch in it (a matcher, a limit, a
  price formatter) has one vitest test.

**Stop and ask the owner** when:
- a change to a frozen file looks necessary. Say which file and why; don't
  work around it.
- you need the owner's account, a signup, a secret key, or money.
- you hit anything listed under "Open decisions" in the roadmap.

Build everything that doesn't need the answer, then ask.

**Never:**
- spend real API credit in tests;
- take a real payment (Stripe test mode only);
- deploy to production;
- prefix a secret with `NEXT_PUBLIC_` (a provider's *publishable* key is
  public by design and is fine);
- add a dependency for what a few lines do.

**Shared files.** You will all touch `package.json`. On rebase, take
`main`'s `package-lock.json` and re-run `npm install`; don't hand-merge it.

**Environment.** Worktrees don't carry `.env.local`. Copy it from the main
checkout only if you need the Gemini key (Track C's setup checklist does).
Never commit it.

---

## Track A: Website (`feat/site`)

**Goal:** a public site a streamer lands on, understands in ten seconds, and
leaves through "Open the simulator" (later, "Sign up").

**You own:** `app/(site)/**`, `app/page.tsx` (replace the redirect with the
home page), `components/site/**`, `lib/site/**`, `public/site/**`.

**Pages:**
- **Home** (`/`): the pitch in one screen. A slot for a recorded clip of a
  real session at `public/site/demo.mp4`; the owner supplies the file. Until
  it exists, show a poster image, never hardcoded chat lines. The model
  writes every chat line, even on the website.
- **Features** (`/features`): from `CLAUDE.md`, in a streamer's words, not
  ours. Covers: a chat that hears you; regulars who remember you between
  streams; emotes that fit the moment; reacting to what's on screen; idle
  chatter when you go quiet; an OBS browser source.
- **Pricing** (`/pricing`): rendered from `lib/site/plans.ts`, which you
  create. Shape: `{ id, name, price: string | null, blurb, features:
  string[], stripePriceId: string | null }`. A `null` price renders as
  "Coming soon". Don't invent numbers; Track D fills in `stripePriceId`.
- **Creators** (`/creators`): structure only, rendered from a list in
  `lib/site/creators.ts`. When the list is empty, show one line saying who
  it's for. The owner adds real people.
- **Docs** (`/docs`): setup in order. Get a Gemini key; put it in
  `.env.local` as `GOOGLE_API_KEY`; allow the mic; screen capture (opt-in);
  add the OBS browser source from Settings → OBS. Check every step against
  the real app before writing it.
- **GitHub:** a nav link from `lib/site/links.ts`. The repo is private, so
  the link is `null` and hidden until the owner flips it.
- **Privacy** and **Terms** (`/privacy`, `/terms`), linked in the footer.
  The privacy page must state that mic transcripts and, when capture is on,
  screen frames are sent to Google's Gemini API to generate chat. Say in the
  PR that both are drafts for owner review, not legal text.

**Design:** load the `frontend-design` skill. The site gets its own look,
scoped under a wrapper class in `app/(site)/layout.tsx` plus its own
stylesheet there. `app/globals.css` and the Tailwind config are frozen; use
CSS variables in your own stylesheet for anything they don't give you.
Desktop widths only (see Everyone). Every page has a real `<title>` and
description.

**Calls to action** go to `/simulator`. Once Track B merges, change them to
`/signup` as a follow-up PR; don't wait for it.

---

## Track B: Accounts and login (`feat/accounts`)

**Goal:** a hosted visitor has to sign in before they can spend anything,
and the owner's localhost never sees a login.

**You own:** `proxy.ts` (repo root), `app/(auth)/**` (`/login`, `/signup`,
`/account`), `lib/account/**`.

**Provider:** load the `vercel:marketplace` and `vercel:auth` skills and
pick one. Prefer one that doesn't need a database of its own, so Track D's
database choice stays free. Say why in the PR. Creating the provider account
and keys is the owner's job, so ask. Build and test local mode first; it
needs no keys.

**The gate:**

| Gated (signed out → `/login`, or `401` JSON for `/api`) | Open |
|---|---|
| `/dashboard`, `/simulator`, `/settings/**`, `/emotes`, `/obs` | `/`, every site page, `/login`, `/signup` |
| `/api/chat-candidates`, `/api/emotes`, `/api/ai-status`, `/api/overlay/publish` | `/overlay`, `/api/overlay/stream`, `/api/overlay/status`, static files |

The overlay stays open because OBS can't sign in. It is already guarded by
the session `key` in its URL. Put the gated/open decision in one pure
function and test it against this table.

**Local mode:** if the auth environment variables are absent, `proxy.ts`
lets everything through. Test that path.

**Silence:** a `401` on `/api/chat-candidates` must leave the simulator
quiet, with no error in the UI (CLAUDE.md: provider failures are silent).
The client is believed to treat any non-OK response that way
(`lib/react/use-simulator.ts` ~line 325). Check it in the browser; don't
assume.

**`/account`:** email and sign out. Track D adds plan and usage later.

**Export** `getUserId(request): Promise<string | null>` from
`lib/account/user.ts`, for Tracks C and D.

**Not yours:** adding "Account" to the app navigation. That's Track C's
file; tell C's PR, or the owner, when you merge.

---

## Track C: App shell and dashboard (`feat/dashboard`)

**Goal:** the app gets a home tab. The simulator looks and behaves exactly
as it did.

**You own:** `app/(shell)/layout.tsx` (navigation and chrome only),
`app/(shell)/dashboard/**`, `components/dashboard/**`.

**Before you change anything,** screenshot `/simulator`, `/settings` and
`/settings/obs` at 1440×900 (load the `run` skill to launch the
app, and use the browser tools). Retake them at the end. The simulator's
content area must match. Attach both sets to the PR.

**In `layout.tsx`:**
- Don't touch `<SimulatorSession>`, `<main>` or its sizing. They keep a
  running session alive across tabs, and they size the chat column.
- Keep the light page surface and the `dashboard-surface` class. The
  comment at the top of the file explains why: the chat panel loses its
  edges on a dark page.
- Navigation becomes: Dashboard, Simulator, Settings. The logo goes to
  `/dashboard`.
- Fix the mobile menu icon, which is inverted: it shows the menu icon while
  open and X while closed (`mobileOpen ? <Menu> : <X>`).

**`/dashboard`,** inside `(shell)` so a running session survives visiting it.
Everything here is *read* from existing modules; nothing in them is edited:
- **Start / resume:** session state from `useSimulatorSession()`
  (`lib/react/simulator-session.tsx`). The button goes to `/simulator`.
- **Setup checklist:**
  - key: `GET /api/ai-status` returns `ok`, `missing`, `rejected` or
    `unreachable`. It costs nothing; call it once on load.
  - mic: `navigator.permissions.query({ name: "microphone" })`.
  - emotes imported: read the emote store in `lib/config/emote-store.ts`.
  - each item links to where it gets fixed.
- **Regulars at a glance:** names and colours from `localRosterStore`
  (`lib/config/roster-store.ts`), linking to `/settings/regulars`.
- **OBS:** a link to `/settings/obs`. Don't rebuild the overlay URL here;
  it's built inside that frozen page.
- **Account and usage:** leave them out until Tracks B and D merge, then add
  them in a follow-up PR. Never show placeholder numbers.

---

## Track D: Hosting and billing (`feat/hosting`)

**Goal:** a preview deployment where a signed-in streamer can pick a plan,
pay in Stripe test mode, and gets cut off past their usage.

**You own:** `lib/billing/**`, `app/api/billing/**` (new routes), the
deployment config, and the database schema and client.

**Skills:** load `vercel:deployments-cicd`, `vercel:env-vars`,
`vercel:marketplace` (database) and `vercel:vercel-functions`. The Vercel
CLI isn't installed and the account is the owner's, so ask before linking.
**Preview deployments only.** Production is the owner's call.

**Database:** from the Marketplace. Holds users' plan, subscription status
and usage counts. Nothing from `lib/config`: settings stay in the browser.

**Billing:** Stripe in test mode.
- Checkout and a customer portal link.
- A webhook in `app/api/billing/webhook/route.ts` that verifies the
  signature before trusting anything.
- Plans come from `lib/site/plans.ts` (Track A creates it). Fill in
  `stripePriceId` after A merges; until then, read a local copy of the same
  shape.

**Usage limits:**
- Write `lib/billing/usage.ts` with `recordAndCheck(userId): Promise<boolean>`
  and test it. It counts `/api/chat-candidates` requests per user per
  period; a request is one batch.
- Mark the ceiling in code: `// ponytail: counts batches, not cost; meter
  tokens if batch cost varies`.
- Local mode (no billing environment variables) is unlimited.
- Wiring it into `proxy.ts` is a few lines in Track B's file. Do it as a
  follow-up PR after B merges.
- A user over the limit gets the same silent `401`/`429` as any refusal: no
  banner in the simulator.

**Environment:** `GOOGLE_API_KEY` is server-only on Vercel. List every
variable you add in `.env.example`.

**Tell the owner in your PR:**
- The OBS overlay relay (`lib/overlay/hub.ts`) is in-memory. On serverless
  with more than one instance, OBS will miss messages. Fixing it is frozen
  work in Track S.
- The chat route's own rate limiter is per instance too. Your per-user limit
  is the real cap.
