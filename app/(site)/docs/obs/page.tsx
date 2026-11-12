import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";
import { Callout } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "OBS setup",
  description: "Add StreamerChat.gg to OBS as a browser source.",
};

export default function ObsDocs() {
  return (
    <DocPage
      slug="obs"
      title="OBS setup"
      lede="Chat goes on your stream as a browser source, with a transparent background."
      toc={[
        { id: "add", label: "Add the browser source" },
        { id: "check", label: "Check it's connected" },
        { id: "key", label: "Keep the URL private" },
      ]}
    >
      <h2 id="add">Add the browser source</h2>
      <ol className="site-steps">
        <li>
          <h3>Copy the URL</h3>
          <p>
            In <Link href="/settings/obs">Settings → OBS</Link>, copy the browser source URL.
          </p>
        </li>
        <li>
          <h3>Create the source</h3>
          <p>
            In OBS, under <strong>Sources</strong>, click <strong>+</strong> and choose{" "}
            <strong>Browser</strong>. Paste the URL into the URL field.
          </p>
        </li>
        <li>
          <h3>Size it</h3>
          <p>
            Set the width and height to the size of your chat box. 400 × 800 is a good start.
            Click OK and drag it where you want it.
          </p>
        </li>
      </ol>

      <h2 id="check">Check it&apos;s connected</h2>
      <p>
        The status on the OBS settings page turns green when the source connects. Keep the
        simulator open in your browser while you stream: that&apos;s where chat comes from.
      </p>
      <Callout kind="note">
        Other streaming apps with a browser source take the same URL. We set it up and test it
        with OBS.
      </Callout>

      <h2 id="key">Keep the URL private</h2>
      <Callout kind="warning">
        Treat the URL like a password. The <code>key</code> in it is what lets a browser source
        receive your chat. Don&apos;t show it on stream or paste it in a chat.
      </Callout>
    </DocPage>
  );
}
