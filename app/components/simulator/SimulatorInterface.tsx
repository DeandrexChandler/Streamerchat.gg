"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Pause, Play, Send } from "lucide-react";
import { ChatFeed } from "./ChatFeed";
import { MicInput } from "./MicInput";
import { SettingsPanel } from "./SettingsPanel";
import {
  type ChatMessage,
  generateMessages,
  generateBoredMessage,
} from "@/lib/chat-generator";
import { type Emote } from "@/lib/emotes";
import {
  loadSettings,
  saveSettings,
  type SimulationSettings,
} from "@/lib/settings";
import { toast } from "sonner";

interface SimulatorInterfaceProps {
  emotes: Emote[];
}

export function SimulatorInterface({ emotes }: SimulatorInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<SimulationSettings>(
    () => loadSettings().simulation
  );
  const [isPaused, setIsPaused] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micThreshold, setMicThreshold] = useState(settings.micThreshold);
  const [autoScroll, setAutoScroll] = useState(true);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [userMessage, setUserMessage] = useState("");

  const messageIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const boredModeTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastActivityRef = useRef<Date>(new Date());

  // Handle settings changes
  const handleSettingsChange = useCallback(
    (newSettings: Partial<SimulationSettings>) => {
      setSettings((prev) => {
        const updated = { ...prev, ...newSettings };
        const allSettings = loadSettings();
        allSettings.simulation = updated;
        saveSettings(allSettings);
        return updated;
      });
    },
    []
  );

  // Generate messages based on chat speed
  useEffect(() => {
    if (isPaused || !micActive) {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current);
      }
      return;
    }

    const interval = (1 / settings.chatSpeed) * 1000; // Convert to milliseconds

    messageIntervalRef.current = setInterval(() => {
      const newMessages = generateMessages({
        count: 1,
        emotes,
        useEmotes: settings.useEmotes,
        messageLength: settings.messageLength,
        profanityFilter: settings.profanityFilter,
        personality: settings.chatPersonality,
      });

      setMessages((prev) => [...prev, ...newMessages]);
      lastActivityRef.current = new Date();
    }, interval);

    return () => {
      if (messageIntervalRef.current) {
        clearInterval(messageIntervalRef.current);
      }
    };
  }, [
    isPaused,
    micActive,
    settings.chatSpeed,
    settings.useEmotes,
    settings.messageLength,
    settings.profanityFilter,
    settings.chatPersonality,
    emotes,
  ]);

  // Bored mode - generate messages when no activity
  useEffect(() => {
    if (!settings.boredModeEnabled || isPaused || !micActive) {
      if (boredModeTimerRef.current) {
        clearTimeout(boredModeTimerRef.current);
      }
      return;
    }

    const checkBoredom = () => {
      const now = new Date();
      const timeSinceActivity =
        (now.getTime() - lastActivityRef.current.getTime()) / 1000;

      if (timeSinceActivity >= settings.boredModeDelay) {
        const boredMsg = generateBoredMessage(emotes);
        setMessages((prev) => [...prev, boredMsg]);
        lastActivityRef.current = new Date();
      }

      boredModeTimerRef.current = setTimeout(checkBoredom, 1000);
    };

    boredModeTimerRef.current = setTimeout(checkBoredom, 1000);

    return () => {
      if (boredModeTimerRef.current) {
        clearTimeout(boredModeTimerRef.current);
      }
    };
  }, [
    settings.boredModeEnabled,
    settings.boredModeDelay,
    isPaused,
    micActive,
    emotes,
  ]);

  // Handle user message send
  const handleSendMessage = useCallback(() => {
    if (!userMessage.trim()) return;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      username: "You",
      color: "#9333ea", // Purple for user
      message: userMessage,
      timestamp: new Date(),
      emotes: [],
    };

    setMessages((prev) => [...prev, newMessage]);
    setUserMessage("");
    lastActivityRef.current = new Date();
    toast.success("Message sent to chat");
  }, [userMessage]);

  const togglePause = () => {
    setIsPaused(!isPaused);
    toast.info(isPaused ? "Simulation resumed" : "Simulation paused");
  };

  const toggleMic = () => {
    setMicActive(!micActive);
    toast.info(micActive ? "Microphone disabled" : "Microphone enabled");
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Stream Simulator
        </h1>
        <button
          onClick={togglePause}
          className={`px-6 py-2 rounded-lg font-medium transition flex items-center space-x-2 ${
            isPaused
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white"
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              <span>Pause</span>
            </>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Feed */}
        <div className="flex-1 flex flex-col">
          <ChatFeed
            messages={messages}
            emotes={emotes}
            showTimestamps={settings.timestampsEnabled}
            isPaused={isPaused}
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
          />

          {/* Send Message Input */}
          <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Send a message to the chat..."
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-900 dark:text-white"
              />
              <button
                onClick={handleSendMessage}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition flex items-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar - Mic Controls */}
        <div className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 p-6 overflow-y-auto">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Microphone Controls
          </h2>
          <MicInput
            isActive={micActive}
            onToggle={toggleMic}
            threshold={micThreshold}
            onThresholdChange={setMicThreshold}
          />
        </div>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onToggle={() => setSettingsPanelOpen(!settingsPanelOpen)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}
