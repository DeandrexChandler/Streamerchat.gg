import { MockProvider } from "./mock";
import type { TranscriptionProvider } from "./provider";
import { WebSpeechProvider } from "./web-speech";

export type { TranscriptionProvider, TranscriptionEvents } from "./provider";
export { MockProvider, DEMO_SCRIPT } from "./mock";
export { WebSpeechProvider } from "./web-speech";

export type ProviderId = "web-speech" | "mock";

/**
 * Builds a provider, falling back to mock when the requested one can't run.
 *
 * Falling back rather than throwing is deliberate: a user on an unsupported
 * browser should still see the simulator work, with a clear notice, rather
 * than a dead page.
 */
export function createProvider(id: ProviderId): TranscriptionProvider {
  if (id === "mock") return new MockProvider();

  const webSpeech = new WebSpeechProvider();
  return webSpeech.isSupported() ? webSpeech : new MockProvider();
}

export function isSpeechRecognitionAvailable(): boolean {
  return new WebSpeechProvider().isSupported();
}
