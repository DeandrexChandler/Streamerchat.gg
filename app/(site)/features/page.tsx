import type { Metadata } from "next";
import Link from "next/link";
import { Ear, MonitorPlay, Moon, Smile, Tv, Users } from "lucide-react";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: "Features",
  description:
    "A chat that hears you, regulars who remember you, emotes that fit, reactions to your game, idle chatter when you go quiet, and an OBS browser source.",
};

const FEATURES = [
  {
    icon: Ear,
    title: "It hears you",
    body: "Talk like you normally would. Ask chat a question and it answers. Get hyped and the room speeds up with you. Typing works too.",
  },
  {
    icon: Users,
    title: "Regulars who remember you",
    body: "A handful of names keep coming back, stream after stream. They remember what you talked about and what you said to them, and each one types their own way. You can edit or pin anyone.",
  },
  {
    icon: Smile,
    title: "Emotes that fit",
    body: "Import your channel's 7TV emotes and chat uses them when they mean something, not at random. Tag them yourself, or block the ones you never want to see.",
  },
  {
    icon: MonitorPlay,
    title: "It watches your game",
    body: "Turn on screen watching and chat reacts to what's happening, in a couple of seconds. A big moment gets a big reaction. It's off until you switch it on.",
  },
  {
    icon: Moon,
    title: "It doesn't die when you go quiet",
    body: "Concentrating on a hard section? After a while chat starts talking among itself, and keeps it going the longer you're away.",
  },
  {
    icon: Tv,
    title: "Goes straight into OBS",
    body: "Copy one URL into a browser source. Your chat shows up on stream, sized and placed however you like.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="site-page">
      <p className="site-kicker">Features</p>
      <h1>A chat that feels like a chat.</h1>
      <p className="site-lede">
        Not a loop of canned lines. Every message is written fresh for your stream, by
        people who know who you are.
      </p>
      <div className="site-features">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <section key={title} className="site-feature">
            <Icon size={26} aria-hidden />
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <div className="site-hero-actions">
        <Link href={CTA_HREF} className="site-btn">
          Open the simulator
        </Link>
        <Link href="/docs" className="site-btn site-btn-ghost">
          Set it up
        </Link>
      </div>
    </div>
  );
}
