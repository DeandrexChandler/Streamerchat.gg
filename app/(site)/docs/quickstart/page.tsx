import type { Metadata } from "next";
import Link from "next/link";
import { ChatSimulator } from "@/components/site/ChatSimulator";
import { DocPage } from "@/components/site/DocPage";
import { Callout } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Sign up with Twitch, press Play, talk, and add chat to OBS.",
};

export default function Quickstart() {
  return (
    <DocPage
      slug="quickstart"
      title="Quickstart"
      lede="Five steps, about five minutes. Do them in order."
      toc={[
        { id: "start", label: "Start a session" },
        { id: "obs", label: "Add it to OBS" },
        { id: "next", label: "Where next" },
      ]}
    >
      <div className="my-10 flex justify-center">
        <ChatSimulator size="sm" />
      </div>

      <h2 id="start">Start a session</h2>
      <ol className="site-steps">
        <li>
          <h3>Sign up</h3>
          <p>
            <Link href="/signup">Sign up</Link> with <strong>Continue with Twitch</strong>,
            using the account you stream from. Next time, <Link href="/login">log in</Link> the
            same way.
          </p>
        </li>
        <li>
          <h3>Subscribe to Pro</h3>
          <p>
            Chat runs on a <Link href="/pricing">Pro</Link> subscription; without one it stays
            quiet. Pro isn&apos;t on sale yet.
          </p>
        </li>
        <li>
          <h3>Pick a speed</h3>
          <p>
            Use the <strong>Chat speed</strong> slider in the side panel. The slow end is a few
            regulars you talk to by name; the top is CHAOS.
          </p>
        </li>
        <li>
          <h3>Press Play and allow the mic</h3>
          <p>
            Press <strong>Play</strong>. Your browser asks for the microphone; allow it. Talk,
            and chat reacts to what you say.
          </p>
          <Callout kind="tip">
            Speech needs Chrome or Edge. Typing in the box under chat works in any browser, and
            the mic button next to the level meter mutes you without stopping chat.
          </Callout>
        </li>
      </ol>

      <h2 id="obs">Add it to OBS</h2>
      <ol className="site-steps">
        <li>
          <h3>Copy the browser source URL</h3>
          <p>
            Go to <Link href="/settings/obs">Settings → OBS</Link> and copy the URL.
          </p>
        </li>
      </ol>
      <p>
        Then follow <Link href="/docs/obs">OBS setup</Link>. It takes a minute.
      </p>

      <h2 id="next">Where next</h2>
      <ul>
        <li>
          <Link href="/docs/regulars">Regulars</Link>: name, edit and pin the people who keep
          coming back.
        </li>
        <li>
          <Link href="/docs/emotes">Emotes</Link>: bring your channel&apos;s 7TV emotes.
        </li>
        <li>
          <Link href="/docs/screen-watching">Screen watching</Link>: let chat react to your
          game.
        </li>
      </ul>
    </DocPage>
  );
}
