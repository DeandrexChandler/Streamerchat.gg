"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../../../components/DashboardLayout";
import {
  loadSettings,
  saveSettings,
  type SimulationSettings,
} from "@/lib/settings";
import {
  Zap,
  MessageSquare,
  Clock,
  Shield,
  Smile,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

export default function SimulationSettingsPage() {
  const [settings, setSettings] = useState<SimulationSettings | null>(null);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded.simulation);
  }, []);

  const handleUpdate = (key: keyof SimulationSettings, value: any) => {
    if (!settings) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    const allSettings = loadSettings();
    saveSettings({ ...allSettings, simulation: newSettings });

    toast.success("Settings saved");
  };

  if (!settings) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Chat Speed */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="text-purple-600 dark:text-purple-400" size={24} />
            <h2 className="text-2xl font-bold">Chat Speed</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Speed Multiplier</span>
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {settings.chatSpeed}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.5"
              value={settings.chatSpeed}
              onChange={(e) =>
                handleUpdate("chatSpeed", parseFloat(e.target.value))
              }
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>0.5x (Slow)</span>
              <span>1.0x (Normal)</span>
              <span>1.5x (Fast)</span>
              <span>2.0x (Very Fast)</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Controls how frequently messages appear in the chat. Higher values
              simulate busier streams.
            </p>
          </div>
        </div>

        {/* Message Length */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare
              className="text-pink-600 dark:text-pink-400"
              size={24}
            />
            <h2 className="text-2xl font-bold">Message Length</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {(["short", "medium", "long"] as const).map((length) => (
              <button
                key={length}
                onClick={() => handleUpdate("messageLength", length)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.messageLength === length
                    ? "border-pink-500 bg-pink-50 dark:bg-pink-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-pink-300"
                }`}
              >
                <div className="text-center">
                  <h3 className="font-semibold capitalize mb-2">{length}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {length === "short" && "1-5 words"}
                    {length === "medium" && "5-10 words"}
                    {length === "long" && "10-20 words"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Personality */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare
              className="text-purple-600 dark:text-purple-400"
              size={24}
            />
            <h2 className="text-2xl font-bold">Chat Personality</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {(
              [
                {
                  value: "normal",
                  label: "Normal",
                  description: "Standard chat messages",
                },
                {
                  value: "w-community",
                  label: "W Community",
                  description: "W/L culture focused",
                },
                {
                  value: "poggers-community",
                  label: "Poggers Community",
                  description: "Emote-heavy messages",
                },
              ] as const
            ).map((personality) => (
              <button
                key={personality.value}
                onClick={() =>
                  handleUpdate("chatPersonality", personality.value)
                }
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.chatPersonality === personality.value
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
                }`}
              >
                <div className="text-center">
                  <h3 className="font-semibold mb-2">{personality.label}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {personality.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Normal:</strong> Balanced mix of reactions and comments
              <br />
              <strong>W Community:</strong> W/L takes, BASED, GIGACHAD, ratio
              culture
              <br />
              <strong>Poggers Community:</strong> POGGERS, SADGE, KEKW,
              emote-centric
            </p>
          </div>
        </div>

        {/* Emotes */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Smile className="text-yellow-600 dark:text-yellow-400" size={24} />
            <h2 className="text-2xl font-bold">Emotes</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <h3 className="font-semibold">Enable Emotes</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Show emotes in chat messages for realistic Twitch-style chat
                </p>
              </div>
              <button
                onClick={() => handleUpdate("useEmotes", !settings.useEmotes)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  settings.useEmotes
                    ? "bg-yellow-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    settings.useEmotes ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <h3 className="font-semibold">Show Timestamps</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Display message timestamps in [HH:MM:SS] format
                </p>
              </div>
              <button
                onClick={() =>
                  handleUpdate("timestampsEnabled", !settings.timestampsEnabled)
                }
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  settings.timestampsEnabled
                    ? "bg-yellow-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    settings.timestampsEnabled
                      ? "translate-x-6"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Bored Mode */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="text-blue-600 dark:text-blue-400" size={24} />
            <h2 className="text-2xl font-bold">Bored Mode</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <h3 className="font-semibold">Enable Bored Mode</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Generate idle chat messages during periods of silence
                </p>
              </div>
              <button
                onClick={() =>
                  handleUpdate("boredModeEnabled", !settings.boredModeEnabled)
                }
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  settings.boredModeEnabled
                    ? "bg-blue-500"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    settings.boredModeEnabled
                      ? "translate-x-6"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {settings.boredModeEnabled && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Messages like "anyone here?" or "what did I miss?" will appear
                  after 10-15 seconds of silence, just like real viewers would
                  in a quiet stream.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Profanity Filter */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="text-green-600 dark:text-green-400" size={24} />
            <h2 className="text-2xl font-bold">Profanity Filter</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {(["off", "replace", "filter"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleUpdate("profanityFilter", mode)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.profanityFilter === mode
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-green-300"
                }`}
              >
                <div className="text-center">
                  <h3 className="font-semibold capitalize mb-2">{mode}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {mode === "off" && "No filtering"}
                    {mode === "replace" && "Censor with ***"}
                    {mode === "filter" && "Remove entirely"}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            Controls how inappropriate language is handled in generated
            messages.
          </p>
        </div>

        {/* Microphone */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Volume2 className="text-red-600 dark:text-red-400" size={24} />
            <h2 className="text-2xl font-bold">Microphone Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Mic Threshold</span>
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {settings.micThreshold}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.micThreshold}
                onChange={(e) =>
                  handleUpdate("micThreshold", parseInt(e.target.value))
                }
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Adjust the sensitivity for voice detection. Lower values are
                more sensitive.
              </p>
            </div>
          </div>
        </div>

        {/* Color Scheme */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Chat Color Scheme</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {(["twitch", "kick", "custom"] as const).map((scheme) => (
              <button
                key={scheme}
                onClick={() => handleUpdate("colorScheme", scheme)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  settings.colorScheme === scheme
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
                }`}
              >
                <div className="text-center">
                  <h3 className="font-semibold capitalize mb-2">{scheme}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {scheme === "twitch" && "Purple theme"}
                    {scheme === "kick" && "Green theme"}
                    {scheme === "custom" && "Your colors"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Save Confirmation */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 text-white text-center">
          <h3 className="text-xl font-bold mb-2">✓ Settings Auto-Saved</h3>
          <p className="opacity-90">
            All changes are automatically saved and will be applied to your next
            simulation session.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
