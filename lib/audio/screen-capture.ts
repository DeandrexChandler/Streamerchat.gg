/**
 * The streamer's screen, as one small JPEG on demand plus a "something just
 * happened" signal.
 *
 * Lives beside the audio pipeline and follows the same rule: no React. The
 * video element, the canvas and the frame comparison all run outside the
 * render tree, because sampling a video at a few frames a second through
 * component state would re-render the chat with every sample.
 *
 * Two jobs, one capture:
 *
 *   grab()     a downscaled frame for the next AI batch
 *   changed()  how much the picture moved since last checked, 0..1
 *
 * The second is what lets a death in silence get a reaction. It is a
 * deliberately dumb measure — mean absolute difference over a tiny
 * greyscale thumbnail — because it only has to answer "did the screen
 * change a lot", and the model on the other end answers what actually
 * happened.
 */

/** Sent to the model. Small on purpose: cost scales with pixels. */
const FRAME_WIDTH = 384;
const FRAME_QUALITY = 0.6;

/** Compared against itself. Tiny, because this only measures motion. */
const THUMB = 32;

export class ScreenCapture {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frameCanvas: HTMLCanvasElement | null = null;
  private thumbCanvas: HTMLCanvasElement | null = null;
  private previous: Uint8ClampedArray | null = null;

  get active(): boolean {
    return this.stream !== null;
  }

  /**
   * Asks for a window or screen. Resolves false when the user declines,
   * which is not an error: capture is opt-in and chat runs without it.
   */
  async start(onEnded?: () => void): Promise<boolean> {
    if (this.stream) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 4 },
        audio: false,
      });
    } catch {
      return false;
    }

    // Stopping the share from the browser's own bar has to reach us, or the
    // engine keeps asking for frames that will never come.
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        this.stop();
        onEnded?.();
      });
    }

    const video = document.createElement("video");
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});
    this.video = video;

    this.frameCanvas = document.createElement("canvas");
    this.thumbCanvas = document.createElement("canvas");
    this.thumbCanvas.width = THUMB;
    this.thumbCanvas.height = THUMB;
    return true;
  }

  stop(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.video = null;
    this.frameCanvas = null;
    this.thumbCanvas = null;
    this.previous = null;
  }

  /** A base64 JPEG for the next batch, or null if the capture is not ready. */
  grab(): string | null {
    const video = this.video;
    const canvas = this.frameCanvas;
    if (!video || !canvas || !video.videoWidth) return null;

    const scale = FRAME_WIDTH / video.videoWidth;
    canvas.width = FRAME_WIDTH;
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Strip the data URL prefix: the API wants raw base64.
    return canvas.toDataURL("image/jpeg", FRAME_QUALITY).split(",")[1] ?? null;
  }

  /**
   * How much the screen moved since the last call, 0..1.
   *
   * Stateful by design — each call compares against the previous one — so
   * it must be polled on a steady cadence to mean anything. The first call
   * after starting returns 0, since there is nothing to compare against.
   */
  changed(): number {
    const video = this.video;
    const canvas = this.thumbCanvas;
    if (!video || !canvas || !video.videoWidth) return 0;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    context.drawImage(video, 0, 0, THUMB, THUMB);
    const pixels = context.getImageData(0, 0, THUMB, THUMB).data;

    const previous = this.previous;
    this.previous = new Uint8ClampedArray(pixels);
    if (!previous) return 0;

    let total = 0;
    // Every fourth byte is alpha and never varies; the other three are
    // averaged into one brightness figure per pixel.
    for (let i = 0; i < pixels.length; i += 4) {
      const now = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      const before = (previous[i] + previous[i + 1] + previous[i + 2]) / 3;
      total += Math.abs(now - before);
    }
    return total / (THUMB * THUMB * 255);
  }
}
