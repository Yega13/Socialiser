// Per-platform analytics fetchers.
// Each returns a Metrics object with whatever counters the free API surface allows.
// null = not available (either unsupported by API or requires extra OAuth scopes).

export type Metrics = {
  views: number | null;
  likes: number | null;
  shares: number | null;
  followers: number | null;
  reach: number | null;
  monetization: number | null;
  comments: number | null;
};

export const EMPTY_METRICS: Metrics = {
  views: null,
  likes: null,
  shares: null,
  followers: null,
  reach: null,
  monetization: null,
  comments: null,
};

const TIMEOUT = 8000;

function timeout(ms: number) {
  return AbortSignal.timeout(ms);
}

// ── YouTube ───────────────────────────────────────────────────────
// Channel statistics: viewCount, subscriberCount, videoCount.
// Recent videos: likeCount, commentCount summed.
// Monetization needs yt-analytics.readonly scope → N/A.
export async function fetchYouTubeMetrics(
  accessToken: string
): Promise<Metrics> {
  try {
    const chRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout(TIMEOUT) }
    );
    if (!chRes.ok) return EMPTY_METRICS;
    const chData = await chRes.json();
    const ch = chData.items?.[0];
    if (!ch) return EMPTY_METRICS;
    const stats = ch.statistics ?? {};
    const views = Number(stats.viewCount) || 0;
    const followers = Number(stats.subscriberCount) || 0;
    const uploadsPlaylist = ch.contentDetails?.relatedPlaylists?.uploads;

    let likes = 0;
    let comments = 0;

    if (uploadsPlaylist) {
      const plRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploadsPlaylist}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout(TIMEOUT) }
      );
      if (plRes.ok) {
        const plData = await plRes.json();
        const videoIds: string[] = (plData.items ?? [])
          .map((i: { contentDetails?: { videoId?: string } }) => i.contentDetails?.videoId)
          .filter((id: string | undefined): id is string => Boolean(id));
        if (videoIds.length) {
          const vRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}`,
            { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout(TIMEOUT) }
          );
          if (vRes.ok) {
            const vData = await vRes.json();
            for (const v of vData.items ?? []) {
              likes += Number(v.statistics?.likeCount) || 0;
              comments += Number(v.statistics?.commentCount) || 0;
            }
          }
        }
      }
    }

    return {
      views,
      likes,
      shares: 0,
      followers,
      reach: 0,
      monetization: 0,
      comments,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

// ── Facebook Pages ────────────────────────────────────────────────
// followers_count + fan_count from Page object.
// Reach via page_impressions_unique (requires read_insights scope).
export async function fetchFacebookMetrics(
  pageAccessToken: string,
  pageId: string
): Promise<Metrics> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v23.0/${pageId}?fields=followers_count,fan_count&access_token=${encodeURIComponent(pageAccessToken)}`,
      { signal: timeout(TIMEOUT) }
    );
    if (!res.ok) return EMPTY_METRICS;
    const data = await res.json();
    const followers = Number(data.followers_count ?? data.fan_count) || 0;

    let reach = 0;
    try {
      const inRes = await fetch(
        `https://graph.facebook.com/v23.0/${pageId}/insights?metric=page_impressions_unique&period=days_28&access_token=${encodeURIComponent(pageAccessToken)}`,
        { signal: timeout(TIMEOUT) }
      );
      if (inRes.ok) {
        const inData = await inRes.json();
        const values = inData.data?.[0]?.values ?? [];
        reach = values.reduce((acc: number, v: { value?: number }) => acc + (Number(v.value) || 0), 0);
      }
    } catch {
      // ignore, keep 0
    }

    return {
      views: 0,
      likes: 0,
      shares: 0,
      followers,
      reach,
      monetization: 0,
      comments: 0,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

// ── Instagram Business ────────────────────────────────────────────
// Basic: followers_count, media_count via Graph API.
// Insights (reach) via /{ig-user-id}/insights.
// Per-post likes/comments summed from recent media.
export async function fetchInstagramMetrics(
  accessToken: string,
  igUserId: string
): Promise<Metrics> {
  try {
    const profRes = await fetch(
      `https://graph.instagram.com/v23.0/${igUserId}?fields=followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`,
      { signal: timeout(TIMEOUT) }
    );
    if (!profRes.ok) return EMPTY_METRICS;
    const prof = await profRes.json();
    const followers = Number(prof.followers_count) || 0;

    let likes = 0;
    let comments = 0;
    try {
      const mRes = await fetch(
        `https://graph.instagram.com/v23.0/${igUserId}/media?fields=like_count,comments_count&limit=25&access_token=${encodeURIComponent(accessToken)}`,
        { signal: timeout(TIMEOUT) }
      );
      if (mRes.ok) {
        const mData = await mRes.json();
        for (const m of mData.data ?? []) {
          likes += Number(m.like_count) || 0;
          comments += Number(m.comments_count) || 0;
        }
      }
    } catch {
      // ignore
    }

    let reach = 0;
    try {
      const inRes = await fetch(
        `https://graph.instagram.com/v23.0/${igUserId}/insights?metric=reach&period=days_28&metric_type=total_value&access_token=${encodeURIComponent(accessToken)}`,
        { signal: timeout(TIMEOUT) }
      );
      if (inRes.ok) {
        const inData = await inRes.json();
        reach = Number(inData.data?.[0]?.total_value?.value) || 0;
      }
    } catch {
      // ignore
    }

    return {
      views: 0,
      likes,
      shares: 0,
      followers,
      reach,
      monetization: 0,
      comments,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

// ── Threads ───────────────────────────────────────────────────────
// Account insights: views, likes, replies, reposts, quotes, followers_count.
// Requires threads_manage_insights scope.
export async function fetchThreadsMetrics(
  accessToken: string,
  threadsUserId: string
): Promise<Metrics> {
  try {
    const res = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count&access_token=${encodeURIComponent(accessToken)}`,
      { signal: timeout(TIMEOUT) }
    );
    if (!res.ok) return EMPTY_METRICS;
    const data = await res.json();

    const byName = new Map<string, number>();
    for (const entry of data.data ?? []) {
      const name = entry.name as string;
      let val = 0;
      if (name === "followers_count") {
        val = Number(entry.total_value?.value) || 0;
      } else {
        const values = entry.values ?? [];
        val = values.reduce((a: number, v: { value?: number }) => a + (Number(v.value) || 0), 0);
        if (entry.total_value?.value != null) val = Number(entry.total_value.value) || val;
      }
      byName.set(name, val);
    }

    const shares = (byName.get("reposts") || 0) + (byName.get("quotes") || 0);

    return {
      views: byName.get("views") || 0,
      likes: byName.get("likes") || 0,
      shares,
      followers: byName.get("followers_count") || 0,
      reach: 0,
      monetization: 0,
      comments: byName.get("replies") || 0,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

// ── Bluesky ───────────────────────────────────────────────────────
// Profile: followersCount, postsCount. Sum likeCount+repostCount+replyCount over recent feed.
export async function fetchBlueskyMetrics(
  accessToken: string,
  did: string,
  pdsEndpoint: string
): Promise<Metrics> {
  try {
    const profRes = await fetch(
      `${pdsEndpoint}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout(TIMEOUT) }
    );
    if (!profRes.ok) return EMPTY_METRICS;
    const prof = await profRes.json();
    const followers = Number(prof.followersCount) || 0;

    let likes = 0;
    let shares = 0;
    let comments = 0;
    try {
      const feedRes = await fetch(
        `${pdsEndpoint}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=50`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout(TIMEOUT) }
      );
      if (feedRes.ok) {
        const feed = await feedRes.json();
        for (const item of feed.feed ?? []) {
          const post = item.post ?? {};
          likes += Number(post.likeCount) || 0;
          shares += Number(post.repostCount) || 0;
          comments += Number(post.replyCount) || 0;
        }
      }
    } catch {
      // feed fetch failed, keep zeros
    }

    return {
      views: 0,
      likes,
      shares,
      followers,
      reach: 0,
      monetization: 0,
      comments,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

// ── Mastodon ──────────────────────────────────────────────────────
// verify_credentials → followers_count, statuses_count.
// Sum favourites_count + reblogs_count + replies_count across recent statuses.
export async function fetchMastodonMetrics(
  instance: string,
  accessToken: string,
  accountId?: string
): Promise<Metrics> {
  try {
    const vcRes = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: timeout(TIMEOUT),
    });
    if (!vcRes.ok) return EMPTY_METRICS;
    const vc = await vcRes.json();
    const followers = Number(vc.followers_count) || 0;
    const id = accountId || String(vc.id ?? "");

    let likes = 0;
    let shares = 0;
    let comments = 0;
    if (id) {
      try {
        const stRes = await fetch(
          `${instance}/api/v1/accounts/${id}/statuses?limit=40&exclude_reblogs=true`,
          { headers: { Authorization: `Bearer ${accessToken}` }, signal: timeout(TIMEOUT) }
        );
        if (stRes.ok) {
          const statuses = await stRes.json();
          for (const s of statuses ?? []) {
            likes += Number(s.favourites_count) || 0;
            shares += Number(s.reblogs_count) || 0;
            comments += Number(s.replies_count) || 0;
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      views: 0,
      likes,
      shares,
      followers,
      reach: 0,
      monetization: 0,
      comments,
    };
  } catch {
    return EMPTY_METRICS;
  }
}

export function sumMetrics(list: Metrics[]): Metrics {
  const out: Metrics = { ...EMPTY_METRICS };
  const keys: (keyof Metrics)[] = [
    "views",
    "likes",
    "shares",
    "followers",
    "reach",
    "monetization",
    "comments",
  ];
  for (const k of keys) {
    let total = 0;
    let any = false;
    for (const m of list) {
      if (m[k] != null) {
        total += m[k] as number;
        any = true;
      }
    }
    out[k] = any ? total : null;
  }
  return out;
}
