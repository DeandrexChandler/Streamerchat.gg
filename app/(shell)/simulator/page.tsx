"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Maximize2, Minimize2, X } from "lucide-react";

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  color: string;
  timestamp: Date;
}

export default function DashboardSimulatorPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [idealMode, setIdealMode] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected" | "paused"
  >("paused");
  // TODO: Implement custom usernames in dashboard settings
  const [customUsernames, setCustomUsernames] = useState<string[]>([]);
  const [micPermission, setMicPermission] = useState<
    "granted" | "denied" | "prompt"
  >("prompt");
  const [isMicActive, setIsMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [micDeviceName, setMicDeviceName] = useState<string>("");
  const [transcribedText, setTranscribedText] = useState<string>("");
  const [volumeThreshold, setVolumeThreshold] = useState(15); // Default threshold
  const [idealModeActive, setIdealModeActive] = useState(false); // Whether ideal mode is currently generating messages

  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const volumeSamplesRef = useRef<number[]>([]);
  const isRecordingRef = useRef<boolean>(false);
  const volumeThresholdRef = useRef<number>(15); // Ref for threshold to avoid stale closure
  const stopRecordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearTranscriptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const isMicActiveRef = useRef<boolean>(false);
  const transcribedTextRef = useRef<string>("");
  const lastSpeechTimeRef = useRef<number>(Date.now()); // Track when speech was last detected

  // Gaming-related username generation
  const gamingAdjectives = [
    "Epic",
    "Legendary",
    "Shadow",
    "Silent",
    "Toxic",
    "Pro",
    "Cyber",
    "Dark",
    "Mystic",
    "Swift",
    "Elite",
    "Rogue",
    "Fierce",
    "Tactical",
    "Stealth",
    "Immortal",
    "Divine",
    "Savage",
    "Mighty",
    "Phantom",
    "Alpha",
    "Beta",
    "Omega",
    "Quantum",
    "Neon",
    "Frost",
    "Blaze",
    "Storm",
    "Venom",
    "Apex",
    "its",
    "Noob",
    "Clutch",
    "Dank",
    "Wicked",
    "Radical",
    "Boss",
    "Viral",
    "Hype",
    "Sick",
    "Lit",
    "Fire",
    "Glitch",
    "Pixel",
    "Rocket",
    "Sniper",
    "Racer",
    "Brawler",
    "Crusher",
    "Dominator",
    "Enigma",
    "Juggernaut",
  ];

  const gamingNouns = [
    "Gamer",
    "Slayer",
    "Hunter",
    "Warrior",
    "Ninja",
    "Sniper",
    "Raider",
    "Knight",
    "Reaper",
    "Dragon",
    "Wolf",
    "Tiger",
    "Hawk",
    "Phoenix",
    "Viper",
    "Demon",
    "Angel",
    "King",
    "Queen",
    "Ghost",
    "Samurai",
    "Assassin",
    "Wizard",
    "Mage",
    "Beast",
    "Champion",
    "Legend",
    "Hero",
    "Titan",
    "God",
    "Rogue",
    "Ranger",
    "Paladin",
    "Berserker",
    "Gladiator",
    "Sentinel",
    "Warlord",
    "Overlord",
    "Conqueror",
    "Destroyer",
    "Mercenary",
    "Outlaw",
    "Vanguard",
    "Enforcer",
    "Sharpshooter",
    "Blademaster",
    "Stormbringer",
    "Shadowfax",
    "Ironclad",
    "Nightstalker",
    "Frostbite",
  ];

  const generateRandomUsername = () => {
    // If custom usernames exist, randomly use them 30% of the time
    if (customUsernames.length > 0 && Math.random() < 0.3) {
      return customUsernames[
        Math.floor(Math.random() * customUsernames.length)
      ];
    }

    // 10% chance for random letter combination (like "dsjsk" or "qqjn")
    if (Math.random() < 0.1) {
      const length = Math.floor(Math.random() * 3) + 4; // 4-6 characters
      const letters = "abcdefghijklmnopqrstuvwxyz";
      let randomName = "";
      for (let i = 0; i < length; i++) {
        randomName += letters[Math.floor(Math.random() * letters.length)];
      }
      return randomName;
    }

    // 20% chance for single word (adjective or noun) with optional number
    if (Math.random() < 0.2) {
      const useAdjective = Math.random() < 0.5;
      const word = useAdjective
        ? gamingAdjectives[Math.floor(Math.random() * gamingAdjectives.length)]
        : gamingNouns[Math.floor(Math.random() * gamingNouns.length)];

      // 50% chance to add a number
      if (Math.random() < 0.5) {
        const number = Math.floor(Math.random() * 1000);
        return `${word}${number}`;
      }
      return word;
    }

    const adjective =
      gamingAdjectives[Math.floor(Math.random() * gamingAdjectives.length)];
    const noun = gamingNouns[Math.floor(Math.random() * gamingNouns.length)];
    const number = Math.floor(Math.random() * 1000);

    // Randomly choose format: "AdjectiveNoun", "AdjectiveNoun123", or "Adjective_Noun123"
    const format = Math.random();
    if (format < 0.33) {
      return `${adjective}${noun}`;
    } else if (format < 0.66) {
      return `${adjective}${noun}${number}`;
    } else {
      return `${adjective}_${noun}${number}`;
    }
  };

  const generateRandomColor = () => {
    // Twitch's username color palette - vibrant and highly readable on dark backgrounds
    const colors = [
      "#FF0000", // Red
      "#3333FF", // Blue
      "#00FF00", // Green (Lime)
      "#B22222", // FireBrick
      "#FF7F50", // Coral
      "#9ACD32", // YellowGreen
      "#FF4500", // OrangeRed
      "#2E8B57", // SeaGreen
      "#DAA520", // GoldenRod
      "#D2691E", // Chocolate
      "#5F9EA0", // CadetBlue
      "#1E90FF", // DodgerBlue
      "#FF69B4", // HotPink
      "#8A2BE2", // BlueViolet
      "#00FF7F", // SpringGreen
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Request microphone access
  const requestMicrophoneAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      setMicPermission("granted");
      setIsMicActive(true);

      // Get microphone device name
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        setMicDeviceName(audioTrack.label || "Unknown Microphone");
      }

      // Set up audio analysis for volume visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.smoothingTimeConstant = 0.4; // Lower = more responsive/jumpy
      analyser.fftSize = 256;

      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Set up MediaRecorder for transcription
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        audioChunksRef.current = [];

        // Calculate both average and peak volume from all samples collected during recording
        const samples = volumeSamplesRef.current;
        const averageVolume =
          samples.length > 0
            ? samples.reduce((sum, vol) => sum + vol, 0) / samples.length
            : 0;
        const peakVolume = samples.length > 0 ? Math.max(...samples) : 0;

        console.log(
          `Recording stopped - Avg: ${averageVolume.toFixed(
            1
          )}%, Peak: ${peakVolume.toFixed(1)}%, Samples: ${samples.length}`
        );

        // Skip if no meaningful audio was recorded
        if (samples.length === 0 || audioBlob.size === 0) {
          console.log(`No audio data, skipping transcription`);
          setTranscribedText("");
          return;
        }

        console.log(`Sending to transcription API...`);

        // Send to transcription API
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          const result = await response.json();
          if (result.success && result.text) {
            const transcribedText = result.text.trim();

            // Filter out common false positives from Whisper when there's silence/background noise
            const falsePositives = [
              "thanks",
              "thanks.",
              "thank you",
              "thank you.",
              ".",
              "..",
              "...",
              "you",
              "you.",
              "bye",
              "bye.",
              "okay",
              "okay.",
              "uh",
              "ah",
              "hmm",
            ];

            // Check if it's a false positive (case insensitive, only punctuation, very short, or contains URLs)
            const containsURL = /www\.|http|\.com|\.co\.|\.org|\.net/i.test(
              transcribedText
            );
            const isFalsePositive =
              falsePositives.includes(transcribedText.toLowerCase()) ||
              containsURL ||
              /^[.,!?\s]+$/.test(transcribedText) || // Only punctuation/whitespace
              transcribedText.length < 3; // Very short responses are likely noise

            if (isFalsePositive) {
              setTranscribedText("");
              console.log("Filtered false positive:", transcribedText);
            } else {
              setTranscribedText(transcribedText);
              lastSpeechTimeRef.current = Date.now(); // Update last speech time
              console.log("Transcribed:", transcribedText);
            }
          } else {
            setTranscribedText("");
          }
        } catch (error) {
          console.error("Transcription error:", error);
          setTranscribedText("");
        }
      };

      // Start monitoring volume
      monitorVolume();

      console.log("Microphone access granted");
      return true;
    } catch (error) {
      console.error("Microphone access denied:", error);
      setMicPermission("denied");
      setIsMicActive(false);
      return false;
    }
  };

  // Monitor microphone volume
  const monitorVolume = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const updateVolume = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      // Calculate average volume with increased sensitivity
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      // Amplify the signal by 2x for balanced sensitivity
      const amplified = average * 2;
      const normalizedVolume = Math.min(100, (amplified / 255) * 100);

      setMicVolume(normalizedVolume);

      // Store volume samples during recording
      if (isRecordingRef.current) {
        volumeSamplesRef.current.push(normalizedVolume);
      }

      // Dynamic recording control based on threshold
      if (
        isPlayingRef.current &&
        isMicActiveRef.current &&
        mediaRecorderRef.current
      ) {
        const currentThreshold = volumeThresholdRef.current;

        if (normalizedVolume >= currentThreshold) {
          // Volume above threshold

          // Clear any pending stop timeout
          if (stopRecordingTimeoutRef.current) {
            clearTimeout(stopRecordingTimeoutRef.current);
            stopRecordingTimeoutRef.current = null;
          }

          // Clear any pending transcription clear timeout
          if (clearTranscriptionTimeoutRef.current) {
            clearTimeout(clearTranscriptionTimeoutRef.current);
            clearTranscriptionTimeoutRef.current = null;
          }

          // Start recording if not already recording
          if (mediaRecorderRef.current.state === "inactive") {
            audioChunksRef.current = [];
            volumeSamplesRef.current = [];
            isRecordingRef.current = true;
            mediaRecorderRef.current.start();
            console.log(
              "🔴 Recording started - Volume:",
              normalizedVolume.toFixed(1),
              "Threshold:",
              currentThreshold
            );
          }
        } else if (
          normalizedVolume < currentThreshold &&
          mediaRecorderRef.current.state === "recording"
        ) {
          // Volume below threshold - schedule stop after 1.5 seconds
          if (!stopRecordingTimeoutRef.current) {
            stopRecordingTimeoutRef.current = setTimeout(() => {
              if (mediaRecorderRef.current?.state === "recording") {
                isRecordingRef.current = false;
                mediaRecorderRef.current.stop();
                console.log(
                  "⏹️ Recording stopped (volume below threshold for 1.5s)"
                );
              }
              stopRecordingTimeoutRef.current = null;
            }, 1500);
          }
        } else if (
          normalizedVolume < currentThreshold &&
          mediaRecorderRef.current.state === "inactive"
        ) {
          // Volume below threshold and not recording - schedule clear transcription after 3 seconds
          if (
            transcribedTextRef.current &&
            !clearTranscriptionTimeoutRef.current
          ) {
            clearTranscriptionTimeoutRef.current = setTimeout(() => {
              setTranscribedText("");
              console.log(
                "Cleared transcription (volume below threshold for 3s)"
              );
              clearTranscriptionTimeoutRef.current = null;
            }, 3000);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();
  };

  // Start recording
  const startRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "inactive"
    ) {
      audioChunksRef.current = [];
      volumeSamplesRef.current = []; // Reset volume samples
      isRecordingRef.current = true; // Start tracking volume
      mediaRecorderRef.current.start();
      console.log("🔴 Recording started");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      isRecordingRef.current = false; // Stop tracking volume
      mediaRecorderRef.current.stop();
      console.log("⏹️ Recording stopped");
    }
  };

  // Stop microphone
  const stopMicrophone = () => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsMicActive(false);
      setMicVolume(0);
      console.log("Microphone stopped");
    }
  };

  // Check microphone permission on mount
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        const result = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        setMicPermission(result.state as "granted" | "denied" | "prompt");

        result.addEventListener("change", () => {
          setMicPermission(result.state as "granted" | "denied" | "prompt");
        });
      } catch (error) {
        console.log("Permission API not supported, will prompt on use");
      }
    };

    checkMicPermission();

    // Cleanup: stop microphone when component unmounts
    return () => {
      stopMicrophone();
    };
  }, []);

  // Sync refs with state for use in closures
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    transcribedTextRef.current = transcribedText;
  }, [transcribedText]);

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

  // Update connection status based on isPlaying
  useEffect(() => {
    setConnectionStatus(isPlaying ? "connected" : "paused");
  }, [isPlaying]);

  // Note: Recording is now controlled dynamically by volume monitoring
  // See the updateVolume() function where recording starts/stops based on threshold

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Add system message when playing starts (only on first play)
  useEffect(() => {
    if (
      isPlaying &&
      connectionStatus === "connected" &&
      messages.length === 0
    ) {
      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        username: "SystemBot",
        text: "✅ Connected! Chat is live!",
        color: "#4ade80", // green-400
        timestamp: new Date(),
      };
      setMessages([systemMessage]);
    }
  }, [isPlaying, connectionStatus]);

  // Ideal mode quiet stream messages
  const quietStreamMessages = [
    "hello?",
    "did my stream freeze or...",
    "chat breathing?",
    "streamer loading…",
    "chat we good?",
    "streamer alive check?",
    "someone poke the streamer",
    "quiet stream but kinda peaceful",
    "anyone else confused or just me",
    "what happened?",
    "did we all fall asleep?",
    "streamer blink twice if alive",
    "muted",
    "is streamer held hostage rn?",
    "plot twist: streamer muted and forgot",
    "mutted",
    "what???",
    "my wifi or the streamer?",
    "is streamer there?",
    "is mic connected",
    "is streamer talking?",
    "chat, hydrate while we wait",
    "where did everyone go",
    "streamer in stealth mode",
    "okay but did OBS explode",
    "what is happening",
    "brain buffering…",
    "we chillin or frozen?",
    "streamer: …",
    "it's so quiet",
    "chat, blink check",
    "someone drop a sound pls",
    "why is it so quiet",
    "i respect the silence but i'm scared",
    "audio gone or streamer ascended?",
    "chat sleeping beauty mode",
    "did the streamer go AFK",
    "mic volume low",
    "stream turned into a screensaver",
    "hello test 1 2 3",
    "we vibing or dying idk",
    "AFK",
    "streamer banned sound?",
    'chat say "hi" if alive',
    "streamer unplugged headset again?",
    "mic disconnected??",
    "we entered quiet arc",
    "audio went on vacation",
    "okay but where is everyone",
    "confused",
    "yo?",
    "typing because silence scary",
    "????",
    "i'm staying even if nothing happens",
    "sound DLC when??",
    "chat whisper mode enabled",
    "chat holding hands in the quiet",
    "what did i walk into",
    "streamer spiritually AFK",
    "is this a silent stream now?",
    "streamer muted by choice?",
    "i js got here, why so quiet",
  ];

  // Ideal mode: Generate messages every 2-5 seconds, but only after 10 seconds of no speech
  useEffect(() => {
    if (idealMode && isPlaying) {
      // Check every second if we should activate ideal mode
      const checkInterval = setInterval(() => {
        const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current;
        const shouldActivate = timeSinceLastSpeech >= 10000; // 10 seconds

        if (shouldActivate !== idealModeActive) {
          setIdealModeActive(shouldActivate);
          if (shouldActivate) {
            console.log("Ideal mode activated (no speech for 10s)");
          } else {
            console.log("Ideal mode deactivated (speech detected)");
          }
        }
      }, 1000);

      return () => clearInterval(checkInterval);
    } else {
      setIdealModeActive(false);
    }
  }, [idealMode, isPlaying, idealModeActive]);

  // Generate ideal mode messages when active
  useEffect(() => {
    if (idealModeActive && isPlaying) {
      const generateMessage = () => {
        const randomMessage =
          quietStreamMessages[
            Math.floor(Math.random() * quietStreamMessages.length)
          ];
        const newMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random()}`,
          username: generateRandomUsername(),
          text: randomMessage,
          color: generateRandomColor(),
          timestamp: new Date(),
        };
        setMessages((prev) => {
          const updated = [...prev, newMessage];
          // Keep only the last 100 messages to reduce memory overhead
          return updated.length > 100 ? updated.slice(-100) : updated;
        });
      };

      // Generate first message after a short delay
      const firstTimeout = setTimeout(generateMessage, 1000);

      // Set up interval for subsequent messages (2-5 seconds)
      const scheduleNext = () => {
        const delay = Math.random() * 10000; // 0-5000ms
        return setTimeout(() => {
          generateMessage();
          intervalId = scheduleNext();
        }, delay);
      };

      let intervalId = scheduleNext();

      return () => {
        clearTimeout(firstTimeout);
        clearTimeout(intervalId);
      };
    }
  }, [idealModeActive, isPlaying]);

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
                <div className="inline-grid *:[grid-area:1/1]">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
                <span className="text-green-400">Connected</span>
              </>
            )}
            {connectionStatus === "disconnected" && (
              <>
                <div className="inline-grid *:[grid-area:1/1]">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
                <span className="text-red-400">Disconnected</span>
              </>
            )}
            {connectionStatus === "paused" && (
              <>
                <div className="inline-grid *:[grid-area:1/1]">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                </div>
                <span className="text-orange-400">Paused</span>
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
                  {/* Microphone Volume Visualizer */}
                  <div className="pb-3 border-b border-gray-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm">Microphone:</span>
                      <span
                        className={`text-sm ${
                          isMicActive
                            ? "text-green-400"
                            : micPermission === "denied"
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}
                      >
                        {isMicActive
                          ? "Active"
                          : micPermission === "denied"
                          ? "Denied"
                          : "Inactive"}
                      </span>
                    </div>

                    {/* Volume Bar */}
                    {isMicActive && (
                      <>
                        <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full ${
                              micVolume >= volumeThreshold
                                ? "bg-gradient-to-r from-green-500 to-green-400"
                                : "bg-gradient-to-r from-gray-500 to-gray-400"
                            }`}
                            style={{ width: `${micVolume}%` }}
                          />
                          {/* Threshold indicator line */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-purple-400"
                            style={{ left: `${volumeThreshold}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">
                            Volume: {micVolume.toFixed(0)}%
                          </span>
                          <span
                            className={`${
                              micVolume >= volumeThreshold
                                ? "text-green-400"
                                : "text-gray-500"
                            }`}
                          >
                            {micVolume >= volumeThreshold
                              ? "Above threshold"
                              : "Below threshold"}
                          </span>
                        </div>
                        {/* Microphone Device Name */}
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {micDeviceName}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Ideal Mode Toggle */}
                  <div className="flex items-center justify-between pb-3 border-b border-gray-700">
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

                  {/* Volume Threshold Slider */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-white text-sm">
                        Volume Threshold:
                      </label>
                      <span className="text-xs text-gray-400">
                        {volumeThreshold}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={volumeThreshold}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        setVolumeThreshold(newValue);
                        volumeThresholdRef.current = newValue; // Update ref immediately
                      }}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Only transcribe when volume exceeds this level
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat messages area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-2 flex flex-col"
      >
        {/* Instructions */}
        <div className="flex-1 flex items-start justify-center pt-16">
          <div className="text-center text-gray-400 text-sm max-w-xs space-y-3">
            <div className="text-lg">🎙️</div>
            <div className="space-y-1">
              <p className="font-semibold text-gray-300">Getting Started</p>
              <p>1. Connect your microphone</p>
              <p>2. Press play to begin</p>
              <p>3. Speak and watch messages appear</p>
            </div>
            <p className="text-xs text-gray-500">
              Enable Ideal Mode in settings for automatic chat simulation
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="mt-auto space-y-2">
          {messages.map((message) => (
            <div key={message.id} className="text-sm leading-relaxed">
              <span className="font-bold" style={{ color: message.color }}>
                {message.username}:
              </span>{" "}
              <span className="text-gray-200 break-words inline">
                {message.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chat input */}
      <div className="bg-[#1f1f23] border-t border-gray-700 p-3">
        {/* Transcribed text display */}
        {isPlaying && isMicActive && (
          <div className="mb-2 text-xs text-blue-400">
            Transcribed: {transcribedText.trim() || "[No speech detected]"}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Press Play and start speaking..."
            className="flex-1 bg-[#464649] text-white px-3 py-2 rounded text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled
          />
          <button
            onClick={async () => {
              if (!hasStarted) {
                // Request microphone access on first play
                const micGranted = await requestMicrophoneAccess();
                if (micGranted) {
                  setHasStarted(true);
                  setIsPlaying(true);
                } else {
                  alert(
                    "Microphone access is required to use the simulator. Please allow microphone access in your browser settings."
                  );
                }
              } else {
                if (!isPlaying) {
                  // Resuming - check if we still have mic access
                  if (!isMicActive) {
                    await requestMicrophoneAccess();
                  }
                } else {
                  // Pausing - keep mic active but stop processing
                }
                setIsPlaying(!isPlaying);
              }
            }}
            className={`${
              !hasStarted
                ? "bg-purple-500 hover:bg-purple-600 text-white border-2 border-purple-500"
                : isPlaying
                ? "bg-green-500 hover:bg-green-600 text-white border-2 border-green-500"
                : "bg-transparent border-2 border-orange-500 text-orange-500 hover:bg-orange-500/10"
            } px-4 py-2 text-sm rounded transition-colors min-w-[100px]`}
          >
            {!hasStarted ? (
              "Play"
            ) : isPlaying ? (
              <span className="flex items-center gap-1">
                Playing
                <span className="dot-wave inline-flex gap-0.5">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </span>
            ) : (
              "Paused"
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return <div className="fixed inset-0 z-50 bg-gray-900">{chatContent}</div>;
  }

  return <div className="flex h-full justify-center">{chatContent}</div>;
}
