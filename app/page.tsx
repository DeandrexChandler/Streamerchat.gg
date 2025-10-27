import Link from "next/link";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import {
  Mic,
  Sparkles,
  Users,
  TrendingUp,
  MessageSquare,
  Star,
  ArrowRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Header />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-8">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 dark:text-white">
              Practice Streaming
              <br />
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Before Going Live
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Perfect your on-camera presence with AI-powered chat simulation.
              Practice responding to your audience in real-time.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/signup"
                className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-semibold text-lg flex items-center space-x-2 group"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
              </Link>

              <Link
                href="/features"
                className="px-8 py-4 border-2 border-gray-300 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 rounded-lg transition font-semibold text-lg text-gray-900 dark:text-white"
              >
                See Features
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 pt-12 max-w-2xl mx-auto">
              <div>
                <div className="text-3xl font-bold text-purple-600">10K+</div>
                <div className="text-gray-600 dark:text-gray-400 text-sm">
                  Active Streamers
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">1M+</div>
                <div className="text-gray-600 dark:text-gray-400 text-sm">
                  Practice Sessions
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">98%</div>
                <div className="text-gray-600 dark:text-gray-400 text-sm">
                  Satisfaction
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Why Streamers Love Us
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Everything you need to build confidence before your stream
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Practice */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 transition">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <Mic className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Practice Makes Perfect
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Rehearse your reactions and commentary in a risk-free
                environment before going live.
              </p>
            </div>

            {/* Clip Farming */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 transition">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Create Better Clips
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Test different reactions and content ideas to find what
                resonates with your audience.
              </p>
            </div>

            {/* Engagement */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 transition">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Boost Engagement
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Learn to interact naturally with chat and build stronger viewer
                connections.
              </p>
            </div>

            {/* Personality */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 transition">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Develop Your Brand
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Find your unique streaming personality and refine your on-camera
                presence.
              </p>
            </div>

            {/* Emotes */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 transition">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Realistic Chat Simulation
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                AI-powered messages with emotes that feel like real Twitch chat.
              </p>
            </div>

            {/* Uniqueness */}
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-purple-600 dark:hover:border-purple-600 transition">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                <Star className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Stand Out From the Crowd
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Polish your content and delivery to stand out in a competitive
                streaming landscape.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Ready to Level Up Your Streams?
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Join thousands of streamers who practice with StreamerChatAI
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center space-x-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition font-semibold text-lg group"
          >
            <span>Start Practicing Free</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
