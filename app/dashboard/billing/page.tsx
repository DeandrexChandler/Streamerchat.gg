"use client";

import Link from "next/link";
import { CreditCard, Calendar, Download, Check } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="max-w-6xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Billing & Subscription</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your subscription, payment method, and billing history
        </p>
      </div>

      {/* Current Plan */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Current Plan</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Pro Plan - Monthly
            </p>
          </div>
          <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-4 py-2 rounded-lg font-semibold">
            $9.99/month
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Check className="text-green-500" size={20} />
            <span className="text-sm">Unlimited AI Chat Simulation</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="text-green-500" size={20} />
            <span className="text-sm">Custom Emote Import</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="text-green-500" size={20} />
            <span className="text-sm">Advanced Analytics</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="text-green-500" size={20} />
            <span className="text-sm">OBS Overlay Integration</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="text-green-500" size={20} />
            <span className="text-sm">Voice Recognition</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="text-green-500" size={20} />
            <span className="text-sm">Priority Support</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            Manage Subscription
          </button>
          <button className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Change Plan
          </button>
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Payment Method</h2>
          <button className="text-purple-600 dark:text-purple-400 hover:underline">
            Update
          </button>
        </div>

        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <CreditCard size={32} className="text-gray-600 dark:text-gray-400" />
          <div>
            <p className="font-medium">•••• •••• •••• 4242</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Expires 12/2025
            </p>
          </div>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Billing History</h2>

        <div className="space-y-3">
          {[
            {
              date: "Jan 1, 2025",
              amount: "$9.99",
              status: "Paid",
              invoice: "INV-2025-001",
            },
            {
              date: "Dec 1, 2024",
              amount: "$9.99",
              status: "Paid",
              invoice: "INV-2024-012",
            },
            {
              date: "Nov 1, 2024",
              amount: "$9.99",
              status: "Paid",
              invoice: "INV-2024-011",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <Calendar
                  size={20}
                  className="text-gray-600 dark:text-gray-400"
                />
                <div>
                  <p className="font-medium">{item.date}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {item.invoice}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold">{item.amount}</span>
                <span className="text-green-600 dark:text-green-400 text-sm">
                  {item.status}
                </span>
                <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
                  <Download size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Back Link */}
      <div className="mt-6">
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
