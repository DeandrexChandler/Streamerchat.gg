import type { GenerateOptions, GenerationResult, ProviderStatus, TokenUsage } from "./provider";
import type { Reaction } from "./reaction";
import { ReactionStream } from "./parse";
import { GAME_EVENTS, type GameEvent } from "./moment";

/**
 * A streamed reply, whoever writes it.
 *
 * Both providers answer with server-sent events that carry a piece of the
 * model's text each; only the shape of a piece differs. Everything that
 * matters for chat — releasing each line the moment it closes, telling a
 * hang from a slow reply, keeping what arrived when a stream breaks — lives
 * here once.
 *
 * Every failure path resolves to `[]`. An AI outage must degrade variety, not
 * stop chat — so nothing here throws, and the caller cannot be made to care
 * whether the model answered.
 */

/**
 * Deadlines for a streamed reply.
 *
 * Latency is bimodal: usually the first line is back in about a second, and
 * now and then the call hangs for 15–30s. A whole-batch timeout could not
 * tell the two apart until it was too late — 70 lines take about 8s on a
 * good call, so the cutoff had to be 12s, and a hang cost all twelve.
 * Streamed, a healthy reply shows itself almost at once: no line inside
 * FIRST_LINE_MS is a hang, and the route's retry goes out then. Once lines
 * flow, a gap of STALL_MS between them is the same hang starting late, and
 * what already arrived is kept.
 */
const FIRST_LINE_MS = 5_000;
const STALL_MS = 5_000;
/** Backstop for a reply that keeps trickling. */
const TOTAL_MS = 30_000;

/** One server-sent event, as the text it adds and anything else it says. */
export interface StreamPiece {
  text: string;
  finish?: string;
  usage?: TokenUsage;
}

export interface StreamedCall {
  /** For the log. */
  model: string;
  /** Makes the request. Must pass the signal on, or nothing can be cut off. */
  open: (signal: AbortSignal) => Promise<Response>;
  /** One event's JSON, as a piece. Null for events that carry nothing. */
  read: (event: unknown) => StreamPiece | null;
  options?: GenerateOptions;
}

export async function generateStreamed({ model, open, read, options }: StreamedCall): Promise<GenerationResult> {
  const controller = new AbortController();
  let deadline = setTimeout(() => controller.abort("no first line"), FIRST_LINE_MS);
  const backstop = setTimeout(() => controller.abort("too long"), TOTAL_MS);
  options?.signal?.addEventListener("abort", () => controller.abort("caller gone"));
  const stream = new ReactionStream();
  const reactions: Reaction[] = [];
  let event: GameEvent | undefined;
  let usage: TokenUsage | undefined;

  /** Lines out as soon as they close; each one buys the stream more time. */
  const hand = (lines: Reaction[]) => {
    if (lines.length === 0) return;
    clearTimeout(deadline);
    deadline = setTimeout(() => controller.abort("stalled"), STALL_MS);
    event ??= parseEvent(stream.raw);
    reactions.push(...lines);
    options?.onLines?.(lines, event);
  };

  try {
    const response = await open(controller.signal);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const status = statusFor(response.status);
      console.warn(`[ai] ${model} HTTP ${response.status} (${status}): ${detail.slice(0, 300)}`);
      return { reactions: [], status, detail: detail.slice(0, 300) };
    }

    let finish = "none";
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Server-sent events: one JSON payload per "data:" line.
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const piece = read(JSON.parse(data));
        if (!piece) continue;
        finish = piece.finish ?? finish;
        usage = piece.usage ?? usage;
        hand(stream.push(piece.text));
      }
    }
    // Whatever shape the model chose, the whole reply gets one last read.
    hand(stream.finish());

    if (reactions.length > 0) return { reactions, status: "ok", event, usage };
    if (!stream.raw.trim()) {
      // A 2xx with no text: usually a safety block or a finish reason that
      // stopped before any content was produced.
      console.warn(`[ai] ${model} returned no text (finish ${finish})`);
      return { reactions: [], status: "empty", detail: `finish ${finish}` };
    }
    console.warn(`[ai] ${model} output could not be parsed: ${stream.raw.slice(0, 200)}`);
    return { reactions: [], status: "bad-response", detail: stream.raw.slice(0, 200) };
  } catch (error) {
    // A hang or a stall after some lines landed is not a failed batch:
    // what arrived is chat, and the route must not ask again for it.
    if (reactions.length > 0) return { reactions, status: "ok", event, usage };
    // Timeout, DNS, connection reset. Logged with the reason, because a
    // silent empty batch looks identical to a refusal.
    const reason = controller.signal.aborted ? String(controller.signal.reason) : "";
    const detail = (reason || String(error)).slice(0, 200);
    console.warn(`[ai] ${model} request failed: ${detail}`);
    return { reactions: [], status: reason ? "timeout" : "network", detail };
  } finally {
    clearTimeout(deadline);
    clearTimeout(backstop);
  }
}

/**
 * The event label, when the model was shown a frame and returned one.
 *
 * Read off the raw JSON rather than through the reaction parser, which
 * salvages truncated payloads and would happily invent a label from a
 * fragment. An unrecognised or missing word is simply no label.
 */
function parseEvent(text: string): GameEvent | undefined {
  const found = /"event"\s*:\s*"([a-z-]+)"/i.exec(text)?.[1]?.toLowerCase();
  return (GAME_EVENTS as readonly string[]).includes(found ?? "") ? (found as GameEvent) : undefined;
}

/**
 * Maps an HTTP status onto something the log can name.
 *
 * 404 is separated out because providers retire models and return 404 with
 * a "no longer available" message — which reads as a broken app unless it is
 * named for what it is.
 */
function statusFor(httpStatus: number): ProviderStatus {
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  if (httpStatus === 404) return "model-missing";
  if (httpStatus === 429) return "quota";
  if (httpStatus >= 500) return "network";
  return "bad-response";
}
