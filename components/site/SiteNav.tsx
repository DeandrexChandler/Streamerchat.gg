"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CTA_HREF, NAV_LINKS } from "@/lib/site/links";
import { GitHubLink } from "./GitHubLink";

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          <span className="site-live-dot" aria-hidden />
          <span>
            StreamerChat<span className="site-logo-tld">.gg</span>
          </span>
        </Link>
        <nav aria-label="Site" className="site-nav">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <GitHubLink />
        </nav>
        <Link href={CTA_HREF} className="site-btn site-btn-sm">
          Open the simulator
        </Link>
      </div>
    </header>
  );
}
