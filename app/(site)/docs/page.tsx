import type { Metadata } from "next";
import Link from "next/link";
import { DOC_PAGES } from "@/lib/site/docs";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Set up StreamerChat.gg: sign up, press Play, add it to OBS, and make the regulars, emotes and screen watching your own.",
};

export default function DocsHome() {
  return (
    <div className="max-w-[900px]">
      <h1 className="site-h1">Docs</h1>
      <p className="site-lede mt-5">
        Everything you need to get chat on your stream. Start with the quickstart; the rest is
        for when you want to make it yours.
      </p>
      <ul className="mt-12 grid grid-cols-2 gap-4">
        {DOC_PAGES.map((p, i) => (
          <li key={p.slug}>
            <Link href={`/docs/${p.slug}`} className="site-card site-card-lift block h-full p-6">
              <span className="site-mono site-accent">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="site-h3 mt-6">{p.title}</h2>
              <p className="site-muted mt-1.5 text-[15px]">{p.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
