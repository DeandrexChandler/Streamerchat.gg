import Link from "next/link";

export default function DashboardPrivacyPage() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          Last Updated: October 27, 2025
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
          <p className="text-gray-700 dark:text-gray-300">
            StreamerChatAI ("we", "our", or "us") is committed to protecting
            your privacy. This Privacy Policy explains how we collect, use, and
            safeguard your information when you use our AI-powered chat
            simulation service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">2. Information We Collect</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We collect information that you provide directly to us:
          </p>
          <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
            <li>Account information (name, email, password)</li>
            <li>
              Audio recordings for transcription (when using microphone
              features)
            </li>
            <li>Usage data and analytics</li>
            <li>Settings and preferences</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">
            3. How We Use Your Information
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 dark:text-gray-300 space-y-2">
            <li>Provide and improve our chat simulation services</li>
            <li>Process your audio for transcription</li>
            <li>Generate AI-powered chat responses</li>
            <li>Analyze usage patterns to enhance user experience</li>
            <li>Send important service updates</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">4. Data Security</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We implement industry-standard security measures to protect your
            data. All passwords are hashed using bcrypt, and sensitive data is
            encrypted in transit using HTTPS.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">5. Third-Party Services</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use OpenAI's API for transcription and chat generation. Please
            review OpenAI's privacy policy to understand how they handle data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">6. Your Rights</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You have the right to access, modify, or delete your personal data
            at any time. Contact us at privacy@streamerchatai.com for data
            requests.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">7. Contact Us</h2>
          <p className="text-gray-700 dark:text-gray-300">
            If you have questions about this Privacy Policy, please contact us
            at:
            <br />
            Email: privacy@streamerchatai.com
          </p>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <Link
          href="/dashboard"
          className="text-purple-600 dark:text-purple-400 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
