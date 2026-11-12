"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DOC_PAGES } from "@/lib/site/docs";

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <details open className="sticky top-24">
      <summary className="site-mono site-muted mb-3 cursor-pointer px-3">Guides</summary>
      <nav aria-label="Docs" className="flex flex-col gap-0.5">
        <Link href="/docs" className="site-side-link" aria-current={pathname === "/docs" ? "page" : undefined}>
          Overview
        </Link>
        {DOC_PAGES.map((p) => {
          const href = `/docs/${p.slug}`;
          return (
            <Link key={p.slug} href={href} className="site-side-link" aria-current={pathname === href ? "page" : undefined}>
              {p.title}
            </Link>
          );
        })}
      </nav>
    </details>
  );
}

/** Filters the docs pages by title and summary. ⌘K or Ctrl+K focuses it. */
export function DocsSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits = q
    ? DOC_PAGES.filter((p) => `${p.title} ${p.blurb}`.toLowerCase().includes(q))
    : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full max-w-[420px]">
      <input
        ref={input}
        type="search"
        className="site-search"
        placeholder="Search the docs"
        aria-label="Search the docs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) {
            router.push(`/docs/${hits[0].slug}`);
            setQuery("");
          }
          if (e.key === "Escape") setQuery("");
        }}
      />
      <span className="site-kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">⌘K</span>
      {q && (
        <ul className="site-card absolute inset-x-0 top-full z-10 mt-2 p-2">
          {hits.length === 0 ? (
            <li className="site-muted px-3 py-2 text-sm">No page matches “{query}”.</li>
          ) : (
            hits.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/docs/${p.slug}`}
                  onClick={() => setQuery("")}
                  className="block rounded-lg px-3 py-2 hover:bg-white/[0.05]"
                >
                  <span className="block text-sm">{p.title}</span>
                  <span className="site-muted block text-xs">{p.blurb}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
