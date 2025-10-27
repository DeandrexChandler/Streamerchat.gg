"use client";

import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Target, Users, Zap, Heart, ArrowRight } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      <Header />

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">
            Empowering Streamers to Build Confidence
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            StreamerChatAI was built by streamers, for streamers. We understand
            the challenges of engaging with chat while staying focused on your
            content.
          </p>
        </div>

        {/* Mission Section */}
        <div className="grid md:grid-cols-2 gap-12 mb-20">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg w-fit mb-4">
              <Target className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              To help every streamer develop the skills they need to create
              engaging, entertaining content. We believe practice makes perfect,
              and with AI-powered chat simulation, you can train anytime,
              anywhere—without needing a live audience.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg w-fit mb-4">
              <Heart className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Our Vision</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We envision a world where every aspiring streamer has access to
              professional-grade tools for practice and improvement.
              StreamerChatAI is just the beginning of building a comprehensive
              suite of training tools for content creators.
            </p>
          </div>
        </div>

        {/* Values Section */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold text-center mb-12">
            Our Core Values
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="p-4 bg-purple-100 dark:bg-purple-900/30 rounded-full w-fit mx-auto mb-4">
                <Users className="w-10 h-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Community First</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Built with feedback from thousands of streamers. Your voice
                shapes our product.
              </p>
            </div>

            <div className="text-center">
              <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full w-fit mx-auto mb-4">
                <Zap className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Innovation</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Leveraging cutting-edge AI to create realistic, helpful training
                experiences.
              </p>
            </div>

            <div className="text-center">
              <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full w-fit mx-auto mb-4">
                <Heart className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Accessibility</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Quality tools shouldn't break the bank. Free tier for everyone,
                always.
              </p>
            </div>
          </div>
        </div>

        {/* Story Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 shadow-xl mb-20">
          <h2 className="text-3xl font-bold mb-6 text-center">Our Story</h2>
          <div className="max-w-3xl mx-auto space-y-4 text-gray-600 dark:text-gray-400 leading-relaxed">
            <p>
              StreamerChatAI started as a weekend project in early 2024 when our
              founder, a part-time streamer, struggled with the classic "dead
              air" problem. They wanted to practice engaging with chat without
              bothering friends or going live unprepared.
            </p>
            <p>
              After building a simple prototype and sharing it with the
              streaming community, the response was overwhelming. Streamers from
              all platforms—Twitch, YouTube, Kick—reached out asking for
              features, sharing ideas, and helping test.
            </p>
            <p>
              Today, StreamerChatAI helps thousands of streamers practice their
              craft. From small streamers preparing for their first broadcast to
              established creators testing new content formats, we're proud to
              be part of so many streaming journeys.
            </p>
            <p>
              We're still a small team, but we're growing every day—always
              listening to our community, always improving, always innovating.
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid md:grid-cols-4 gap-8 mb-20">
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">10K+</div>
            <div className="text-gray-600 dark:text-gray-400">
              Active Streamers
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">500K+</div>
            <div className="text-gray-600 dark:text-gray-400">
              Practice Sessions
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">2M+</div>
            <div className="text-gray-600 dark:text-gray-400">
              Messages Generated
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">99%</div>
            <div className="text-gray-600 dark:text-gray-400">
              Satisfaction Rate
            </div>
          </div>
        </div>

        {/* Team Section */}
        <div className="text-center mb-20">
          <h2 className="text-3xl font-bold mb-4">Join Our Team</h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
            We're always looking for passionate people who want to help
            streamers succeed. Check out our open positions.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            Get in Touch
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
