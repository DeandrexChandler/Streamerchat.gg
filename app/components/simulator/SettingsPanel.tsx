"use client";

import { Settings, X } from "lucide-react";
import { type SimulationSettings } from "@/lib/settings";

interface SettingsPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  settings: SimulationSettings;
  onSettingsChange: (settings: Partial<SimulationSettings>) => void;
}

export function SettingsPanel({
  isOpen,
  onToggle,
  settings,
  onSettingsChange,
}: SettingsPanelProps) {
  const speedOptions = [
    { value: 0.5, label: "0.5x (Slow)" },
    { value: 1.0, label: "1.0x (Normal)" },
    { value: 1.5, label: "1.5x (Fast)" },
    { value: 2.0, label: "2.0x (Very Fast)" },
  ];

  return (
    <>
      {/* Settings Toggle Button */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed bottom-6 right-6 p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition z-40"
          aria-label="Open settings"
        >
          <Settings className="w-6 h-6" />
        </button>
      )}

      {/* Settings Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40" onClick={onToggle} />

          {/* Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white dark:bg-gray-900 shadow-2xl z-50 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Simulation Settings
                </h2>
                <button
                  onClick={onToggle}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {/* Chat Speed */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Chat Speed
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {speedOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() =>
                        onSettingsChange({ chatSpeed: option.value })
                      }
                      className={`px-4 py-2 rounded-lg border-2 transition ${
                        settings.chatSpeed === option.value
                          ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                          : "border-gray-200 dark:border-gray-700 hover:border-purple-400 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Messages per second: {settings.chatSpeed.toFixed(1)}
                </p>
              </div>

              {/* Message Length */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Message Length
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["short", "medium", "long"] as const).map((length) => (
                    <button
                      key={length}
                      onClick={() =>
                        onSettingsChange({ messageLength: length })
                      }
                      className={`px-4 py-2 rounded-lg border-2 transition capitalize ${
                        settings.messageLength === length
                          ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                          : "border-gray-200 dark:border-gray-700 hover:border-purple-400 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {length}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {settings.messageLength === "short" && "1-10 words"}
                  {settings.messageLength === "medium" && "10-15 words"}
                  {settings.messageLength === "long" && "15-20 words"}
                </p>
              </div>

              {/* Emotes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Enable Emotes
                  </label>
                  <button
                    onClick={() =>
                      onSettingsChange({ useEmotes: !settings.useEmotes })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      settings.useEmotes
                        ? "bg-purple-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        settings.useEmotes ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Include emotes in generated messages
                </p>
              </div>

              {/* Timestamps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Show Timestamps
                  </label>
                  <button
                    onClick={() =>
                      onSettingsChange({
                        timestampsEnabled: !settings.timestampsEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      settings.timestampsEnabled
                        ? "bg-purple-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        settings.timestampsEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Display [HH:MM:SS] before each message
                </p>
              </div>

              {/* Bored Mode */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Bored Mode
                  </label>
                  <button
                    onClick={() =>
                      onSettingsChange({
                        boredModeEnabled: !settings.boredModeEnabled,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      settings.boredModeEnabled
                        ? "bg-purple-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        settings.boredModeEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Generate idle chat when no speech detected (
                  {settings.boredModeDelay}s)
                </p>
              </div>

              {/* Profanity Filter */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Profanity Filter
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["off", "replace", "filter"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() =>
                        onSettingsChange({ profanityFilter: mode })
                      }
                      className={`px-4 py-2 rounded-lg border-2 transition capitalize ${
                        settings.profanityFilter === mode
                          ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                          : "border-gray-200 dark:border-gray-700 hover:border-purple-400 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {settings.profanityFilter === "off" && "No filtering applied"}
                  {settings.profanityFilter === "replace" &&
                    "Replace profanity with ***"}
                  {settings.profanityFilter === "filter" &&
                    "Remove messages with profanity"}
                </p>
              </div>

              {/* Color Scheme */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Color Scheme
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["twitch", "kick", "custom"] as const).map((scheme) => (
                    <button
                      key={scheme}
                      onClick={() => onSettingsChange({ colorScheme: scheme })}
                      className={`px-4 py-2 rounded-lg border-2 transition capitalize ${
                        settings.colorScheme === scheme
                          ? "border-purple-600 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                          : "border-gray-200 dark:border-gray-700 hover:border-purple-400 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {scheme}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
