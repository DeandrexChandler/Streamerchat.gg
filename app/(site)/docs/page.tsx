import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Set up StreamerChat.gg: a Gemini key, the mic, optional screen watching, and the OBS browser source.",
};

export default function DocsPage() {
  return (
    <div className="site-page site-page-narrow site-prose">
      <p className="site-kicker">Docs</p>
      <h1>Setup</h1>
      <p className="site-lede">Five steps, about ten minutes. Do them in order.</p>

      <ol className="site-docsteps">
        <li className="site-docstep">
          <h2>Get a Gemini key</h2>
          <p>
            Chat is written by Google&apos;s Gemini. Sign in to{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            , click <strong>Create API key</strong> and copy it. Google bills you for what
            chat uses.
          </p>
        </li>

        <li className="site-docstep">
          <h2>
            Put it in <code>.env.local</code>
          </h2>
          <p>You need Node 20 or newer. In the project folder:</p>
          <pre>
            <code>{`npm install
cp .env.example .env.local`}</code>
          </pre>
          <p>
            Open <code>.env.local</code> and paste your key after{" "}
            <code>GOOGLE_API_KEY=</code>. Then start the app:
          </p>
          <pre>
            <code>npm run dev</code>
          </pre>
          <p className="site-note">
            Without a key the simulator still opens, but chat says nothing. It never
            falls back to canned lines. Keep the name exactly <code>GOOGLE_API_KEY</code>:
            never add <code>NEXT_PUBLIC_</code> to it, or your key ships to every
            browser that opens the page.
          </p>
        </li>

        <li className="site-docstep">
          <h2>Allow the mic</h2>
          <p>
            Open <Link href="/simulator">the simulator</Link> and press <strong>Play</strong>
            . Your browser asks for the microphone; allow it. Talk and chat reacts to what
            you say.
          </p>
          <ul>
            <li>
              Use Chrome or Edge. Speech recognition doesn&apos;t work in other browsers;
              typing in the box under chat works everywhere.
            </li>
            <li>
              The mic only works on <code>localhost</code> or an <code>https</code> address.
            </li>
            <li>The mic button next to the level meter mutes you without stopping chat.</li>
          </ul>
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
            <li>Set the width and height to the size of your chat box. 400 × 800 is a good start.</li>
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

      <h2>Emotes</h2>
      <p>
        Want your channel&apos;s emotes in chat? In{" "}
        <Link href="/settings/emotes">Settings → Emotes</Link>, enter your Twitch channel to
        import its 7TV emotes, or import the 7TV globals. Chat only uses an emote when it
        fits the moment.
      </p>
    </div>
  );
}
