import Link from "next/link";

/** Pill link. Primary is the green action; ghost is the quiet one. */
export function Button({
  href,
  children,
  variant = "primary",
  small = false,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  small?: boolean;
}) {
  return (
    <Link href={href} className={`site-btn site-btn-${variant}${small ? " site-btn-sm" : ""}`}>
      {children}
      <span className="site-btn-arrow" aria-hidden>
        →
      </span>
    </Link>
  );
}

export function Tag({ children, dot = false }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <span className="site-tag">
      {dot && <span className="site-tag-dot" aria-hidden />}
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  lift = false,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: boolean;
}) {
  return <div className={`site-card${lift ? " site-card-lift" : ""} ${className}`}>{children}</div>;
}

export function FAQItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="site-faq">
      <summary>{q}</summary>
      <p>{children}</p>
    </details>
  );
}

export function Callout({
  kind = "note",
  children,
}: {
  kind?: "note" | "tip" | "warning";
  children: React.ReactNode;
}) {
  const label = { note: "Note", tip: "Tip", warning: "Warning" }[kind];
  return (
    <div className={`site-callout site-callout-${kind}`} role="note">
      <span className="site-callout-label">{label}</span>
      <p>{children}</p>
    </div>
  );
}
