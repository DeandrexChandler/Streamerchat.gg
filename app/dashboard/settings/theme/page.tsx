"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../../../components/DashboardLayout";
import { Sun, Moon, Monitor, Palette, Check } from "lucide-react";
import { toast } from "sonner";

type Theme = "light" | "dark" | "system";
type ColorScheme = "purple" | "blue" | "green" | "red" | "orange";

const colorSchemes = [
  {
    name: "Purple",
    value: "purple" as ColorScheme,
    colors: "from-purple-500 to-pink-500",
  },
  {
    name: "Blue",
    value: "blue" as ColorScheme,
    colors: "from-blue-500 to-cyan-500",
  },
  {
    name: "Green",
    value: "green" as ColorScheme,
    colors: "from-green-500 to-emerald-500",
  },
  {
    name: "Red",
    value: "red" as ColorScheme,
    colors: "from-red-500 to-orange-500",
  },
  {
    name: "Orange",
    value: "orange" as ColorScheme,
    colors: "from-orange-500 to-yellow-500",
  },
];

export default function ThemeSettingsPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [colorScheme, setColorScheme] = useState<ColorScheme>("purple");
  const [autoSwitch, setAutoSwitch] = useState(false);

  useEffect(() => {
    // Load saved theme settings
    const savedTheme = (localStorage.getItem("theme") as Theme) || "dark";
    const savedColorScheme =
      (localStorage.getItem("colorScheme") as ColorScheme) || "purple";
    const savedAutoSwitch = localStorage.getItem("autoSwitch") === "true";

    setTheme(savedTheme);
    setColorScheme(savedColorScheme);
    setAutoSwitch(savedAutoSwitch);
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    if (newTheme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    } else {
      document.documentElement.classList.toggle("dark", newTheme === "dark");
    }

    toast.success(`Theme changed to ${newTheme}`);
  };

  const handleColorSchemeChange = (newScheme: ColorScheme) => {
    setColorScheme(newScheme);
    localStorage.setItem("colorScheme", newScheme);
    toast.success(`Color scheme changed to ${newScheme}`);
  };

  const handleAutoSwitchToggle = () => {
    const newValue = !autoSwitch;
    setAutoSwitch(newValue);
    localStorage.setItem("autoSwitch", String(newValue));
    toast.success(`Auto-switch ${newValue ? "enabled" : "disabled"}`);
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Theme Mode */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Theme Mode</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <button
              onClick={() => handleThemeChange("light")}
              className={`p-6 rounded-xl border-2 transition-all ${
                theme === "light"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    theme === "light"
                      ? "bg-purple-500"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <Sun
                    className={
                      theme === "light"
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-400"
                    }
                    size={32}
                  />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">Light</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Bright and clean
                  </p>
                </div>
                {theme === "light" && (
                  <Check className="text-purple-500" size={20} />
                )}
              </div>
            </button>

            <button
              onClick={() => handleThemeChange("dark")}
              className={`p-6 rounded-xl border-2 transition-all ${
                theme === "dark"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    theme === "dark"
                      ? "bg-purple-500"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <Moon
                    className={
                      theme === "dark"
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-400"
                    }
                    size={32}
                  />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">Dark</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Easy on the eyes
                  </p>
                </div>
                {theme === "dark" && (
                  <Check className="text-purple-500" size={20} />
                )}
              </div>
            </button>

            <button
              onClick={() => handleThemeChange("system")}
              className={`p-6 rounded-xl border-2 transition-all ${
                theme === "system"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-purple-300"
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    theme === "system"
                      ? "bg-purple-500"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <Monitor
                    className={
                      theme === "system"
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-400"
                    }
                    size={32}
                  />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold">System</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Match device
                  </p>
                </div>
                {theme === "system" && (
                  <Check className="text-purple-500" size={20} />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Color Scheme */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Palette
              size={24}
              className="text-purple-600 dark:text-purple-400"
            />
            <h2 className="text-2xl font-bold">Color Scheme</h2>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            {colorSchemes.map((scheme) => (
              <button
                key={scheme.value}
                onClick={() => handleColorSchemeChange(scheme.value)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  colorScheme === scheme.value
                    ? "border-purple-500"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-br ${scheme.colors}`}
                  />
                  <div className="text-center">
                    <h3 className="font-semibold text-sm">{scheme.name}</h3>
                  </div>
                  {colorScheme === scheme.value && (
                    <Check className="text-purple-500" size={18} />
                  )}
                </div>
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            Note: Custom color schemes are coming soon in a future update.
          </p>
        </div>

        {/* Advanced Options */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Advanced Options</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <h3 className="font-semibold">Auto-switch Theme</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Automatically switch between light and dark based on time of
                  day
                </p>
              </div>
              <button
                onClick={handleAutoSwitchToggle}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  autoSwitch ? "bg-purple-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <div
                  className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                    autoSwitch ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <div>
                <h3 className="font-semibold">Reduce Animations</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Minimize motion for better performance
                </p>
              </div>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <div>
                <h3 className="font-semibold">High Contrast</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Increase contrast for better accessibility
                </p>
              </div>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Theme Preview</h2>
          <p className="mb-6">
            Your current theme settings will be applied across the entire
            application.
          </p>
          <div className="flex gap-4">
            <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="text-sm mb-2 opacity-90">Current Theme</div>
              <div className="font-bold text-lg capitalize">{theme}</div>
            </div>
            <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="text-sm mb-2 opacity-90">Color Scheme</div>
              <div className="font-bold text-lg capitalize">{colorScheme}</div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
