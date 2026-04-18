"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  getAnalytics,
  type AnalyticsPlatform,
  type AnalyticsResult,
  type TimeRange,
} from "@/app/(app)/dashboard/analytics-actions";

const PLATFORM_OPTIONS: { id: AnalyticsPlatform; label: string; color: string }[] = [
  { id: "overall", label: "Combined", color: "#0A0A0A" },
  { id: "youtube", label: "YouTube", color: "#FF0000" },
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "threads", label: "Threads", color: "#0A0A0A" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "tiktok", label: "TikTok", color: "#010101" },
  { id: "bluesky", label: "Bluesky", color: "#0085FF" },
  { id: "mastodon", label: "Mastodon", color: "#6364FF" },
];

const RANGE_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "3mo", label: "3M" },
  { id: "6mo", label: "6M" },
  { id: "year", label: "Year" },
  { id: "max", label: "Max" },
];

const METRIC_TILES: { key: keyof AnalyticsResult["metrics"]; label: string; color: string }[] = [
  { key: "views", label: "Views", color: "#C8FF00" },
  { key: "likes", label: "Likes", color: "#FF4F4F" },
  { key: "shares", label: "Shares", color: "#00D4FF" },
  { key: "followers", label: "Followers", color: "#7C3AED" },
  { key: "reach", label: "Reach", color: "#C8FF00" },
  { key: "comments", label: "Comments", color: "#00D4FF" },
  { key: "monetization", label: "Monetization", color: "#C8FF00" },
];

function formatNumber(n: number | null): string {
  if (n == null) return "N/A";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AnalyticsSection({ userId }: { userId: string }) {
  const [platform, setPlatform] = useState<AnalyticsPlatform>("overall");
  const [range, setRange] = useState<TimeRange>("month");
  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await getAnalytics(userId, platform, range);
        setData(result);
      } catch (e) {
        setError((e as Error).message || "Failed to load analytics");
      }
    });
  }, [userId, platform, range]);

  const chartColor = useMemo(
    () => PLATFORM_OPTIONS.find((p) => p.id === platform)?.color ?? "#0A0A0A",
    [platform]
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-[#0A0A0A]">Analytics</h2>
        {isPending && <span className="text-xs text-[#5C5C5A]">Loading…</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="inline-flex items-center px-2.5 py-1.5 bg-[#C8FF00] border border-[#0A0A0A] shadow-[3px_3px_0px_0px_#0A0A0A] text-[10px] font-black uppercase tracking-wider text-[#0A0A0A]">
          Social Media
        </span>
        {PLATFORM_OPTIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`px-3 py-1.5 text-xs font-bold border border-[#0A0A0A] transition-all ${
              platform === p.id
                ? "bg-[#0A0A0A] text-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A]"
                : "bg-[#F9F9F7] text-[#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center px-2.5 py-1.5 bg-[#7C3AED] border border-[#0A0A0A] shadow-[3px_3px_0px_0px_#0A0A0A] text-[10px] font-black uppercase tracking-wider text-[#F9F9F7]">
          Period
        </span>
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`px-3 py-1.5 text-xs font-bold border border-[#0A0A0A] transition-all ${
              range === r.id
                ? "bg-[#C8FF00] text-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A]"
                : "bg-[#F9F9F7] text-[#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 border border-[#FF4F4F] bg-[#FFF1F1] text-sm text-[#FF4F4F] font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {METRIC_TILES.map((tile) => {
          const value = data?.metrics[tile.key] ?? null;
          return (
            <div
              key={tile.key}
              className="bg-[#F9F9F7] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2" style={{ backgroundColor: tile.color }} />
                <span className="text-xs font-bold uppercase tracking-wide text-[#5C5C5A]">
                  {tile.label}
                </span>
              </div>
              <p className="text-2xl font-black text-[#0A0A0A] mt-1">{formatNumber(value)}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-[#F9F9F7] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-[#0A0A0A]">Posts per day</span>
          <span className="text-xs text-[#5C5C5A]">
            {data?.series?.reduce((a, b) => a + b.count, 0) ?? 0} total
          </span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.series ?? []} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="#E5E5E2" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#5C5C5A", fontSize: 11 }}
                tickFormatter={(d) => d.slice(5)}
                minTickGap={20}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#5C5C5A", fontSize: 11 }}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "#F9F9F7",
                  border: "1px solid #0A0A0A",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#0A0A0A", fontWeight: 700 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={chartColor}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
