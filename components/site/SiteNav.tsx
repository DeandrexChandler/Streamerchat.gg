"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CTA_HREF, navLinks } from "@/lib/site/links";

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <Link href="/" className="site-logo">
        <span className="site-live-dot" aria-hidden />
        <span>
          StreamerChat<span className="site-logo-tld">.gg</span>
        </span>
      </Link>
      <nav aria-label="Site" className="site-nav">
        {navLinks().map((link) =>
          link.external ? (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ),
        )}
      </nav>
      <Link href={CTA_HREF} className="site-btn site-btn-sm site-header-cta">
        Open the simulator
      </Link>
    </header>
  );
}
