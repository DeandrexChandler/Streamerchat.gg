import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { GitHubLink } from "@/components/site/GitHubLink";
import { SiteNav } from "@/components/site/SiteNav";
import { NAV_LINKS } from "@/lib/site/links";
import "./site.css";

/**
 * Public site. Its own look, scoped under `.site` so none of it reaches the
 * app: Next keeps global stylesheets loaded across navigations, so an
 * unscoped rule here would restyle the simulator.
 */
const inter = Inter({ subsets: ["latin"], variable: "--site-font" });

export const metadata: Metadata = {
  title: { template: "%s · StreamerChat.gg", default: "StreamerChat.gg" },
  description: "A live chat for streams that are quiet. It hears you, remembers you, and goes in OBS.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${inter.variable}`}>
      <SiteNav />
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <Link href="/" className="site-logo">
              <span className="site-live-dot" aria-hidden />
              <span>
                StreamerChat<span className="site-logo-tld">.gg</span>
              </span>
            </Link>
            <p>A live chat for quiet streams.</p>
          </div>
          <nav aria-label="Footer">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <GitHubLink />
          </nav>
        </div>
      </footer>
    </div>
  );
}
