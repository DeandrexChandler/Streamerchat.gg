import type { TranscriptionProvider } from "./provider";
import { WebSpeechProvider } from "./web-speech";

export type { TranscriptionProvider, TranscriptionEvents } from "./provider";
export { WebSpeechProvider } from "./web-speech";

/**
 * The browser's speech recognition, or nothing.
 *
 * There used to be a fallback to a scripted transcript on unsupported
 * browsers. With chat generated from what the streamer says, a script is
 * not a demo — it is fake speech being sent to a paid model. On a browser
 * without recognition the microphone simply does not transcribe; typed
 * input still works, and the notice says which browsers do.
 */
export function createProvider(): TranscriptionProvider | null {
  const webSpeech = new WebSpeechProvider();
  return webSpeech.isSupported() ? webSpeech : null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return new WebSpeechProvider().isSupported();
}
