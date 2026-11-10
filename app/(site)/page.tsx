import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { ChatColumn } from "@/components/site/ChatColumn";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: { absolute: "StreamerChat.gg — a live chat for quiet streams" },
  description:
    "Press Play and a believable Twitch-style chat fills in. It hears what you say, reacts to your game, remembers its regulars, and drops into OBS.",
};

/**
 * The owner drops a portrait recording of the chat column at
 * public/site/demo.mp4 and it takes the animated column's place. Checked at
 * build, so a deploy picks it up on the next build.
 */
const hasDemo = existsSync(path.join(process.cwd(), "public/site/demo.mp4"));

export default function HomePage() {
  return (
    <>
      <section className="site-hero">
        <div className="site-hero-copy">
          <h1>Stream to a room that talks back.</h1>
          <p className="site-lede">
            Press Play and chat fills in. It hears what you say, reacts to your game,
            remembers its regulars, and sits in OBS like any other chat.
          </p>
          <div className="site-actions">
            <Link href={CTA_HREF} className="site-btn">
              Open the simulator
            </Link>
            <Link href="/features" className="site-link">
              See what it does
            </Link>
          </div>
        </div>
        {hasDemo ? (
          <video
            className="site-col site-col-video"
            src="/site/demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            aria-label="A recorded session of the chat"
          />
        ) : (
          <ChatColumn />
        )}
      </section>

      <ol className="site-steps" aria-label="How it works">
        <li>
          <h2>Press Play</h2>
          <p>Viewers arrive, say hi and start chatting at the speed you pick.</p>
        </li>
        <li>
          <h2>Just talk</h2>
          <p>Say something or type it. Chat answers what you actually said.</p>
        </li>
        <li>
          <h2>Add it to OBS</h2>
          <p>One browser source and it&apos;s on your stream.</p>
        </li>
      </ol>
    </>
  );
}
