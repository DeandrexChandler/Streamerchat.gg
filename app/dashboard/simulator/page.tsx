"use client";

import { useState, useEffect, useRef } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { Settings, Maximize2, Minimize2, X } from "lucide-react";

export default function DashboardSimulatorPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [idealMode, setIdealMode] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected" | "paused"
  >("connected");
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsOpen) {
          setSettingsOpen(false);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFullscreen, settingsOpen]);

  const chatContent = (
    <div
      className={`${
        isFullscreen ? "w-full" : "w-96"
      } h-full bg-[#18181b] border-gray-700 flex flex-col`}
    >
      {/* Chat header */}
      <div className="bg-[#1f1f23] border-b border-gray-700 p-3 flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">StreamerChatAi</h2>
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-2 text-xs">
            {connectionStatus === "connected" && (
              <>
                <span className="text-gray-300">Connected</span>
                <div className="inline-grid *:[grid-area:1/1]">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              </>
            )}
            {connectionStatus === "disconnected" && (
              <>
                <span className="text-gray-300">Disconnected</span>
                <div className="inline-grid *:[grid-area:1/1]">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
              </>
            )}
            {connectionStatus === "paused" && (
              <>
                <span className="text-gray-300">Paused</span>
                <div className="inline-grid *:[grid-area:1/1]">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                </div>
              </>
            )}
          </div>

          {/* Settings Button */}
          <div className="relative">
            <button
              ref={settingsButtonRef}
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Settings"
            >
              <Settings size={18} />
            </button>

            {/* Settings Dropdown */}
            {settingsOpen && (
              <div
                ref={settingsRef}
                className="absolute right-0 mt-2 w-64 bg-[#1f1f23] border border-gray-700 rounded-lg shadow-xl z-10"
              >
                <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">Settings</h3>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        setIsFullscreen(!isFullscreen);
                        setSettingsOpen(false);
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                      title={
                        isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"
                      }
                    >
                      {isFullscreen ? (
                        <Minimize2 size={14} />
                      ) : (
                        <Maximize2 size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => setSettingsOpen(false)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  {/* Ideal Mode Toggle */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="ideal-mode" className="text-white text-sm">
                      Ideal Mode:
                    </label>
                    <input
                      id="ideal-mode"
                      type="checkbox"
                      checked={idealMode}
                      onChange={(e) => setIdealMode(e.target.checked)}
                      className="toggle border-gray-600 bg-gray-500 checked:border-green-500 checked:bg-green-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Messages will go here */}
      </div>

      {/* Chat input */}
      <div className="bg-[#1f1f23] border-t border-gray-700 p-3 flex gap-2">
        <input
          type="text"
          placeholder="Send a message"
          className="flex-1 bg-[#464649] text-white px-3 py-2 rounded text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button className="bg-purple-500 text-white px-4 py-2 text-sm rounded">
          Send
        </button>
      </div>
    </div>
  );

  if (isFullscreen) {
    return <div className="fixed inset-0 z-50 bg-gray-900">{chatContent}</div>;
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100%+3rem)] flex justify-center -my-6">
        {chatContent}
      </div>
    </DashboardLayout>
  );
}
