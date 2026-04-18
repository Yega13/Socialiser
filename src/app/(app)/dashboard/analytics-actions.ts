"use server";

import { createClient } from "@supabase/supabase-js";
import {
  type Metrics,
  EMPTY_METRICS,
  fetchYouTubeMetrics,
  fetchFacebookMetrics,
  fetchBlueskyMetrics,
  fetchMastodonMetrics,
  sumMetrics,
} from "@/lib/analytics/fetchers";
import { refreshYouTubeToken } from "@/app/(app)/compose/actions";
import { resolveBlueskyPDS } from "@/lib/bluesky";

export type TimeRange = "day" | "week" | "month" | "3mo" | "6mo" | "year" | "max";
export type AnalyticsPlatform =
  | "overall"
  | "youtube"
  | "instagram"
  | "threads"
  | "facebook"
  | "tiktok"
  | "bluesky"
  | "mastodon";

export type PlatformMetrics = { platform: string; metrics: Metrics };
export type SeriesPoint = { date: string; count: number };
export type AnalyticsResult = {
  metrics: Metrics;
  perPlatform: PlatformMetrics[];
  series: SeriesPoint[];
};

const RANGE_DAYS: Record<TimeRange, number> = {
  day: 1,
  week: 7,
  month: 30,
  "3mo": 90,
  "6mo": 180,
  year: 365,
  max: 3650,
};

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Conn = {
  platform: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  platform_user_id: string | null;
  platform_username: string | null;
};

async function metricsForConnection(conn: Conn): Promise<Metrics> {
  try {
    if (conn.platform === "youtube" && conn.access_token) {
      let token = conn.access_token;
      const expires = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
      if (expires && expires < Date.now() + 60_000 && conn.refresh_token) {
        const refreshed = await refreshYouTubeToken(conn.refresh_token);
        if (refreshed) token = refreshed;
      }
      return await fetchYouTubeMetrics(token);
    }
    if (conn.platform === "facebook" && conn.access_token && conn.platform_user_id) {
      return await fetchFacebookMetrics(conn.access_token, conn.platform_user_id);
    }
    if (conn.platform === "bluesky" && conn.access_token && conn.platform_user_id) {
      const pds = await resolveBlueskyPDS(conn.platform_user_id);
      return await fetchBlueskyMetrics(conn.access_token, conn.platform_user_id, pds);
    }
    if (conn.platform === "mastodon" && conn.access_token && conn.refresh_token) {
      return await fetchMastodonMetrics(conn.refresh_token, conn.access_token);
    }
  } catch {
    // fall through
  }
  return EMPTY_METRICS;
}

export async function getAnalytics(
  userId: string,
  platformFilter: AnalyticsPlatform,
  range: TimeRange
): Promise<AnalyticsResult> {
  const db = serviceClient();

  const [{ data: conns }, { data: posts }] = await Promise.all([
    db
      .from("connected_platforms")
      .select("platform, access_token, refresh_token, token_expires_at, platform_user_id, platform_username")
      .eq("user_id", userId)
      .eq("is_active", true),
    db
      .from("scheduled_posts")
      .select("platforms, scheduled_at, status, created_at")
      .eq("user_id", userId)
      .eq("status", "completed"),
  ]);

  const connections = (conns ?? []) as Conn[];
  const filtered =
    platformFilter === "overall"
      ? connections
      : connections.filter((c) => c.platform === platformFilter);

  const perPlatformResults = await Promise.all(
    filtered.map(async (c) => ({ platform: c.platform, metrics: await metricsForConnection(c) }))
  );

  const metrics =
    platformFilter === "overall"
      ? sumMetrics(perPlatformResults.map((p) => p.metrics))
      : perPlatformResults[0]?.metrics ?? EMPTY_METRICS;

  const days = RANGE_DAYS[range];
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400_000);
  since.setUTCHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(since.getTime() + i * 86400_000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of posts ?? []) {
    const scheduledAt = row.scheduled_at || row.created_at;
    if (!scheduledAt) continue;
    const t = new Date(scheduledAt).getTime();
    if (t < since.getTime()) continue;
    if (platformFilter !== "overall") {
      const platforms: string[] = row.platforms ?? [];
      if (!platforms.includes(platformFilter)) continue;
    }
    const key = new Date(scheduledAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const series: SeriesPoint[] = Array.from(buckets.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  return { metrics, perPlatform: perPlatformResults, series };
}
