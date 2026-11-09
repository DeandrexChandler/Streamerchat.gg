import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: { absolute: "StreamerChat.gg — a live chat for quiet streams" },
  description:
    "Press Play and a believable Twitch-style chat fills in. It hears what you say, reacts to your game, remembers its regulars, and drops into OBS.",
};

/**
 * The owner drops a recorded session at public/site/demo.mp4. Until then the
 * poster stands in. Never hardcoded chat lines: the model writes every line,
 * even here.
 */
const hasDemo = existsSync(path.join(process.cwd(), "public/site/demo.mp4"));

export default function HomePage() {
  return (
    <>
      <section className="site-hero">
        <div>
          <p className="site-kicker">For streams with a quiet chat</p>
          <h1>
            Stream to a room that <span className="site-mark">talks back</span>.
          </h1>
          <p className="site-lede">
            Press Play and chat fills in. It hears what you say, reacts to what&apos;s on
            screen, remembers its regulars, and sits in OBS like any other chat.
          </p>
          <div className="site-hero-actions">
            <Link href={CTA_HREF} className="site-btn">
              Open the simulator
            </Link>
            <Link href="/features" className="site-btn site-btn-ghost">
              See what it does
            </Link>
          </div>
        </div>
        <div className="site-demo">
          {hasDemo ? (
            <video
              src="/site/demo.mp4"
              poster="/site/poster.svg"
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- static SVG, nothing to optimise
            <img src="/site/poster.svg" alt="A stream with a live chat column beside it" />
          )}
        </div>
      </section>

      <ol className="site-steps" aria-label="How it works">
        <li className="site-step">
          <h3>Press Play</h3>
          <p>Viewers arrive, say hi and start chatting at the speed you pick.</p>
        </li>
        <li className="site-step">
          <h3>Just talk</h3>
          <p>Say something or type it. Chat answers what you actually said.</p>
        </li>
        <li className="site-step">
          <h3>Add it to OBS</h3>
          <p>One browser source and it&apos;s on your stream.</p>
        </li>
      </ol>
    </>
  );
}
