"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { type ChatMessage } from "@/lib/chat-generator";
import { type Emote } from "@/lib/emotes";
import Image from "next/image";

interface ChatFeedProps {
  messages: ChatMessage[];
  emotes: Emote[];
  showTimestamps: boolean;
  isPaused: boolean;
  autoScroll: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
}

export function ChatFeed({
  messages,
  emotes,
  showTimestamps,
  isPaused,
  autoScroll,
  onAutoScrollChange,
}: ChatFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Check if user is near bottom
  const handleScroll = () => {
    if (!feedRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const isNear = scrollHeight - scrollTop - clientHeight < 100;
    setIsNearBottom(isNear);

    // Disable auto-scroll if user scrolls up
    if (!isNear && autoScroll) {
      onAutoScrollChange(false);
    }
  };

  const jumpToLive = () => {
    onAutoScrollChange(true);
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const renderMessage = (message: ChatMessage) => {
    const words = message.message.split(" ");
    const elements: React.ReactElement[] = [];

    words.forEach((word, index) => {
      const emote = emotes.find((e) => e.name === word);

      if (emote) {
        elements.push(
          <Image
            key={`${message.id}-emote-${index}`}
            src={emote.url}
            alt={emote.name}
            width={28}
            height={28}
            className="inline-block align-middle mx-0.5"
            unoptimized
          />
        );
      } else {
        elements.push(<span key={`${message.id}-text-${index}`}>{word} </span>);
      }
    });

    return elements;
  };

  return (
    <div className="relative flex-1 flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Connection Status Indicator */}
          {isPaused ? (
            <div className="flex items-center space-x-2 text-gray-500">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-sm font-medium">⏸ PAUSED</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium">✅ CONNECTED</span>
            </div>
          )}
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {messages.length} messages
        </div>
      </div>

      {/* Chat Feed */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        <div className="p-2 space-y-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className="py-1 px-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded transition text-sm"
            >
              {showTimestamps && (
                <span className="text-gray-500 dark:text-gray-500 text-xs mr-2">
                  {formatTime(message.timestamp)}
                </span>
              )}
              <span
                className="font-semibold mr-1"
                style={{ color: message.color }}
              >
                {message.username}:
              </span>
              <span className="text-gray-900 dark:text-gray-100">
                {renderMessage(message)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Jump to Live Button */}
      {!autoScroll && !isNearBottom && (
        <button
          onClick={jumpToLive}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg flex items-center space-x-2 transition transform hover:scale-105"
        >
          <span className="text-sm font-medium">Jump to Live</span>
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
