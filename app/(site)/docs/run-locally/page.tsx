import type { Metadata } from "next";
import { CodeBlock } from "@/components/site/CodeBlock";
import { DocPage } from "@/components/site/DocPage";
import { Callout } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Run it locally",
  description: "Run StreamerChat.gg on your own computer with your own Gemini key.",
};

export default function RunLocallyDocs() {
  return (
    <DocPage
      slug="run-locally"
      title="Run it locally"
      lede="Run StreamerChat.gg on your own computer with your own Gemini key. There's no sign-in, and Google bills you directly for what chat uses."
      toc={[
        { id: "key", label: "Get a key" },
        { id: "install", label: "Install" },
        { id: "run", label: "Run" },
      ]}
    >
      <h2 id="key">Get a key</h2>
      <p>
        Create one in{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Google AI Studio
        </a>{" "}
        with <strong>Create API key</strong>.
      </p>

      <h2 id="install">Install</h2>
      <p>With Node 20 or newer, in the project folder:</p>
      <CodeBlock lang="bash" code={"npm install\ncp .env.example .env.local"} />
      <p>
        Paste your key into <code>.env.local</code>:
      </p>
      <CodeBlock lang=".env.local" code={"GOOGLE_API_KEY=your-key-here"} />
      <Callout kind="warning">
        Keep the name exactly <code>GOOGLE_API_KEY</code>. Never add <code>NEXT_PUBLIC_</code>{" "}
        to it, or your key ships to every browser that opens the page.
      </Callout>

      <h2 id="run">Run</h2>
      <CodeBlock lang="bash" code="npm run dev" />
      <p>
        Open <code>http://localhost:3000/simulator</code>.
      </p>
      <Callout kind="note">
        Without a key the simulator still opens, but chat says nothing. It never falls back to
        canned lines.
      </Callout>
    </DocPage>
  );
}
