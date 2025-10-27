"use client";

import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { Check, Zap, Crown, Building2, ArrowRight } from "lucide-react";

export default function PricingPage() {
  const plans = [
    {
      name: "Free",
      icon: Zap,
      price: "$0",
      period: "forever",
      description: "Perfect for getting started with chat practice",
      features: [
        "Basic chat simulator",
        "Up to 10 emotes",
        "1 hour sessions",
        "Standard chat speed",
        "Basic analytics",
        "Community support",
      ],
      cta: "Get Started",
      ctaLink: "/signup",
      popular: false,
    },
    {
      name: "Premium",
      icon: Crown,
      price: "$9.99",
      period: "/month",
      description: "For serious streamers who want the full experience",
      features: [
        "Everything in Free",
        "Unlimited emotes",
        "Unlimited session time",
        "AI-powered chat generation",
        "Voice recognition (Whisper)",
        "Advanced analytics & insights",
        "OBS overlay integration",
        "Custom chat scenarios",
        "Priority support",
        "Export chat logs",
      ],
      cta: "Start Free Trial",
      ctaLink: "/signup?plan=premium",
      popular: true,
    },
    {
      name: "Enterprise",
      icon: Building2,
      price: "Custom",
      period: "pricing",
      description: "For teams, agencies, and organizations",
      features: [
        "Everything in Premium",
        "Multi-user accounts",
        "Team analytics dashboard",
        "Custom branding",
        "API access",
        "Dedicated account manager",
        "SLA guarantee",
        "Custom integrations",
        "Advanced security",
      ],
      cta: "Contact Sales",
      ctaLink: "/contact?plan=enterprise",
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      <Header />

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Choose the plan that fits your streaming journey. Upgrade or downgrade
          anytime.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl border-2 ${
                  plan.popular
                    ? "border-purple-600 scale-105"
                    : "border-gray-200 dark:border-gray-700"
                } p-8 transition-transform hover:scale-105`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Icon className="w-6 h-6 text-purple-600" />
                  </div>
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                </div>

                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">
                    {plan.period}
                  </span>
                </div>

                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  {plan.description}
                </p>

                <Link
                  href={plan.ctaLink}
                  className={`block w-full text-center px-6 py-3 rounded-lg font-semibold transition-colors mb-6 ${
                    plan.popular
                      ? "bg-purple-600 hover:bg-purple-700 text-white"
                      : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white"
                  }`}
                >
                  {plan.cta}
                </Link>

                <div className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white dark:bg-gray-900 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Can I switch plans anytime?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes! You can upgrade, downgrade, or cancel your subscription at
                any time. Changes take effect immediately.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Is there a free trial for Premium?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Absolutely! All Premium plans come with a 14-day free trial. No
                credit card required to start.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                We accept all major credit cards (Visa, Mastercard, Amex),
                PayPal, and cryptocurrency payments.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Do you offer refunds?
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes, we offer a 30-day money-back guarantee. If you're not
                satisfied, we'll refund your purchase, no questions asked.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-purple-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Level Up Your Stream?
          </h2>
          <p className="text-xl mb-8 text-purple-100">
            Join thousands of streamers who practice with StreamerChatAI
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-600 hover:bg-gray-100 rounded-lg font-semibold text-lg transition-colors"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
