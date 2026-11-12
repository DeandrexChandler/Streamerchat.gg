"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CTA_HREF, NAV_LINKS } from "@/lib/site/links";
import { GitHubLink } from "./GitHubLink";
import { Button } from "./ui";

/** Transparent over the hero; a glass bar once the page has scrolled. */
export function SiteNav() {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // `.site` is the scroll container, not the window.
    const scroller = ref.current?.closest(".site");
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 8);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header ref={ref} className="site-nav" data-scrolled={scrolled}>
      <div className="mx-auto flex max-w-[1200px] items-center gap-10 px-8 py-4">
        <Link href="/" className="site-logo">
          <span className="site-live-dot" aria-hidden />
          <span>
            StreamerChat<span className="site-logo-tld">.gg</span>
          </span>
        </Link>
        <nav aria-label="Site" className="mr-auto flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="site-nav-link"
              aria-current={
                pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined
              }
            >
              {link.label}
            </Link>
          ))}
          <GitHubLink />
        </nav>
        <Button href={CTA_HREF} small>
          Open the simulator
        </Button>
      </div>
    </header>
  );
}
