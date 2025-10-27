"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, MapPin, Send } from "lucide-react";
import { toast } from "sonner";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast.success("Message sent! We'll get back to you soon.");
    setFormData({ name: "", email: "", subject: "", message: "" });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-purple-600">
              StreamerChatAI
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/features"
                className="text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/about"
                className="text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors"
              >
                About
              </Link>
              <Link
                href="/login"
                className="text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">Get in Touch</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Have questions, feedback, or need help? We'd love to hear from you.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {/* Contact Cards */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full w-fit mx-auto mb-4">
              <Mail className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-semibold mb-2">Email Us</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
              For general inquiries
            </p>
            <a
              href="mailto:support@streamerchatai.com"
              className="text-purple-600 hover:text-purple-700 font-medium"
            >
              support@streamerchatai.com
            </a>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full w-fit mx-auto mb-4">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold mb-2">Live Chat</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
              Get instant support
            </p>
            <button className="text-blue-600 hover:text-blue-700 font-medium">
              Start Chat
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full w-fit mx-auto mb-4">
              <MapPin className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold mb-2">Location</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
              Visit our office
            </p>
            <p className="text-gray-700 dark:text-gray-300 font-medium">
              San Francisco, CA
            </p>
          </div>
        </div>

        {/* Contact Form */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-6">Send us a Message</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium mb-2"
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-2"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="subject"
                  className="block text-sm font-medium mb-2"
                >
                  Subject
                </label>
                <select
                  id="subject"
                  required
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                  <option value="">Select a topic</option>
                  <option value="general">General Inquiry</option>
                  <option value="support">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="feature">Feature Request</option>
                  <option value="enterprise">Enterprise Sales</option>
                  <option value="partnership">Partnership Opportunity</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium mb-2"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={6}
                  value={formData.message}
                  onChange={(e) =>
                    setFormData({ ...formData, message: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-600 focus:border-transparent resize-none"
                  placeholder="Tell us how we can help..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  "Sending..."
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* FAQ Quick Links */}
        <div className="mt-16 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Looking for quick answers?
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/dashboard/faq"
              className="px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-600 rounded-lg font-medium transition-colors"
            >
              View FAQ
            </Link>
            <Link
              href="/dashboard/help"
              className="px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-600 rounded-lg font-medium transition-colors"
            >
              Help Center
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-bold text-xl mb-4">StreamerChatAI</h3>
              <p className="text-gray-400">Practice makes perfect streaming.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <div className="space-y-2">
                <Link
                  href="/features"
                  className="block text-gray-400 hover:text-white"
                >
                  Features
                </Link>
                <Link
                  href="/pricing"
                  className="block text-gray-400 hover:text-white"
                >
                  Pricing
                </Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <div className="space-y-2">
                <Link
                  href="/about"
                  className="block text-gray-400 hover:text-white"
                >
                  About
                </Link>
                <Link
                  href="/contact"
                  className="block text-gray-400 hover:text-white"
                >
                  Contact
                </Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <div className="space-y-2">
                <Link
                  href="/privacy"
                  className="block text-gray-400 hover:text-white"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="block text-gray-400 hover:text-white"
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            © 2025 StreamerChatAI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
