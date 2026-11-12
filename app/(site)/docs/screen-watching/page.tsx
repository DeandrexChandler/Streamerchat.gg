import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";
import { Callout } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Screen watching",
  description: "Let chat react to what's on your screen.",
};

export default function ScreenDocs() {
  return (
    <DocPage
      slug="screen-watching"
      title="Screen watching"
      lede="Off by default. Turn it on and chat reacts to your game, not only to what you say."
      toc={[
        { id: "on", label: "Turn it on" },
        { id: "point", label: "Point chat at something" },
        { id: "privacy", label: "What gets sent" },
      ]}
    >
      <h2 id="on">Turn it on</h2>
      <p>
        In the simulator&apos;s side panel, turn on <strong>Watch my screen</strong> and pick
        the window to share. What&apos;s on screen then sets how fast chat moves and how many
        emotes it posts, and a big change gets a reaction in about two seconds.
      </p>

      <h2 id="point">Point chat at something</h2>
      <p>
        Say or type the word <strong>screen</strong> and chat looks at what&apos;s on it right
        now. It can be used once every twenty seconds; the transcript panel shows the word blue
        when it worked and grey, with the seconds left, when it didn&apos;t.
      </p>

      <h2 id="privacy">What gets sent</h2>
      <Callout kind="warning">
        Pictures of the window you share are sent to Google to write chat. Share the game
        window, not your whole screen, and keep messages, email and anything personal out of
        it.
      </Callout>
      <p>
        More in the <Link href="/privacy">privacy page</Link>.
      </p>
    </DocPage>
  );
}
