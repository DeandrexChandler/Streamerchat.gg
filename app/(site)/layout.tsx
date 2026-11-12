import type { Metadata } from "next";
import Link from "next/link";
import { Geist_Mono, Instrument_Serif } from "next/font/google";
import { GitHubLink } from "@/components/site/GitHubLink";
import { SiteNav } from "@/components/site/SiteNav";
import { DOC_PAGES } from "@/lib/site/docs";
import "./site.css";

/**
 * Public site. Its own look, scoped under `.site` so none of it reaches the
 * app: Next keeps global stylesheets loaded across navigations, so an
 * unscoped rule here would restyle the simulator. Geist (the sans) comes from
 * the root layout as --font-sans.
 */
const mono = Geist_Mono({ subsets: ["latin"], variable: "--site-mono" });
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--site-serif",
});

export const metadata: Metadata = {
  title: { template: "%s · StreamerChat.gg", default: "StreamerChat.gg" },
  description: "A live chat for streams that are quiet. It hears you, remembers you, and goes in OBS.",
};

const FOOTER = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Creators", href: "/creators" },
    ],
  },
  {
    title: "Docs",
    links: DOC_PAGES.slice(0, 4).map((p) => ({ label: p.title, href: `/docs/${p.slug}` })),
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${mono.variable} ${serif.variable}`}>
      <SiteNav />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-8">{children}</main>
      <footer className="mt-10 shrink-0 overflow-hidden border-t border-white/[0.09]">
        <div className="mx-auto flex max-w-[1200px] justify-between gap-16 px-8 pb-16 pt-14">
          <div>
            <Link href="/" className="site-logo">
              <span className="site-live-dot" aria-hidden />
              <span>
                StreamerChat<span className="site-logo-tld">.gg</span>
              </span>
            </Link>
            <p className="site-muted mt-3 text-sm">A live chat for quiet streams.</p>
          </div>
          <div className="flex gap-20">
            {FOOTER.map((col) => (
              <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3 text-sm">
                <span className="site-mono site-muted">{col.title}</span>
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className="site-nav-link !text-sm">
                    {l.label}
                  </Link>
                ))}
              </nav>
            ))}
            <div className="flex flex-col gap-3 text-sm">
              <span className="site-mono site-muted">Code</span>
              <GitHubLink />
            </div>
          </div>
        </div>
        <div className="site-wordmark px-6 text-center" aria-hidden>
          StreamerChat.gg
        </div>
      </footer>
    </div>
  );
}
