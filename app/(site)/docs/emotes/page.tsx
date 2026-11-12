import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/site/DocPage";
import { Callout } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Emotes",
  description: "Import your 7TV emotes and choose what they mean.",
};

export default function EmotesDocs() {
  return (
    <DocPage
      slug="emotes"
      title="Emotes"
      lede="Chat posts an emote because it fits the moment, never just because it exists."
      toc={[
        { id: "import", label: "Import your emotes" },
        { id: "meaning", label: "Choose what they mean" },
        { id: "block", label: "Block an emote" },
      ]}
    >
      <h2 id="import">Import your emotes</h2>
      <p>
        In <Link href="/settings/emotes">Settings → Emotes</Link>, enter your Twitch channel to
        import its 7TV emotes, or import the 7TV globals.
      </p>

      <h2 id="meaning">Choose what they mean</h2>
      <p>
        Chat reads an emote&apos;s name to guess what it means. Where that guess is wrong, or
        the name means nothing, tag it yourself: happy, hype, laugh, love, greeting, dance and
        so on. Your tags come first.
      </p>
      <Callout kind="note">
        An emote nobody tagged and whose name means nothing is never posted. A line with no
        emote is better than one with the wrong emote.
      </Callout>

      <h2 id="block">Block an emote</h2>
      <p>
        Block an emote and it&apos;s never posted, and never offered to the model. You can also
        keep an emote out of a single meaning without blocking it everywhere.
      </p>
    </DocPage>
  );
}
