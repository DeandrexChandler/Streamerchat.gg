import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What StreamerChat.gg sends where: transcripts and, if you turn it on, screen frames go to Google's Gemini API to write chat.",
};

export default function PrivacyPage() {
  return (
    <div className="site-page site-page-narrow site-prose">
      <p className="site-kicker">Privacy</p>
      <h1>Privacy</h1>
      <p className="site-draft">Draft for review. Not legal text yet.</p>

      <h2>The short version</h2>
      <p>
        To write chat, StreamerChat.gg sends what you say and, only if you turn screen
        watching on, pictures of the window you share, to Google&apos;s Gemini API. There
        are no accounts, no ads and no analytics. Your settings stay in your browser.
      </p>

      <h2>What leaves your computer</h2>
      <h3>Your voice, as text</h3>
      <p>
        When the mic is on, your browser&apos;s built-in speech recognition turns what you
        say into text. In Chrome and Edge that recognition is done by the browser
        maker&apos;s servers (Google for Chrome, Microsoft for Edge), under their terms.
        Audio itself is never sent to StreamerChat.gg.
      </p>
      <p>
        The resulting transcript, and anything you type into the simulator, is sent to
        Google&apos;s Gemini API to generate chat.
      </p>

      <h3>Screen frames, only when you turn it on</h3>
      <p>
        Screen watching is off by default. When you turn it on, small screenshots of the
        window you choose are sent to Google&apos;s Gemini API along with requests for chat.
        Turning it off stops them.
      </p>

      <h3>What else goes with it</h3>
      <p>
        Each request to Gemini also carries recent chat, your regulars&apos; names, notes
        about them, and your chat settings, so the model can keep the conversation
        consistent.
      </p>

      <h3>Emotes</h3>
      <p>
        Importing emotes looks up the channel you enter on 7TV. Emote images load from
        7TV&apos;s servers.
      </p>

      <h2>What stays in your browser</h2>
      <p>
        Settings, imported emotes, and your regulars and what they remember are saved in
        your browser&apos;s local storage. Clearing site data for this app removes them.
      </p>

      <h2>OBS</h2>
      <p>
        Chat on the OBS overlay passes through the app&apos;s server to reach the browser
        source. It is held in memory only long enough to deliver, and not stored.
      </p>

      <h2>Google&apos;s handling</h2>
      <p>
        What Google does with data sent to the Gemini API is covered by{" "}
        <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">
          Google&apos;s Gemini API terms
        </a>
        , which apply to the key used.
      </p>
    </div>
  );
}
