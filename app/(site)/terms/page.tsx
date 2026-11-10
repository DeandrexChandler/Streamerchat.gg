import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for StreamerChat.gg.",
};

export default function TermsPage() {
  return (
    <div className="site-page site-page-narrow site-prose">
      <h1>Terms</h1>
      <p className="site-draft">Draft for review. Not legal text yet.</p>

      <h2>What this is</h2>
      <p>
        StreamerChat.gg generates a simulated chat with AI. The viewers in it are not real
        people, and nothing they say comes from a real person.
      </p>

      <h2>Being honest with your audience</h2>
      <p>
        You decide how to use it on stream. Don&apos;t use it to mislead viewers,
        sponsors or platforms about how many real people are watching or chatting, and
        follow the rules of the platform you stream on.
      </p>

      <h2>AI-written content</h2>
      <p>
        Chat is written by an AI model. It is filtered, but it can still get things wrong
        or say something you wouldn&apos;t. You&apos;re responsible for what you put on
        your stream.
      </p>

      <h2>Your key and your costs</h2>
      <p>
        If you use your own Gemini key, Google bills you for what chat uses, under
        Google&apos;s terms. Keep your key private.
      </p>

      <h2>Your data</h2>
      <p>
        See the <Link href="/privacy">privacy page</Link> for what is sent where.
      </p>

      <h2>No warranty</h2>
      <p>
        It&apos;s provided as is, without warranty of any kind. It may change or stop
        working at any time.
      </p>
    </div>
  );
}
