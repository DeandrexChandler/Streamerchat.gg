import type { Metadata } from "next";
import Link from "next/link";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: "Features",
  description:
    "A chat that hears you, regulars who remember you, emotes that fit, reactions to your game, idle chatter when you go quiet, and an OBS browser source.",
};

const FEATURES = [
  {
    title: "It hears you",
    body: "Talk like you normally would. Ask chat a question and it answers. Get hyped and the room speeds up with you. Typing works too.",
  },
  {
    title: "Regulars who remember you",
    body: "A handful of names keep coming back, stream after stream. They remember what you talked about and what you said to them, and each one types their own way. You can edit or pin anyone.",
  },
  {
    title: "Emotes that fit",
    body: "Import your channel's 7TV emotes and chat uses them when they mean something, not at random. Tag them yourself, or block the ones you never want to see.",
  },
  {
    title: "It watches your game",
    body: "Turn on screen watching and chat reacts to what's happening, in a couple of seconds. A big moment gets a big reaction. It's off until you switch it on.",
  },
  {
    title: "It doesn't die when you go quiet",
    body: "Concentrating on a hard section? After a while chat starts talking among itself, and keeps it going the longer you're away.",
  },
  {
    title: "Goes straight into OBS",
    body: "Copy one URL into a browser source. Your chat shows up on stream, sized and placed however you like.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="site-page">
      <h1>A chat that feels like a chat.</h1>
      <p className="site-lede">
        Not a loop of canned lines. Every message is written fresh for your stream, by
        people who know who you are.
      </p>
      <dl className="site-features">
        {FEATURES.map(({ title, body }) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>{body}</dd>
          </div>
        ))}
      </dl>
      <div className="site-actions">
        <Link href={CTA_HREF} className="site-btn">
          Open the simulator
        </Link>
        <Link href="/docs" className="site-link">
          Set it up
        </Link>
      </div>
    </div>
  );
}
