import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";
import { Callout } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Regulars",
  description: "The people who keep coming back to your chat, and how to edit them.",
};

export default function RegularsDocs() {
  return (
    <DocPage
      slug="regulars"
      title="Regulars"
      lede="Chat is regulars plus strangers. Regulars come back every stream and remember you; strangers pass through once."
      toc={[
        { id: "how", label: "How the room works" },
        { id: "edit", label: "Edit a regular" },
        { id: "pin", label: "Pin someone" },
      ]}
    >
      <h2 id="how">How the room works</h2>
      <p>
        The slower the chat speed, the more of it is regulars: three at the slowest, up to
        twelve at CHAOS. At ~0.5/sec and below, chat is just regulars, and each one is written
        by name, in their own voice. Above that they blend into a crowd of strangers.
      </p>
      <p>
        Regulars remember a few topics, a few of their own lines and what you said to them.
        That memory is saved in your browser and carries over to your next stream.
      </p>

      <h2 id="edit">Edit a regular</h2>
      <p>
        Open <Link href="/settings/regulars">Settings → Regulars</Link>. For each person you
        can change:
      </p>
      <ul>
        <li>
          <strong>Name</strong> and <strong>colour</strong>.
        </li>
        <li>
          <strong>Archetype</strong>: lurker, chatty regular, hype viewer, wholesome, question
          asker, bit-doer, emote spammer, long-time regular or just arrived.
        </li>
        <li>
          <strong>Habits</strong>: line length, shouting, punctuation, questions and stretched
          wordsss.
        </li>
        <li>
          <strong>What they&apos;re like</strong>, in your own words. This outranks everything
          else.
        </li>
      </ul>
      <Callout kind="tip">
        A running session never overwrites your edits.
      </Callout>

      <h2 id="pin">Pin someone</h2>
      <p>
        Pinned people are kept in the room. Everyone else can be replaced as the room changes.
        <strong> Start over</strong> forgets everyone, including people you wrote, and the next
        session builds a new room.
      </p>
    </DocPage>
  );
}
