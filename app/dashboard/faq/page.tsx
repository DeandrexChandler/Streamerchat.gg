"use client";

import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  {
    category: "Getting Started",
    question: "What is StreamerChatAI?",
    answer:
      "StreamerChatAI is an AI-powered chat simulation platform that helps content creators practice streaming, improve their engagement skills, and generate content ideas. It simulates realistic Twitch-style chat with customizable settings.",
  },
  {
    category: "Getting Started",
    question: "How do I create an account?",
    answer:
      'Click the "Sign Up" button in the top navigation or go to /signup. You can create an account with your email and password, or use social login options like Google or GitHub for quick access.',
  },
  {
    category: "Getting Started",
    question: "Is StreamerChatAI free to use?",
    answer:
      "Yes! We offer a free tier with core features. Premium plans unlock additional customization options, higher usage limits, and priority support. Check our Pricing page for details.",
  },
  {
    category: "Simulator",
    question: "How does the chat simulator work?",
    answer:
      "The simulator generates realistic chat messages using AI, complete with random usernames, emotes, and context-aware responses. You can adjust chat speed, message length, and enable features like bored mode for idle periods.",
  },
  {
    category: "Simulator",
    question: "Can I customize the chat speed?",
    answer:
      "Absolutely! Use the chat speed slider to adjust from 0.5x (slow) to 2.0x (fast). This lets you practice with different activity levels, from quiet streams to high-energy raids.",
  },
  {
    category: "Simulator",
    question: 'What is "Bored Mode"?',
    answer:
      'Bored Mode simulates realistic idle chat behavior. When enabled, the system generates messages like "where is everyone?" or "what did I miss?" after periods of silence, just like real viewers would.',
  },
  {
    category: "Simulator",
    question: "How do I add my own messages to the chat?",
    answer:
      'Type your message in the "Send Message" input box at the bottom of the simulator and press Enter or click Send. Your messages will appear in the chat feed just like AI-generated ones.',
  },
  {
    category: "Microphone",
    question: "Why isn't my microphone working?",
    answer:
      "First, make sure you've granted browser permissions for microphone access. Check your browser settings (usually a lock icon in the address bar). If issues persist, try refreshing the page or using a different browser.",
  },
  {
    category: "Microphone",
    question: "What is the threshold slider for?",
    answer:
      "The threshold slider controls microphone sensitivity. Adjust it based on your voice level and environment. Higher values require louder input to trigger, while lower values are more sensitive.",
  },
  {
    category: "Microphone",
    question: "Does StreamerChatAI record my audio?",
    answer:
      "Your audio is only processed for transcription when the microphone is active. We use OpenAI's Whisper API for transcription. Audio is not stored permanently unless you explicitly save it. See our Privacy Policy for details.",
  },
  {
    category: "Settings",
    question: "How do I change message length?",
    answer:
      "Open the Settings panel (gear icon) and select Short, Medium, or Long under Message Length. Short messages are 1-5 words, Medium are 5-10 words, and Long are 10-20 words.",
  },
  {
    category: "Settings",
    question: "What does the profanity filter do?",
    answer:
      "The profanity filter has three modes: Off (no filtering), Replace (censors inappropriate words with ***), and Filter (removes messages entirely). This helps you practice in a safe, professional environment.",
  },
  {
    category: "Settings",
    question: "Can I save my preferred settings?",
    answer:
      "Yes! Your settings are automatically saved to your browser's local storage. You can also create named presets in the Settings page to quickly switch between different configurations.",
  },
  {
    category: "Analytics",
    question: "What analytics does StreamerChatAI track?",
    answer:
      "We track total practice time, messages generated, average microphone activity, and session frequency. You can view daily trends, 7-day charts, and export your data as CSV for external analysis.",
  },
  {
    category: "Analytics",
    question: "Can I export my analytics data?",
    answer:
      'Absolutely! Click the "Export CSV" button on the Analytics page to download your data. The CSV includes all metrics, daily breakdowns, and timeline information.',
  },
  {
    category: "OBS Integration",
    question: "How do I add the chat overlay to OBS?",
    answer:
      "Go to the OBS Integration page, customize your overlay settings, and copy the browser source URL. In OBS, add a new Browser Source, paste the URL, and adjust the dimensions to match your layout.",
  },
  {
    category: "OBS Integration",
    question: "Can I customize the overlay appearance?",
    answer:
      "Yes! You can adjust font size, colors, background opacity, and chat dimensions. The OBS Integration page provides a live preview so you can see changes in real-time.",
  },
  {
    category: "Account",
    question: "How do I change my password?",
    answer:
      'Go to Settings > More > Account Settings. Click "Change Password", enter your current password and new password, then save. You\'ll receive a confirmation email.',
  },
  {
    category: "Account",
    question: "Can I delete my account?",
    answer:
      'Yes. Go to Settings > More > Account Settings and scroll to the bottom. Click "Delete Account" and confirm. This action is permanent and cannot be undone.',
  },
  {
    category: "Technical",
    question: "Which browsers are supported?",
    answer:
      "StreamerChatAI works best on modern browsers: Chrome, Firefox, Safari, and Edge (latest versions). For microphone features, we recommend Chrome or Edge for optimal performance.",
  },
  {
    category: "Technical",
    question: "Why are emotes not loading?",
    answer:
      "Ensure emotes are enabled in Settings. Check your internet connection and try refreshing the page. If issues persist, clear your browser cache or disable ad blockers that might block CDN content.",
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = [
    "All",
    ...Array.from(new Set(faqs.map((faq) => faq.category))),
  ];
  const filteredFaqs =
    selectedCategory === "All"
      ? faqs
      : faqs.filter((faq) => faq.category === selectedCategory);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Quick answers to common questions about StreamerChatAI
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 justify-center">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedCategory === category
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {filteredFaqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
              >
                <div className="flex-1">
                  <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold mb-1">
                    {faq.category}
                  </div>
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                </div>
                {openIndex === index ? (
                  <ChevronUp
                    className="text-gray-400 flex-shrink-0 ml-4"
                    size={20}
                  />
                ) : (
                  <ChevronDown
                    className="text-gray-400 flex-shrink-0 ml-4"
                    size={20}
                  />
                )}
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4 pt-2">
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Still Have Questions */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-4">Still Have Questions?</h2>
          <p className="text-lg opacity-90 mb-6">
            Can't find what you're looking for? We're here to help!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:support@streamerchatai.com"
              className="px-8 py-3 bg-white text-purple-600 rounded-lg hover:bg-gray-100 transition font-semibold"
            >
              Contact Support
            </a>
            <a
              href="/dashboard/help"
              className="px-8 py-3 bg-purple-600/50 hover:bg-purple-600/70 text-white rounded-lg transition font-semibold backdrop-blur-sm"
            >
              View Help Center
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
