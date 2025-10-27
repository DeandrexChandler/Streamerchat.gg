"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  color?: string;
}

export default function OverlayPage() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get settings from URL params
  const width = parseInt(searchParams.get("width") || "400");
  const height = parseInt(searchParams.get("height") || "600");
  const fontSize = parseInt(searchParams.get("fontSize") || "16");
  const fontFamily =
    searchParams.get("fontFamily") || "Inter, system-ui, sans-serif";
  const backgroundColor = searchParams.get("bg") || "rgba(0, 0, 0, 0.7)";
  const textColor = searchParams.get("color") || "#ffffff";
  const showTimestamps = searchParams.get("timestamps") !== "false";
  const showEmotes = searchParams.get("emotes") !== "false";
  const maxMessages = parseInt(searchParams.get("max") || "50");

  // Listen for messages from simulator via localStorage or BroadcastChannel
  useEffect(() => {
    // Use BroadcastChannel for cross-tab communication
    const channel = new BroadcastChannel("streamerchatai_overlay");

    channel.onmessage = (event) => {
      if (event.data.type === "chat_message") {
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          username: event.data.username,
          message: event.data.message,
          timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
          color: event.data.color,
        };

        setMessages((prev) => {
          const updated = [...prev, newMessage];
          return updated.slice(-maxMessages); // Keep only last N messages
        });
      }
    };

    // Cleanup
    return () => {
      channel.close();
    };
  }, [maxMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className="chat-overlay"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor,
        fontFamily,
        fontSize: `${fontSize}px`,
        color: textColor,
        overflowY: "auto",
        padding: "1rem",
        scrollbarWidth: "thin",
      }}
    >
      {messages.length === 0 ? (
        <div style={{ opacity: 0.5, textAlign: "center", marginTop: "2rem" }}>
          Waiting for chat messages...
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="chat-message"
              style={{
                marginBottom: "0.75rem",
                animation: "slideIn 0.3s ease-out",
              }}
            >
              {showTimestamps && (
                <span
                  className="timestamp"
                  style={{
                    fontSize: "0.75em",
                    opacity: 0.6,
                    marginRight: "0.5rem",
                  }}
                >
                  {msg.timestamp}
                </span>
              )}
              <span
                className="username"
                style={{
                  fontWeight: 600,
                  marginRight: "0.5rem",
                  color: msg.color || textColor,
                }}
              >
                {msg.username}:
              </span>
              <span className="message">
                {showEmotes
                  ? msg.message
                  : msg.message.replace(/[^\w\s]/gi, "")}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <style jsx>{`
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

        .chat-overlay::-webkit-scrollbar {
          width: 6px;
        }

        .chat-overlay::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }

        .chat-overlay::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
