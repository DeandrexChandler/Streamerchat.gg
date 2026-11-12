import type { Metadata } from "next";
import { ChatSimulator } from "@/components/site/ChatSimulator";
import { Button, Card, Tag } from "@/components/site/ui";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: { absolute: "StreamerChat.gg — a live chat for quiet streams" },
  description:
    "Press Play and a believable Twitch-style chat fills in. It hears what you say, reacts to your game, remembers its regulars, and drops into OBS.",
};

/** True facts about the product. Edit here when they change. */
const STATS = [
  "6 chat speeds, up to CHAOS",
  "3–12 regulars who remember you",
  "~1s from your words to chat",
  "Works with OBS",
];

const STEPS = [
  { title: "Pick a speed", body: "From one line every few seconds to a wall of CHAOS." },
  { title: "Press Play and talk", body: "Say something or type it. Chat answers what you actually said." },
  { title: "Add it to OBS", body: "One browser source URL and it's on your stream." },
];

const USES = [
  { title: "Small streams", body: "Stop talking to an empty room while your real chat grows." },
  { title: "Practice", body: "Rehearse talking to chat before you go live." },
  { title: "Overlay testing", body: "See your layout with a busy chat in it." },
  { title: "Content", body: "Record bits and skits that need a crowd." },
];

const EMOTE_TAGS = ["hype", "laugh", "love", "greeting", "dance", "watching"];

/** Wordless chat rows for the card mocks. Same look as the panel. */
function MockRows({ rows }: { rows: [string, number][] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([color, w], i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="site-bar w-14" style={{ background: `var(${color})` }} />
          <span className="site-bar" style={{ width: w }} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="grid min-h-[calc(100dvh-74px)] grid-cols-[1fr_auto] items-center gap-16 py-12">
        <div>
          <Tag dot>Private beta</Tag>
          <h1 className="site-display mt-8">
            Stream to a room that <em>talks</em> back.
          </h1>
          <p className="site-lede mt-8">
            A simulated Twitch chat that hears what you say, reacts to your game, remembers its
            regulars, and drops into OBS.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <Button href={CTA_HREF}>Open the simulator</Button>
            <Button href="/features" variant="ghost">
              See features
            </Button>
          </div>
        </div>
        <div className="site-glow">
          <ChatSimulator />
        </div>
      </section>

      <ul className="site-mono grid grid-cols-4 border-y border-white/[0.09]">
        {STATS.map((s) => (
          <li key={s} className="site-muted border-white/[0.09] px-6 py-6 [&:not(:first-child)]:border-l">
            {s}
          </li>
        ))}
      </ul>

      <section className="site-reveal pt-36">
        <h2 className="site-h2">How it works</h2>
        <ol className="mt-12 grid grid-cols-3 gap-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="site-card p-8">
              <span className="site-mono site-accent">
                {String(i + 1).padStart(2, "0")} / 03
              </span>
              <h3 className="site-h3 mt-10">{step.title}</h3>
              <p className="site-muted mt-2">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-reveal pt-36">
        <h2 className="site-h2 max-w-[18ch]">
          It listens, it <em>remembers</em>, it goes on stream.
        </h2>
        <div className="mt-12 grid grid-cols-3 gap-5">
          <Card lift className="col-span-2 flex gap-10 p-8">
            <div className="flex-1">
              <h3 className="site-h3">Reacts to what you say</h3>
              <p className="site-muted mt-2 max-w-[36ch]">
                Talk like you normally would. Ask a question and chat answers it; get hyped and
                the room speeds up with you.
              </p>
            </div>
            <div className="site-mock w-[320px] p-5">
              <div className="flex items-center gap-3">
                <span className="site-mono site-accent">you</span>
                <span className="text-sm">which boss should I do next?</span>
              </div>
              <div className="my-4 flex h-6 items-end gap-[3px]" aria-hidden>
                {[6, 14, 22, 12, 18, 24, 9, 16, 20, 7, 13, 5].map((h, i) => (
                  <span key={i} className="w-1.5 rounded-sm bg-[#3dff7a]/70" style={{ height: h }} />
                ))}
              </div>
              <MockRows rows={[["--name-2", 120], ["--name-5", 86], ["--name-1", 140]]} />
            </div>
          </Card>
          <Card lift className="p-8">
            <h3 className="site-h3">Emotes that fit</h3>
            <p className="site-muted mt-2">
              Your channel&apos;s 7TV emotes, used when they mean something.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2" aria-hidden>
              {EMOTE_TAGS.map((tag) => (
                <div key={tag} className="site-mock flex flex-col items-center gap-2 p-3">
                  <span className="site-chat-emote" />
                  <span className="site-mono site-muted !text-[11px]">{tag}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card lift className="p-8">
            <h3 className="site-h3">Drop it into OBS</h3>
            <p className="site-muted mt-2">One browser source. Size it like any other chat.</p>
            <div className="site-mock mt-6 flex flex-col gap-3 p-4 text-sm" aria-hidden>
              <span className="site-mono site-muted">Browser source</span>
              <span className="site-mono truncate rounded-lg bg-white/[0.05] px-3 py-2">
                …/overlay?key=••••••••
              </span>
              <span className="site-mono site-muted">400 × 800</span>
              <span className="site-mono flex items-center gap-2">
                <span className="site-tag-dot" /> Connected
              </span>
            </div>
          </Card>
          <Card lift className="col-span-2 flex items-center justify-between gap-10 p-8">
            <div>
              <h3 className="site-h3">Regulars who remember you</h3>
              <p className="site-muted mt-2 max-w-[44ch]">
                A handful of names keep coming back, stream after stream, and remember what you
                talked about. Each one types their own way.
              </p>
            </div>
            <div className="site-mock w-[300px] p-5">
              <MockRows rows={[["--name-3", 96], ["--name-4", 130], ["--name-6", 70]]} />
            </div>
          </Card>
        </div>
      </section>

      <section className="site-reveal pt-36">
        <h2 className="site-h2">Who it&apos;s for</h2>
        <ul className="mt-12 grid grid-cols-4 gap-5">
          {USES.map((u) => (
            <li key={u.title} className="border-t border-white/[0.16] pt-5">
              <h3 className="site-h3">{u.title}</h3>
              <p className="site-muted mt-2">{u.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-reveal site-glow my-36 flex flex-col items-center gap-8 rounded-[24px] border border-white/[0.09] bg-[#0f0f0f] px-8 py-24 text-center">
        <h2 className="site-h1 max-w-[16ch]">
          Never stream to an <em>empty</em> chat again.
        </h2>
        <Button href={CTA_HREF}>Open the simulator</Button>
      </section>
    </>
  );
}
