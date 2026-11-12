// TODO: replace with real simulator.
//
// Everything this placeholder needs lives in this file. The site depends only
// on its outer size (`size`), so the real thing can drop in behind the same
// props. It deliberately shows no words: the model writes every line chat
// says, so the site never puts invented chat text in a viewer's mouth.

/** Muted name colours, chat only. Indexes into --name-1..6 in site.css. */
const NAMES = 6;

type Row = { name: number; nameWidth: number; msgs: number[]; emote: boolean; sub: boolean };

/** A fixed-seed generator, so server and client render the same rows. */
function rows(count: number, seed: number): Row[] {
  let s = seed;
  const next = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: count }, (_, i) => ({
    name: Math.floor(next() * NAMES) + 1,
    nameWidth: 44 + Math.floor(next() * 50),
    msgs: Array.from({ length: next() < 0.3 ? 2 : 1 }, () => 40 + Math.floor(next() * 140)),
    emote: next() < 0.28,
    sub: i % 9 === 5,
  }));
}

const ROWS = rows(20, 7);

export function ChatSimulator({ size = "lg" }: { size?: "lg" | "sm" }) {
  const list = (key: string) => (
    <ul className="site-chat-rows" key={key}>
      {ROWS.map((row, i) => (
        <li key={i} className={row.sub ? "is-sub" : undefined}>
          <span
            className="site-chat-name"
            style={{ width: row.nameWidth, background: `var(--name-${row.name})` }}
          />
          {row.msgs.map((w, j) => (
            <span key={j} className="site-chat-msg" style={{ width: w }} />
          ))}
          {row.emote && <span className="site-chat-emote" />}
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className={`site-chat site-chat-${size}`}
      role="img"
      aria-label="Preview of a live chat filling up"
      aria-live="off"
    >
      <div className="site-chat-head">
        <span className="flex items-center gap-2">
          <span className="site-live-dot site-live-dot-pulse" />
          LIVE CHAT
        </span>
        <span className="site-muted">142 watching</span>
      </div>
      <div className="site-chat-feed">
        {/* Rendered twice so the upward loop has no seam. */}
        <div className="site-chat-track" aria-hidden>
          {list("a")}
          {list("b")}
        </div>
      </div>
      <div className="site-chat-foot">
        <span className="site-chat-input">Send a message…</span>
        <span className="site-mono site-muted">[ simulator preview ]</span>
      </div>
    </div>
  );
}
