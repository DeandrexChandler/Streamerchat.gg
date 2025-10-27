import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Award, Zap, Users, DollarSign } from "lucide-react";

export default function CreatorProgramPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full mb-6">
              <Award size={20} />
              <span className="font-semibold">Creator Program</span>
            </div>
            <h1 className="text-5xl font-bold mb-6">
              Join the StreamerChatAI Creator Program
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Unlock exclusive benefits, early access to features, and earn
              rewards by promoting StreamerChatAI to your community.
            </p>
          </div>

          {/* Benefits Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Award
                  className="text-purple-600 dark:text-purple-400"
                  size={24}
                />
              </div>
              <h3 className="text-lg font-bold mb-2">Exclusive Badge</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get a special creator badge on your profile
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Zap className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <h3 className="text-lg font-bold mb-2">Early Access</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Try new features before public release
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Users className="text-pink-600 dark:text-pink-400" size={24} />
              </div>
              <h3 className="text-lg font-bold mb-2">Priority Support</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get faster responses from our team
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mx-auto mb-4">
                <DollarSign
                  className="text-green-600 dark:text-green-400"
                  size={24}
                />
              </div>
              <h3 className="text-lg font-bold mb-2">Revenue Share</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Earn commissions on referrals
              </p>
            </div>
          </div>

          {/* Requirements */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 mb-16">
            <h2 className="text-3xl font-bold mb-6 text-center">
              Requirements
            </h2>
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Active Streamer</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Stream at least 10 hours per month on Twitch, YouTube, or
                    Kick
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Minimum Following</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Have at least 500 followers on your primary streaming
                    platform
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Community Guidelines</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Maintain a positive community and follow platform ToS
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-12 text-white">
            <h2 className="text-3xl font-bold mb-4">Ready to Join?</h2>
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
              Applications are currently under review. Sign up to be notified
              when we start accepting new creators.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="px-8 py-4 bg-white text-purple-600 rounded-lg hover:bg-gray-100 transition font-bold text-lg"
              >
                Apply Now
              </Link>
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-purple-600/50 hover:bg-purple-600/70 text-white rounded-lg transition font-bold text-lg backdrop-blur-sm"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
