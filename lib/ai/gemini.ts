import { buildPrompt } from "./prompt";
import type {
  CandidateProvider,
  CandidateRequest,
  GenerateOptions,
  GenerationResult,
  ProviderStatus,
} from "./provider";
import type { Reaction } from "./reaction";
import { ReactionStream } from "./parse";
import { GAME_EVENTS, type GameEvent } from "./moment";

/**
 * Gemini implementation of the candidate provider.
 *
 * Chosen over Flash-Lite because the failure this project is most exposed to
 * is output that reads as a corporate mascot, and over the 3.x Flash models
 * because they cost five to twenty times as much to write six-word chat lines
 * and skew more polite, which is the wrong direction for this register.
 *
 * Every failure path resolves to `[]`. An AI outage must degrade variety, not
 * stop chat — so nothing here throws, and the caller cannot be made to care
 * whether the model answered.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

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

/**
 * Chosen by measuring, not by headline rates.
 *
 * The 2.5 family is closed to new API keys — both `gemini-2.5-flash` and
 * `gemini-2.5-flash-lite` return 404 "no longer available to new users", even
 * though the public pricing page still lists them. `ListModels` reports them
 * too, so the only way to know is to make a real call.
 *
 * Among what is actually reachable, measured against this app's real prompt
 * (~428 input tokens, six runs each):
 *
 *   3.5-flash-lite   428 in /  80 out / 0 thinking    $0.000329 per call
 *   3.1-flash-lite   428 in / 221 out / 121 thinking  $0.000438 per call
 *   3.6-flash        429 in /  93 out / 0-421 varies  $0.000670 per call
 *
 * 3.1-flash-lite has the cheaper published rates ($0.25/$1.50 against
 * $0.30/$2.50) and is still a third more expensive, because it spends
 * reasoning tokens on every call and those bill at the output rate. Writing
 * six-word chat messages does not need deliberation.
 *
 * 3.6-flash is the quality option, and its thinking is *variable* — measured
 * at both 0 and 421 tokens for identical requests — so its cost is far less
 * predictable. 3.5-flash-lite returned zero thinking tokens on every run.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

export function createGeminiProvider(options: GeminiOptions): CandidateProvider {
  const model = options.model || DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    name: `gemini:${model}`,

    async generate(request: CandidateRequest, generateOptions?: GenerateOptions): Promise<GenerationResult> {
      const controller = new AbortController();
      let deadline = setTimeout(() => controller.abort("no first line"), FIRST_LINE_MS);
      const backstop = setTimeout(() => controller.abort("too long"), TOTAL_MS);
      generateOptions?.signal?.addEventListener("abort", () => controller.abort("caller gone"));
      const stream = new ReactionStream();
      const reactions: Reaction[] = [];
      let event: GameEvent | undefined;

      /** Lines out as soon as they close; each one buys the stream more time. */
      const hand = (lines: Reaction[]) => {
        if (lines.length === 0) return;
        clearTimeout(deadline);
        deadline = setTimeout(() => controller.abort("stalled"), STALL_MS);
        event ??= parseEvent(stream.raw);
        reactions.push(...lines);
        generateOptions?.onLines?.(lines, event);
      };

      try {
        const response = await doFetch(
          `${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              // Header rather than a query parameter: a key in the URL ends up
              // in logs, proxies and error messages.
              "x-goog-api-key": options.apiKey,
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: request.frame
                    ? [
                        { text: buildPrompt(request) },
                        { inlineData: { mimeType: "image/jpeg", data: request.frame } },
                      ]
                    : [{ text: buildPrompt(request) }],
                },
              ],
              generationConfig: {
                // High temperature on purpose. The deterministic tiers already
                // cover the predictable reactions; this tier exists for the
                // phrasings a lookup table would never contain.
                temperature: 1.1,
                topP: 0.95,
                /**
                 * Generous because reasoning is billed and counted as output.
                 * At 400 the model spent 381 tokens thinking and emitted 15,
                 * truncating the JSON mid-string. Twelve short chat lines need
                 * well under 200; the headroom exists so a verbose run degrades
                 * to a smaller batch rather than to salvaged fragments.
                 */
                maxOutputTokens: options.maxOutputTokens ?? 2000,
                /**
                 * Writing six-word chat messages needs no deliberation, and
                 * thinking tokens are billed at the output rate — 515 of them
                 * against 78 real tokens in one measured call. LOW removes them
                 * entirely (`thoughtsTokenCount` disappears from the response).
                 */
                thinkingConfig: { thinkingLevel: "LOW" },
                responseMimeType: "application/json",
              },
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const status = statusFor(response.status);
          console.warn(
            `[ai] ${model} HTTP ${response.status} (${status}): ${detail.slice(0, 300)}`,
          );
          return { reactions: [], status, detail: detail.slice(0, 300) };
        }

        const usage = { input: 0, output: 0 };
        let finish = "none";
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Server-sent events: one JSON response per "data:" line.
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;
            const chunk = JSON.parse(line.slice(5)) as {
              candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
                finishReason?: string;
              }>;
              usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
            };
            const candidate = chunk.candidates?.[0];
            finish = candidate?.finishReason ?? finish;
            usage.input = chunk.usageMetadata?.promptTokenCount ?? usage.input;
            usage.output = chunk.usageMetadata?.candidatesTokenCount ?? usage.output;
            hand(stream.push((candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("")));
          }
        }
        // Whatever shape the model chose, the whole reply gets one last read.
        hand(stream.finish());

        if (reactions.length > 0) return { reactions, status: "ok", event, usage };
        if (!stream.raw.trim()) {
          // A 2xx with no text: usually a safety block or a finishReason that
          // stopped before any content was produced.
          console.warn(`[ai] ${model} returned no text (finishReason ${finish})`);
          return { reactions: [], status: "empty", detail: `finishReason ${finish}` };
        }
        console.warn(`[ai] ${model} output could not be parsed: ${stream.raw.slice(0, 200)}`);
        return { reactions: [], status: "bad-response", detail: stream.raw.slice(0, 200) };
      } catch (error) {
        // A hang or a stall after some lines landed is not a failed batch:
        // what arrived is chat, and the route must not ask again for it.
        if (reactions.length > 0) return { reactions, status: "ok", event };
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
    },
  };
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
  return (GAME_EVENTS as readonly string[]).includes(found ?? "")
    ? (found as GameEvent)
    : undefined;
}

/**
 * Maps an HTTP status onto something the streamer can act on.
 *
 * 404 is separated out because Google retires models and returns 404 with a
 * "no longer available to new users" message — which reads as a broken app
 * unless it is named for what it is.
 */
function statusFor(httpStatus: number): ProviderStatus {
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  if (httpStatus === 404) return "model-missing";
  if (httpStatus === 429) return "quota";
  if (httpStatus >= 500) return "network";
  return "bad-response";
}
