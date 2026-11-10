import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Cast, Mic, Play } from "lucide-react";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: { absolute: "StreamerChat.gg — a live chat for quiet streams" },
  description:
    "Press Play and a believable Twitch-style chat fills in. It hears what you say, reacts to your game, remembers its regulars, and drops into OBS.",
};

/**
 * The owner drops a recorded session at public/site/demo.mp4 and it replaces
 * the placeholder. Checked at build, so a deploy picks it up on the next build.
 */
const hasDemo = existsSync(path.join(process.cwd(), "public/site/demo.mp4"));

const STEPS = [
  { icon: Play, title: "Press Play", body: "Viewers arrive, say hi and start chatting at the speed you pick." },
  { icon: Mic, title: "Just talk", body: "Say something or type it. Chat answers what you actually said." },
  { icon: Cast, title: "Add it to OBS", body: "One browser source and it's on your stream." },
];

export default function HomePage() {
  return (
    <>
      <section className="site-hero">
        <h1>Stream to a room that talks back.</h1>
        <p className="site-lede">
          Press Play and chat fills in. It hears what you say, reacts to your game,
          remembers its regulars, and sits in OBS like any other chat.
        </p>
        <div className="site-actions">
          <Link href={CTA_HREF} className="site-btn">
            Open the simulator
          </Link>
          <Link href="/features" className="site-btn site-btn-ghost">
            See what it does
          </Link>
        </div>
      </section>

      <div className="site-demo">
        {hasDemo ? (
          <video
            src="/site/demo.mp4"
            controls
            muted
            playsInline
            preload="metadata"
            aria-label="A recorded session of the chat"
          />
        ) : (
          <div className="site-demo-empty">
            <span className="site-typing" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <p className="site-demo-title">Demo coming soon</p>
            <p>
              The simulator is still being tuned. A recorded session goes here once
              it&apos;s ready.
            </p>
          </div>
        )}
      </div>

      <section className="site-section" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol className="site-steps">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon size={20} aria-hidden />
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-band">
        <h2>Try it on your next stream.</h2>
        <p>It runs in your browser. Press Play and start talking.</p>
        <Link href={CTA_HREF} className="site-btn">
          Open the simulator
        </Link>
      </section>
    </>
  );
}
