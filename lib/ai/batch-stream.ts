import type { Reaction } from "./reaction";
import type { GameEvent } from "./moment";

/**
 * What the chat route sends the browser, one JSON object per line.
 *
 * Lines arrive in groups as the model writes them, and the last message says
 * how the batch ended. A refusal before anything was generated is a single
 * plain JSON body of the same shape, so a reader handles both.
 */

/** The only two things a client ever learns about how a batch went. */
export type BatchStatus = "ok" | "unavailable";

export interface BatchMessage {
  reactions?: Reaction[];
  /** What the model saw on screen, when it was given a frame. */
  event?: GameEvent;
  /** Present on the last message only. */
  status?: BatchStatus;
}

export const BATCH_CONTENT_TYPE = "application/x-ndjson";

/** Calls `onMessage` for each message as it arrives, plain JSON or streamed. */
export async function readBatch(
  response: Response,
  onMessage: (message: BatchMessage) => void,
): Promise<void> {
  if (!response.headers.get("content-type")?.includes(BATCH_CONTENT_TYPE) || !response.body) {
    onMessage((await response.json()) as BatchMessage);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onMessage(JSON.parse(line) as BatchMessage);
    }
  }
}
