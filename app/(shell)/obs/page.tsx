"use client";

import { useState } from "react";
import { Copy, Check, Monitor, Settings2, Download } from "lucide-react";
import { toast } from "sonner";

export default function OBSPage() {
  const [copied, setCopied] = useState(false);
  const [overlaySettings, setOverlaySettings] = useState({
    width: 400,
    height: 600,
    fontSize: 16,
    fontFamily: "Inter, system-ui, sans-serif",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    textColor: "#ffffff",
    showTimestamps: true,
    showEmotes: true,
    maxMessages: 50,
  });

  // Generate browser source URL
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const overlayUrl =
    `${baseUrl}/overlay?` +
    new URLSearchParams({
      width: overlaySettings.width.toString(),
      height: overlaySettings.height.toString(),
      fontSize: overlaySettings.fontSize.toString(),
      fontFamily: overlaySettings.fontFamily,
      bg: overlaySettings.backgroundColor,
      color: overlaySettings.textColor,
      timestamps: overlaySettings.showTimestamps.toString(),
      emotes: overlaySettings.showEmotes.toString(),
      max: overlaySettings.maxMessages.toString(),
    }).toString();

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    toast.success("Browser source URL copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCSS = () => {
    const css = `/* StreamerChat.gg Custom Overlay Styles */
.chat-overlay {
  width: ${overlaySettings.width}px;
  height: ${overlaySettings.height}px;
  background: ${overlaySettings.backgroundColor};
  font-family: ${overlaySettings.fontFamily};
  font-size: ${overlaySettings.fontSize}px;
  color: ${overlaySettings.textColor};
  overflow-y: auto;
  padding: 1rem;
}

.chat-message {
  margin-bottom: 0.75rem;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.username {
  font-weight: 600;
  margin-right: 0.5rem;
}

.timestamp {
  font-size: 0.75em;
  opacity: 0.6;
  margin-right: 0.5rem;
}

.emote {
  height: ${overlaySettings.fontSize * 1.5}px;
  vertical-align: middle;
  margin: 0 2px;
}`;

    const blob = new Blob([css], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "streamerchat-gg-overlay.css";
    a.click();
    toast.success("CSS file downloaded");
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">OBS Integration</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Set up your chat overlay for OBS Studio with a browser source
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Settings Panel */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Settings2 className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold">Overlay Settings</h2>
            </div>

            {/* Dimensions */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Width (px)
                </label>
                <input
                  type="number"
                  value={overlaySettings.width}
                  onChange={(e) =>
                    setOverlaySettings({
                      ...overlaySettings,
                      width: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  min="200"
                  max="1920"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Height (px)
                </label>
                <input
                  type="number"
                  value={overlaySettings.height}
                  onChange={(e) =>
                    setOverlaySettings({
                      ...overlaySettings,
                      height: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  min="200"
                  max="1080"
                />
              </div>
            </div>

            {/* Font Settings */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  value={overlaySettings.fontSize}
                  onChange={(e) =>
                    setOverlaySettings({
                      ...overlaySettings,
                      fontSize: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                  min="10"
                  max="32"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Font Family
                </label>
                <select
                  value={overlaySettings.fontFamily}
                  onChange={(e) =>
                    setOverlaySettings({
                      ...overlaySettings,
                      fontFamily: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                  <option value="Inter, system-ui, sans-serif">Inter</option>
                  <option value="'Roboto', sans-serif">Roboto</option>
                  <option value="'Arial', sans-serif">Arial</option>
                  <option value="'Courier New', monospace">Courier New</option>
                </select>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Background Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={overlaySettings.backgroundColor}
                    onChange={(e) =>
                      setOverlaySettings({
                        ...overlaySettings,
                        backgroundColor: e.target.value,
                      })
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-mono text-sm"
                    placeholder="rgba(0, 0, 0, 0.7)"
                  />
                  <input
                    type="color"
                    value="#000000"
                    onChange={(e) =>
                      setOverlaySettings({
                        ...overlaySettings,
                        backgroundColor: e.target.value,
                      })
                    }
                    className="w-12 h-10 rounded border border-gray-300 dark:border-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Text Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={overlaySettings.textColor}
                    onChange={(e) =>
                      setOverlaySettings({
                        ...overlaySettings,
                        textColor: e.target.value,
                      })
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-mono text-sm"
                    placeholder="#ffffff"
                  />
                  <input
                    type="color"
                    value={overlaySettings.textColor}
                    onChange={(e) =>
                      setOverlaySettings({
                        ...overlaySettings,
                        textColor: e.target.value,
                      })
                    }
                    className="w-12 h-10 rounded border border-gray-300 dark:border-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overlaySettings.showTimestamps}
                  onChange={(e) =>
                    setOverlaySettings({
                      ...overlaySettings,
                      showTimestamps: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Show Timestamps</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overlaySettings.showEmotes}
                  onChange={(e) =>
                    setOverlaySettings({
                      ...overlaySettings,
                      showEmotes: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Show Emotes</span>
              </label>
            </div>

            {/* Max Messages */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Max Messages
              </label>
              <input
                type="number"
                value={overlaySettings.maxMessages}
                onChange={(e) =>
                  setOverlaySettings({
                    ...overlaySettings,
                    maxMessages: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                min="10"
                max="100"
              />
            </div>
          </div>

          {/* Download CSS */}
          <button
            onClick={handleDownloadCSS}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <Download className="w-5 h-5" />
            Download Custom CSS
          </button>
        </div>

        {/* Preview & Setup */}
        <div className="space-y-6">
          {/* Preview */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold">Preview</h2>
            </div>

            <div
              className="rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600"
              style={{
                width: "100%",
                height: "400px",
                background: overlaySettings.backgroundColor,
                fontFamily: overlaySettings.fontFamily,
                fontSize: `${overlaySettings.fontSize}px`,
                color: overlaySettings.textColor,
                padding: "1rem",
                overflowY: "auto",
              }}
            >
              {/* Sample Messages */}
              <div className="space-y-3">
                {overlaySettings.showTimestamps && (
                  <span style={{ fontSize: "0.75em", opacity: 0.6 }}>
                    12:34:56
                  </span>
                )}{" "}
                <span style={{ fontWeight: 600 }}>StreamerBot:</span> Welcome to
                the stream!
              </div>
              <div className="space-y-3 mt-3">
                {overlaySettings.showTimestamps && (
                  <span style={{ fontSize: "0.75em", opacity: 0.6 }}>
                    12:35:12
                  </span>
                )}{" "}
                <span style={{ fontWeight: 600, color: "#9147ff" }}>
                  Viewer123:
                </span>{" "}
                Poggers {overlaySettings.showEmotes && <span>🎉</span>}
              </div>
              <div className="space-y-3 mt-3">
                {overlaySettings.showTimestamps && (
                  <span style={{ fontSize: "0.75em", opacity: 0.6 }}>
                    12:35:45
                  </span>
                )}{" "}
                <span style={{ fontWeight: 600, color: "#ff6b6b" }}>
                  ChatMaster:
                </span>{" "}
                This is awesome! {overlaySettings.showEmotes && <span>❤️</span>}
              </div>
            </div>
          </div>

          {/* Browser Source URL */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-3">Browser Source URL</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={overlayUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm overflow-x-auto"
              />
              <button
                onClick={handleCopyUrl}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Setup Instructions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold mb-3">Setup Instructions</h3>
            <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">1.</span>
                <span>Open OBS Studio and select your scene</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">2.</span>
                <span>
                  Click the <strong>+</strong> button in Sources and select{" "}
                  <strong>Browser</strong>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">3.</span>
                <span>Name it "StreamerChat.gg Overlay"</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">4.</span>
                <span>
                  Paste the browser source URL above into the{" "}
                  <strong>URL</strong> field
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">5.</span>
                <span>Set Width and Height to match your overlay settings</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">6.</span>
                <span>
                  Enable <strong>Shutdown source when not visible</strong> to
                  save resources
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-purple-600">7.</span>
                <span>
                  Click <strong>OK</strong> and position the overlay in your
                  scene
                </span>
              </li>
            </ol>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>💡 Pro Tip:</strong> Keep the simulator running in your
                browser while streaming. The overlay will automatically sync
                with your chat messages!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
