"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Clock,
  MessageSquare,
  Mic,
  Globe,
  Download,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

interface AnalyticsData {
  totalHours: number;
  totalMessages: number;
  avgMicActivity: number;
  sessionsThisWeek: number;
  dailyUsage: Array<{ day: string; hours: number; messages: number }>;
  messageTimeline: Array<{ time: string; count: number }>;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch("/api/analytics");
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!analytics) return;

    const csv = [
      ["Metric", "Value"],
      ["Total Hours", analytics.totalHours],
      ["Total Messages", analytics.totalMessages],
      ["Avg Mic Activity", `${analytics.avgMicActivity}%`],
      ["Sessions This Week", analytics.sessionsThisWeek],
      [""],
      ["Daily Usage"],
      ["Day", "Hours", "Messages"],
      ...analytics.dailyUsage.map((d) => [d.day, d.hours, d.messages]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `streamer-analytics-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    toast.success("Analytics exported to CSV");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!analytics) {
    return (
      <DashboardLayout>
        <div className="text-center py-16">
          <p className="text-gray-600 dark:text-gray-400">
            No analytics data available
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Export Button */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 dark:text-gray-400">
              Track your practice sessions and progress
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Clock
                  className="text-purple-600 dark:text-purple-400"
                  size={24}
                />
              </div>
              <TrendingUp className="text-green-500" size={20} />
            </div>
            <h3 className="text-3xl font-bold mb-1">{analytics.totalHours}h</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total Practice Time
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-lg flex items-center justify-center">
                <MessageSquare
                  className="text-pink-600 dark:text-pink-400"
                  size={24}
                />
              </div>
              <TrendingUp className="text-green-500" size={20} />
            </div>
            <h3 className="text-3xl font-bold mb-1">
              {analytics.totalMessages.toLocaleString()}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Messages Generated
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Mic className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <TrendingUp className="text-green-500" size={20} />
            </div>
            <h3 className="text-3xl font-bold mb-1">
              {analytics.avgMicActivity}%
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Avg Mic Activity
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Globe
                  className="text-green-600 dark:text-green-400"
                  size={24}
                />
              </div>
              <TrendingUp className="text-green-500" size={20} />
            </div>
            <h3 className="text-3xl font-bold mb-1">
              {analytics.sessionsThisWeek}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sessions This Week
            </p>
          </div>
        </div>

        {/* 7-Day Usage Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold mb-6">7-Day Practice Activity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="day"
                stroke="#9CA3AF"
                style={{ fontSize: "14px" }}
              />
              <YAxis stroke="#9CA3AF" style={{ fontSize: "14px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#F3F4F6" }}
              />
              <Legend />
              <Bar
                dataKey="hours"
                fill="#A855F7"
                name="Hours"
                radius={[8, 8, 0, 0]}
              />
              <Bar
                dataKey="messages"
                fill="#EC4899"
                name="Messages (÷100)"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
            * Message count is divided by 100 for visualization
          </p>
        </div>

        {/* Messages Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold mb-6">
            Messages Over Time (Last 24 Hours)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.messageTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                stroke="#9CA3AF"
                style={{ fontSize: "14px" }}
              />
              <YAxis stroke="#9CA3AF" style={{ fontSize: "14px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1F2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#F3F4F6" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#3B82F6"
                strokeWidth={3}
                name="Messages"
                dot={{ fill: "#3B82F6", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Insights */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-8 text-white">
          <h3 className="text-2xl font-bold mb-4">💡 Insights & Tips</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <h4 className="font-semibold mb-2">Practice Consistency</h4>
              <p className="text-sm opacity-90">
                You've practiced {analytics.sessionsThisWeek} times this week.
                Aim for daily sessions to build muscle memory!
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <h4 className="font-semibold mb-2">Engagement Rate</h4>
              <p className="text-sm opacity-90">
                Your mic activity is at {analytics.avgMicActivity}%. Great
                streamers stay above 70%!
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
