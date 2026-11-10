import type { Metadata } from "next";
import Link from "next/link";
import { CTA_HREF } from "@/lib/site/links";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Set up StreamerChat.gg: sign in, allow the mic, bring your emotes, optional screen watching, and the OBS browser source.",
};

export default function DocsPage() {
  return (
    <div className="site-page site-page-narrow site-prose">
      <h1>Setup</h1>
      <p className="site-lede">Five steps, about five minutes. Do them in order.</p>

      <ol className="site-docsteps">
        <li className="site-docstep">
          <h2>Sign up</h2>
          <p>
            <Link href={CTA_HREF}>Sign up</Link> with <strong>Continue with Twitch</strong>,
            using the account you stream from. You land in the simulator. Next time,{" "}
            <Link href="/login">log in</Link> the same way.
          </p>
        </li>

        <li className="site-docstep">
          <h2>Press Play and allow the mic</h2>
          <p>
            Press <strong>Play</strong>. Your browser asks for the microphone; allow it. Talk
            and chat reacts to what you say.
          </p>
          <ul>
            <li>
              Use Chrome or Edge. Speech recognition doesn&apos;t work in other browsers;
              typing in the box under chat works everywhere.
            </li>
            <li>The mic button next to the level meter mutes you without stopping chat.</li>
          </ul>
        </li>

        <li className="site-docstep">
          <h2>Bring your emotes (optional)</h2>
          <p>
            In <Link href="/settings/emotes">Settings → Emotes</Link>, enter your Twitch
            channel to import its 7TV emotes, or import the 7TV globals. Chat only uses an
            emote when it fits the moment.
          </p>
        </li>

        <li className="site-docstep">
          <h2>Screen watching (optional)</h2>
          <p>
            Off by default. In the simulator&apos;s side panel, turn on{" "}
            <strong>Watch my screen</strong> and pick the window to share. Chat then reacts
            to what&apos;s happening in your game, not only to what you say.
          </p>
          <p className="site-note">
            Screenshots of that window are sent to Google to generate chat. Share the game
            window, not your whole screen, and keep messages, email and anything personal
            out of it.
          </p>
        </li>

        <li className="site-docstep">
          <h2>Add it to OBS</h2>
          <p>
            Go to <Link href="/settings/obs">Settings → OBS</Link> and copy the browser
            source URL. In OBS:
          </p>
          <ol>
            <li>
              In <strong>Sources</strong>, click <strong>+</strong> and choose{" "}
              <strong>Browser</strong>.
            </li>
            <li>Paste the URL into the URL field.</li>
            <li>
              Set the width and height to the size of your chat box. 400 × 800 is a good
              start.
            </li>
            <li>Click OK and drag it where you want it.</li>
          </ol>
          <p>
            The status on the OBS settings page turns green when the source connects. Keep
            the simulator open in your browser while you stream: that&apos;s where chat
            comes from.
          </p>
          <p className="site-note">
            Treat that URL like a password. The <code>key</code> in it is what lets a
            browser source receive your chat.
          </p>
        </li>
      </ol>

      <h2>Run it on your own computer</h2>
      <p>
        You can run StreamerChat.gg locally with your own Gemini key instead. There&apos;s
        no sign-in, and Google bills you directly for what chat uses.
      </p>
      <ol>
        <li>
          Get a key from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>{" "}
          (<strong>Create API key</strong>).
        </li>
        <li>
          With Node 20 or newer, in the project folder:
          <pre>
            <code>{`npm install
cp .env.example .env.local`}</code>
          </pre>
        </li>
        <li>
          Paste your key after <code>GOOGLE_API_KEY=</code> in <code>.env.local</code>, then
          run <code>npm run dev</code> and open <code>http://localhost:3000/simulator</code>.
        </li>
      </ol>
      <p className="site-note">
        Without a key the simulator still opens, but chat says nothing. It never falls back
        to canned lines. Keep the name exactly <code>GOOGLE_API_KEY</code>: never add{" "}
        <code>NEXT_PUBLIC_</code> to it, or your key ships to every browser that opens the
        page.
      </p>
    </div>
  );
}
