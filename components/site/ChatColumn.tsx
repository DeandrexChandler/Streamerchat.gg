/**
 * The hero's stand-in for a recorded session: a chat column made of bars,
 * scrolling up forever. Deliberately wordless. The model writes every chat
 * line, so the site never shows one it didn't write.
 *
 * Rows are fixed (seeded below) so server and client render the same markup.
 * The list is rendered twice and slid up by half its height, which loops
 * without a seam. CSS only; reduced motion stops it.
 */

/** Twitch's default username colours, the palette chat already speaks in. */
const NAMES = ["#FF4500", "#1E90FF", "#2E8B57", "#FF69B4", "#DAA520", "#8A2BE2", "#D2691E", "#5F9EA0"];

type Row = { color: string; name: number; message: number[]; emote: boolean };

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const ROWS: Row[] = (() => {
  const next = seeded(11);
  return Array.from({ length: 22 }, () => {
    const emote = next() < 0.22;
    const long = next() < 0.3;
    return {
      color: NAMES[Math.floor(next() * NAMES.length)],
      name: 44 + Math.round(next() * 44),
      message: emote ? [] : long ? [150, 60 + Math.round(next() * 90)] : [50 + Math.round(next() * 130)],
      emote,
    };
  });
})();

function Rows() {
  return (
    <ul className="site-col-rows">
      {ROWS.map((row, i) => (
        <li key={i}>
          <span className="site-col-name" style={{ width: row.name, background: row.color }} />
          {row.emote && <span className="site-col-emote" />}
          {row.message.map((w, j) => (
            <span key={j} className="site-col-msg" style={{ width: w }} />
          ))}
        </li>
      ))}
    </ul>
  );
}

export function ChatColumn() {
  return (
    <div className="site-col" role="img" aria-label="A live chat column, filling up">
      <div className="site-col-head">
        <span className="site-col-live" />
        <span className="site-col-title" />
      </div>
      <div className="site-col-feed">
        <div className="site-col-track">
          <Rows />
          <Rows />
        </div>
      </div>
      <div className="site-col-input" />
    </div>
  );
}
