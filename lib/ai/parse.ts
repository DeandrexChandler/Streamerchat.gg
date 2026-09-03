import { ReactionSchema, type Reaction } from "./reaction";

/**
 * Pulls reactions out of whatever the model actually returned.
 *
 * Three shapes are accepted, because models emit all three and rejecting two
 * of them was a silent total loss:
 *
 *   [{"text":"hi"}]        the requested shape
 *   ["hi","hey"]           a bare string array, which short prompts often get
 *                          back because the object wrapper feels like overkill
 *   {"reactions":[...]}    a wrapper the model added unprompted
 *
 * Only the first was handled, so asking chat to react to "hi" could return a
 * perfectly good batch and score zero.
 *
 * A truncated array is salvaged element by element rather than discarded:
 * eleven usable reactions out of twelve beats none, and truncation is real
 * when a model spends output tokens thinking.
 */
export function parseReactions(text: string): Reaction[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const direct = coerce(tryJson(trimmed));
  if (direct.length > 0) return direct;

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const span = coerce(tryJson(trimmed.slice(start, end + 1)));
    if (span.length > 0) return span;
  }

  // Salvage from a truncated array: complete objects first, then bare strings.
  const salvaged: Reaction[] = [];
  for (const match of trimmed.matchAll(/\{[^{}]*\}/g)) {
    salvaged.push(...coerce([tryJson(match[0])]));
  }
  if (salvaged.length > 0) return salvaged;

  /**
   * Bare-string salvage, and only when the payload is not objects.
   *
   * A truncated object array contains `"text"` as a *key*, and scanning it for
   * quoted strings harvests field names as though they were chat messages.
   */
  if (start !== -1 && !trimmed.includes("{")) {
    for (const match of trimmed.slice(start).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      salvaged.push(...coerce([tryJson(`"${match[1]}"`)]));
    }
  }
  return salvaged;
}

/** Normalises any accepted shape into validated reactions. */
function coerce(value: unknown): Reaction[] {
  if (value === null || value === undefined) return [];

  // A wrapper object the model added of its own accord.
  if (!Array.isArray(value) && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["reactions", "messages", "chat", "lines", "items"]) {
      if (Array.isArray(record[key])) return coerce(record[key]);
    }
    // A single reaction object rather than an array of one.
    const single = ReactionSchema.safeParse(value);
    return single.success ? [single.data] : [];
  }

  const list = Array.isArray(value) ? value : [value];
  const out: Reaction[] = [];
  for (const entry of list) {
    // A bare string is a reaction with no metadata, which is fine — the emote
    // selector falls back to the topic's own mood when emotion is absent.
    const candidate = typeof entry === "string" ? { text: entry } : entry;
    const parsed = ReactionSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}



