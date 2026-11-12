import type { Metadata } from "next";
import { ChatSimulator } from "@/components/site/ChatSimulator";
import { Button, Card, Tag } from "@/components/site/ui";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Regulars who remember you, a chat that hears you, reactions to your game, idle chatter when you go quiet, your own emotes, and an OBS browser source.",
};

const SPEEDS = ["~0.2/sec", "~0.5/sec", "~1/sec", "~1.5/sec", "~2/sec", "CHAOS"];
const ARCHETYPES = [
  "Lurker",
  "Chatty regular",
  "Hype viewer",
  "Wholesome",
  "Question asker",
  "Bit-doer",
  "Emote spammer",
  "Long-time regular",
  "Just arrived",
];

const SMALL = [
  { title: "Your own emotes", body: "Import your channel's 7TV set, or the 7TV globals." },
  { title: "Emote rules", body: "Tag what an emote means, or block it from ever being posted." },
  { title: "Edit anyone", body: "Rename a regular, recolour them, or write their character yourself." },
  { title: "Pin regulars", body: "Pinned people are never rotated out of the room." },
  { title: "Mute without stopping", body: "Mute the mic and chat keeps going on its own." },
  { title: "Type instead", body: "No mic? Type to chat. Speech needs Chrome or Edge; typing works anywhere." },
];

const VERSUS: [string, string][] = [
  ["Chat answers what you say", "Silence"],
  ["Viewers arrive and say hi", "Nobody knows you're live"],
  ["Reactions when your game pops off", "You narrate to no one"],
  ["Something to talk to on day one", "Waiting for viewer number one"],
];

function Row({
  tag,
  title,
  children,
  visual,
  flip = false,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="site-reveal grid grid-cols-2 items-center gap-20 border-t border-white/[0.09] py-24">
      <div className={flip ? "order-2" : undefined}>
        <span className="site-mono site-accent">{tag}</span>
        <h2 className="site-h2 mt-5">{title}</h2>
        <div className="site-muted mt-5 max-w-[46ch] text-lg">{children}</div>
      </div>
      <div className={`flex justify-center ${flip ? "order-1" : ""}`}>{visual}</div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <section className="flex min-h-[60vh] flex-col items-start justify-center py-20">
        <Tag>Features</Tag>
        <h1 className="site-display mt-8 max-w-[14ch]">
          Everything chat does. <em>Minus</em> the trolls.
        </h1>
        <p className="site-lede mt-8">
          Every line is written fresh for your stream. Viewers tease each other and go off on
          tangents, but they never turn on you.
        </p>
      </section>

      <Row
        tag="01 / 04"
        title="A room full of different people"
        visual={
          <div className="site-glow">
            <ChatSimulator size="sm" />
          </div>
        }
      >
        <p>
          Regulars come back stream after stream and remember what you talked about. Strangers
          pass through once. Each regular types their own way: line length, caps, punctuation,
          the things they always bring up.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {ARCHETYPES.map((a) => (
            <li key={a} className="site-tag">
              {a}
            </li>
          ))}
        </ul>
      </Row>

      <Row
        tag="02 / 04"
        title="Controls you'll actually use"
        flip
        visual={
          <Card className="w-[400px] p-6">
            <span className="site-mono site-muted">Chat speed</span>
            <div className="mt-5 flex justify-between" aria-hidden>
              {SPEEDS.map((s, i) => (
                <span
                  key={s}
                  className={`site-mono !text-[11px] ${i === 2 ? "site-accent" : "site-muted"}`}
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="relative mt-3 h-1.5 rounded-full bg-white/10" aria-hidden>
              <span className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-[#3dff7a]" />
              <span className="absolute -top-[5px] left-[40%] size-4 rounded-full border-2 border-[#0a0a0a] bg-[#3dff7a]" />
            </div>
            <div className="mt-8 flex flex-col gap-4 text-sm" aria-hidden>
              {[
                ["Microphone", "On"],
                ["Watch my screen", "Off"],
                ["Regulars in the room", "6"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-t border-white/[0.09] pt-4">
                  <span>{k}</span>
                  <span className="site-mono site-muted">{v}</span>
                </div>
              ))}
            </div>
          </Card>
        }
      >
        <p>
          Six speeds, from one line every five seconds to CHAOS. At the slow end it&apos;s three
          or four regulars you talk to by name; at the top it&apos;s a crowd. Mute the mic, type
          instead, or turn screen watching on and off without stopping chat.
        </p>
      </Row>

      <Row
        tag="03 / 04"
        title="It reacts to moments"
        visual={
          <Card className="w-[400px] p-6">
            {[
              ["You get hyped", "The room speeds up for a few seconds"],
              ["You say “screen”", "Chat looks at what you're pointing at"],
              ["Something big happens on screen", "A reaction in about two seconds"],
              ["You go quiet for five minutes", "Chat starts talking among itself"],
            ].map(([when, then]) => (
              <div key={when} className="border-b border-white/[0.09] py-4 last:border-0">
                <span className="site-mono site-accent">{when}</span>
                <p className="site-muted mt-1 text-sm">{then}</p>
              </div>
            ))}
          </Card>
        }
      >
        <p>
          A question to chat or a hype moment lifts the pace for a moment, then it
          settles. With screen watching on, a big moment in your game gets a reaction in about two seconds, and saying &ldquo;screen&rdquo; points chat at it. Concentrating? After a
          while chat keeps itself busy, and keeps it going the longer you&apos;re away.
        </p>
      </Row>

      <Row
        tag="04 / 04"
        title="Straight into OBS"
        flip
        visual={
          <Card className="w-[400px] p-6">
            <span className="site-mono site-muted">Settings → OBS</span>
            <div className="site-mono mt-4 truncate rounded-lg bg-white/[0.05] px-3 py-2 !text-sm">
              …/overlay?key=••••••••
            </div>
            <div className="mt-5 flex items-center justify-between text-sm">
              <span className="site-mono site-muted">400 × 800 · transparent</span>
              <span className="site-mono flex items-center gap-2">
                <span className="site-tag-dot" /> Connected
              </span>
            </div>
          </Card>
        }
      >
        <p>
          Copy one URL into a browser source. Chat shows up on stream with a transparent
          background, sized and placed however you like. The settings page shows when OBS is
          connected.
        </p>
      </Row>

      <section className="site-reveal border-t border-white/[0.09] py-24">
        <h2 className="site-h2">And the small things</h2>
        <ul className="mt-12 grid grid-cols-3 gap-5">
          {SMALL.map((f) => (
            <li key={f.title} className="site-card site-card-lift p-7">
              <h3 className="site-h3 !text-[17px]">{f.title}</h3>
              <p className="site-muted mt-2 text-[15px]">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-reveal border-t border-white/[0.09] py-24">
        <h2 className="site-h2">StreamerChat.gg vs. streaming to 0 viewers</h2>
        <div className="mt-12 grid grid-cols-2 overflow-hidden rounded-[20px] border border-white/[0.09]">
          <div className="bg-[#141414] p-8">
            <span className="site-mono site-accent">StreamerChat.gg</span>
            <ul className="mt-6 flex flex-col gap-4">
              {VERSUS.map(([us]) => (
                <li key={us}>{us}</li>
              ))}
            </ul>
          </div>
          <div className="border-l border-white/[0.09] p-8">
            <span className="site-mono site-muted">0 viewers</span>
            <ul className="site-muted mt-6 flex flex-col gap-4">
              {VERSUS.map(([us, them]) => (
                <li key={us}>{them}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex gap-3">
          <Button href={CTA_HREF}>Open the simulator</Button>
          <Button href="/docs/quickstart" variant="ghost">
            Read the quickstart
          </Button>
        </div>
      </section>
    </>
  );
}
