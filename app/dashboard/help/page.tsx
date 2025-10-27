import DashboardLayout from "../../components/DashboardLayout";
import {
  BookOpen,
  Zap,
  Mic,
  Settings,
  BarChart3,
  Tv,
  MessageSquare,
  Shield,
} from "lucide-react";

export default function HelpPage() {
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Help Center</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Learn how to get the most out of StreamerChatAI
          </p>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">🚀 Quick Start Guide</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="text-3xl font-bold mb-2">1</div>
              <h3 className="font-semibold mb-2">Launch Simulator</h3>
              <p className="text-sm opacity-90">
                Go to Simulator page and start your first practice session
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="text-3xl font-bold mb-2">2</div>
              <h3 className="font-semibold mb-2">Adjust Settings</h3>
              <p className="text-sm opacity-90">
                Customize chat speed, message length, and emote preferences
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="text-3xl font-bold mb-2">3</div>
              <h3 className="font-semibold mb-2">Practice & Improve</h3>
              <p className="text-sm opacity-90">
                Use the microphone input to practice your commentary
              </p>
            </div>
          </div>
        </div>

        {/* Main Topics */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Getting Started */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <BookOpen
                  className="text-purple-600 dark:text-purple-400"
                  size={24}
                />
              </div>
              <h3 className="text-xl font-bold">Getting Started</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Create Your Account</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Sign up with email or use social login for quick access
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Navigate the Dashboard</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Access Simulator, Analytics, and Settings from the sidebar
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Understand the Interface</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Chat feed on left, controls on right, settings in the panel
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Using the Simulator */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                <MessageSquare
                  className="text-pink-600 dark:text-pink-400"
                  size={24}
                />
              </div>
              <h3 className="text-xl font-bold">Using the Simulator</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 dark:text-pink-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Chat Speed Control</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Adjust from 0.5x to 2.0x to simulate different activity
                    levels
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 dark:text-pink-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Pause and Resume</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Control message flow with the pause button anytime
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 dark:text-pink-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Send Custom Messages</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Type and send your own messages to the chat feed
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Microphone Features */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Mic className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <h3 className="text-xl font-bold">Microphone Features</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Enable Microphone</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Click the mic button and grant browser permissions
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Adjust Threshold</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set the sensitivity slider to match your voice level
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Practice Commentary</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Speak naturally and watch the visual meter respond
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Settings & Customization */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Settings
                  className="text-green-600 dark:text-green-400"
                  size={24}
                />
              </div>
              <h3 className="text-xl font-bold">Settings & Customization</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Message Length</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose short, medium, or long messages
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Profanity Filter</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Enable filtering or word replacement for safe practice
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Bored Mode</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Simulates idle chat messages after periods of silence
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Analytics */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <BarChart3
                  className="text-yellow-600 dark:text-yellow-400"
                  size={24}
                />
              </div>
              <h3 className="text-xl font-bold">Analytics & Tracking</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">View Your Progress</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Track total hours, messages, and mic activity
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">7-Day Trends</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    See daily usage patterns in interactive charts
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-600 dark:text-yellow-400 mt-1">
                  •
                </span>
                <div>
                  <h4 className="font-semibold">Export Data</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Download your analytics as CSV for external analysis
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* OBS Integration */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <Tv className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <h3 className="text-xl font-bold">OBS Integration</h3>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-red-600 dark:text-red-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Generate Overlay URL</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Create a unique browser source URL for your stream
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 dark:text-red-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Customize Appearance</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Adjust size, font, and colors to match your brand
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-600 dark:text-red-400 mt-1">•</span>
                <div>
                  <h4 className="font-semibold">Add to OBS</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Copy the URL and paste into OBS browser source
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Shield
                className="text-orange-600 dark:text-orange-400"
                size={24}
              />
            </div>
            <h3 className="text-xl font-bold">Troubleshooting</h3>
          </div>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Microphone not working?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Make sure you've granted browser permissions. Check your browser
                settings and reload the page.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">
                Chat messages not appearing?
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Check if the chat is paused. Click the play button to resume
                message generation.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Emotes not loading?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ensure you have emotes enabled in settings. Try refreshing the
                page or clearing your browser cache.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Settings not saving?</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Check if your browser allows localStorage. Disable
                private/incognito mode for proper functionality.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Support */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Still Need Help?</h2>
          <p className="text-lg opacity-90 mb-6">
            Our support team is here to assist you with any questions or issues.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:support@streamerchatai.com"
              className="px-8 py-3 bg-white text-blue-600 rounded-lg hover:bg-gray-100 transition font-semibold"
            >
              Email Support
            </a>
            <a
              href="/dashboard/faq"
              className="px-8 py-3 bg-blue-600/50 hover:bg-blue-600/70 text-white rounded-lg transition font-semibold backdrop-blur-sm"
            >
              View FAQ
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
