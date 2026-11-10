import type { Metadata } from "next";
import Link from "next/link";
import { Archivo } from "next/font/google";
import { SiteNav } from "@/components/site/SiteNav";
import "./site.css";

/**
 * Public site. Its own look, scoped under `.site` so none of it reaches the
 * app: Next keeps global stylesheets loaded across navigations, so an
 * unscoped rule here would restyle the simulator.
 */
/** Archivo at full width: the wide, broadcast-graphics headline face. */
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--site-display" });

export const metadata: Metadata = {
  title: { template: "%s · StreamerChat.gg", default: "StreamerChat.gg" },
  description: "A live chat for streams that are quiet. It hears you, remembers you, and goes in OBS.",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${display.variable}`}>
      <SiteNav />
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        <span>StreamerChat.gg</span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
