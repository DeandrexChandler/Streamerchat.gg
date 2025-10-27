import DashboardLayout from "../components/DashboardLayout";
import Link from "next/link";
import { LayoutDashboard, BarChart3, Tv, Sparkles } from "lucide-react";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-white">
          <h2 className="text-3xl font-bold mb-2">
            Welcome to StreamerChatAI! 🎉
          </h2>
          <p className="text-lg opacity-90">
            Your AI-powered chat simulator is ready to help you practice, create
            content, and stand out.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6">
          <Link
            href="/dashboard/simulator"
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-transparent hover:border-purple-500 transition-all group"
          >
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <LayoutDashboard
                className="text-purple-600 dark:text-purple-400"
                size={24}
              />
            </div>
            <h3 className="text-xl font-bold mb-2">Start Simulator</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Practice with AI-generated chat messages and improve your
              streaming skills
            </p>
          </Link>

          <Link
            href="/dashboard/analytics"
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-transparent hover:border-pink-500 transition-all group"
          >
            <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BarChart3
                className="text-pink-600 dark:text-pink-400"
                size={24}
              />
            </div>
            <h3 className="text-xl font-bold mb-2">View Analytics</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Track your usage, see trends, and measure your progress over time
            </p>
          </Link>

          <Link
            href="/dashboard/obs"
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-transparent hover:border-blue-500 transition-all group"
          >
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Tv className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">OBS Setup</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Configure your browser source overlay for live streaming
              integration
            </p>
          </Link>
        </div>

        {/* Stats Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Sparkles className="text-yellow-500" size={24} />
            Your Stats
          </h3>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                0h
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total Practice Time
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-pink-600 dark:text-pink-400 mb-1">
                0
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Messages Generated
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                0%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Avg Mic Activity
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                0
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Sessions This Week
              </div>
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-xl font-bold mb-4">Getting Started</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1">Launch the Simulator</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Head to the Simulator page and start practicing with
                  AI-generated chat
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1">Customize Your Settings</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Adjust chat speed, message length, and emote preferences to
                  match your style
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1">Set Up OBS Integration</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Add the chat overlay to your stream for a professional setup
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
