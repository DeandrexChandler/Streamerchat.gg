import Link from "next/link";
import { neighbours } from "@/lib/site/docs";

/** One docs page: the article, its "On this page" list, and prev/next. */
export function DocPage({
  slug,
  title,
  lede,
  toc,
  children,
}: {
  slug: string;
  title: string;
  lede: string;
  toc: { id: string; label: string }[];
  children: React.ReactNode;
}) {
  const { prev, next } = neighbours(slug);
  return (
    <div className="grid grid-cols-[minmax(0,720px)_180px] gap-14">
      <article className="site-prose">
        <h1 className="site-h1">{title}</h1>
        <p className="site-lede mt-5">{lede}</p>
        <div className="mt-4">{children}</div>
        <nav aria-label="More docs" className="mt-20 grid grid-cols-2 gap-4 border-t border-white/[0.09] pt-8">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="site-card site-card-lift p-5 !no-underline">
              <span className="site-mono site-muted block">← Previous</span>
              <span className="mt-1 block !text-[#f5f5f3]">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="site-card site-card-lift p-5 text-right !no-underline">
              <span className="site-mono site-muted block">Next →</span>
              <span className="mt-1 block !text-[#f5f5f3]">{next.title}</span>
            </Link>
          )}
        </nav>
      </article>
      {toc.length > 0 && (
        <aside className="site-toc">
          <div className="sticky top-24 flex flex-col gap-2.5">
            <span className="site-mono site-muted mb-1">On this page</span>
            {toc.map((t) => (
              <a key={t.id} href={`#${t.id}`}>
                {t.label}
              </a>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
