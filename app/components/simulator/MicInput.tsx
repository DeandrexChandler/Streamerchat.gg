"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";

interface MicInputProps {
  isActive: boolean;
  onToggle: () => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
}

export function MicInput({
  isActive,
  onToggle,
  threshold,
  onThresholdChange,
}: MicInputProps) {
  const [micLevel, setMicLevel] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Simulate mic meter animation when active
  useEffect(() => {
    if (!isActive) {
      setMicLevel(0);
      return;
    }

    const animate = () => {
      // Simulate realistic mic input levels
      const baseLevel = 20 + Math.random() * 30;
      const spike = Math.random() > 0.8 ? Math.random() * 30 : 0;
      setMicLevel(Math.min(100, baseLevel + spike));

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive]);

  const getMeterColor = () => {
    if (micLevel < 30) return "bg-green-500";
    if (micLevel < 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-4">
      {/* Mic Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onToggle}
            className={`p-3 rounded-full transition ${
              isActive
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
            }`}
          >
            {isActive ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}
          </button>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Microphone
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {isActive ? "Active" : "Inactive"}
            </div>
          </div>
        </div>
      </div>

      {/* Mic Level Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Mic Level
          </span>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {Math.round(micLevel)}%
          </span>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ${getMeterColor()}`}
            style={{ width: `${micLevel}%` }}
          />
        </div>

        {/* Threshold Indicator */}
        <div className="relative h-1">
          <div
            className="absolute w-0.5 h-4 bg-purple-500 -top-1.5"
            style={{ left: `${threshold}%` }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">
              Threshold
            </div>
          </div>
        </div>
      </div>

      {/* Threshold Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Mic Threshold
          </label>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {threshold}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
        />
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Sensitive</span>
          <span>Less Sensitive</span>
        </div>
      </div>

      {/* Status Info */}
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {isActive ? (
            <>
              {micLevel > threshold ? (
                <span className="text-green-600 dark:text-green-400">
                  ✓ Above threshold - generating messages
                </span>
              ) : (
                <span className="text-yellow-600 dark:text-yellow-400">
                  ⚠ Below threshold - waiting for input
                </span>
              )}
            </>
          ) : (
            <span>Enable microphone to start simulation</span>
          )}
        </div>
      </div>
    </div>
  );
}
