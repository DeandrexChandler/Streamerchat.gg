import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>

          <div className="prose dark:prose-invert max-w-none">
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
              Last Updated: October 27, 2025
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                1. Acceptance of Terms
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                By accessing and using StreamerChatAI, you agree to be bound by
                these Terms of Service. If you do not agree to these terms,
                please do not use our service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                2. Service Description
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                StreamerChatAI provides an AI-powered chat simulation platform
                for content creators to practice streaming, generate content
                ideas, and improve their engagement skills.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                3. User Responsibilities
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                You agree to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Provide accurate registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Use the service in compliance with all applicable laws</li>
                <li>Not abuse, harass, or harm others using our platform</li>
                <li>Not attempt to reverse engineer or exploit our service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">4. Prohibited Uses</h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                You may not use StreamerChatAI to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
                <li>Generate harmful, hateful, or discriminatory content</li>
                <li>Violate any third-party rights</li>
                <li>
                  Spread misinformation or engage in fraudulent activities
                </li>
                <li>Bypass rate limits or abuse our API</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                5. Intellectual Property
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                All content, features, and functionality of StreamerChatAI are
                owned by us and protected by copyright, trademark, and other
                intellectual property laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                6. Limitation of Liability
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                StreamerChatAI is provided "as is" without warranties of any
                kind. We are not liable for any damages arising from your use of
                the service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">7. Termination</h2>
              <p className="text-gray-700 dark:text-gray-300">
                We reserve the right to suspend or terminate your access to
                StreamerChatAI at any time for violations of these terms or for
                any other reason.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">8. Changes to Terms</h2>
              <p className="text-gray-700 dark:text-gray-300">
                We may update these Terms of Service from time to time.
                Continued use of the service after changes constitutes
                acceptance of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">
                9. Contact Information
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                For questions about these Terms of Service, contact us at:
                <br />
                Email: legal@streamerchatai.com
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <Link
              href="/"
              className="text-purple-600 dark:text-purple-400 hover:underline"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
