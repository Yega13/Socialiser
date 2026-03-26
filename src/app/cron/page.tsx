import { createClient } from "@supabase/supabase-js";

// Fully self-contained cron page — no imports from "use server" files.
// An external cron service hits this URL every minute with the secret key.
//
// TWO-PHASE SCHEDULING:
//   Phase 1 (PREPARE): Pick up posts up to 6 min before scheduled_at.
//     Create media containers, upload videos, wait for IG processing.
//     All heavy work happens here — BEFORE the scheduled time.
//   Phase 2 (PUBLISH): Sleep until exact scheduled_at, then fire the
//     lightweight publish/upload call. Posts go out on the exact second.

export const dynamic = "force-dynamic";

// ── Token refresh helpers ────────────────────────────────────────

async function refreshYouTubeToken(
  refreshToken: string
): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token ?? null;
}

async function refreshInstagramToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?` +
      new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: currentToken,
      })
  );
  const data = await res.json();
  if (data.access_token) {
    return {
      access_token: data.access_token,
      expires_in: data.expires_in ?? 5184000,
    };
  }
  return null;
}

// ── Instagram container helpers ──────────────────────────────────

async function createIgContainer(
  accessToken: string,
  igUserId: string,
  params: Record<string, string>
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: accessToken }),
    }
  );
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: `API non-JSON (${res.status}): ${text.slice(0, 200)}` };
  }
  if (!data.id) {
    const detail = data.error
      ? `[${data.error.code}] ${data.error.message}`
      : JSON.stringify(data);
    return { error: `Container failed (${res.status}): ${detail}` };
  }
  return { id: data.id };
}

async function waitForContainer(
  accessToken: string,
  containerId: string
): Promise<string | null> {
  let lastStatus = "UNKNOWN";
  let apiErrors = 0;
  // 240 iterations × 2s = 8 minutes max wait (large videos need time)
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(
        `https://graph.instagram.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
      );
      if (!res.ok) {
        apiErrors++;
        if (res.status === 429) await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const data = await res.json();
      if (data.error) {
        apiErrors++;
        continue;
      }
      lastStatus = data.status_code || "UNKNOWN";
      if (data.status_code === "FINISHED") return null;
      if (data.status_code === "ERROR")
        return `Media processing failed${data.status ? `: ${data.status}` : ""}`;
      if (data.status_code === "EXPIRED") return "Media container expired";
    } catch {
      apiErrors++;
    }
  }
  return `Media processing timed out (8min). Last status: ${lastStatus}, API errors: ${apiErrors}`;
}

// ── Phase 1: PREPARE (heavy work — runs before scheduled time) ──

/** Prepare a single IG post/reel/story — returns containerId ready to publish */
async function prepareInstagramSingle(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrl: string,
  isVideo: boolean,
  postType: "post" | "reel" | "story"
): Promise<{ containerId?: string; error?: string }> {
  const params: Record<string, string> = {};
  // Stories don't support captions via API
  if (postType !== "story") params.caption = caption;

  if (postType === "story") {
    params.media_type = "STORIES";
    if (isVideo) params.video_url = mediaUrl;
    else params.image_url = mediaUrl;
  } else if (isVideo) {
    params.media_type = postType === "reel" ? "REELS" : "VIDEO";
    params.video_url = mediaUrl;
  } else {
    params.image_url = mediaUrl;
  }

  const container = await createIgContainer(accessToken, igUserId, params);
  if (!container.id) return { error: container.error };

  const waitErr = await waitForContainer(accessToken, container.id);
  if (waitErr) return { error: waitErr };

  return { containerId: container.id };
}

/** Prepare a carousel — returns the carousel containerId ready to publish */
async function prepareInstagramCarousel(
  accessToken: string,
  igUserId: string,
  caption: string,
  items: { url: string; isVideo: boolean }[]
): Promise<{ containerId?: string; error?: string }> {
  if (items.length < 2 || items.length > 10) {
    return { error: "Carousel requires 2-10 items" };
  }

  // Create ALL child containers
  const containers: { id: string; index: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const params: Record<string, string> = { is_carousel_item: "true" };
    if (item.isVideo) {
      params.media_type = "VIDEO";
      params.video_url = item.url;
    } else {
      params.image_url = item.url;
    }
    const container = await createIgContainer(accessToken, igUserId, params);
    if (!container.id)
      return { error: `Item ${i + 1}: ${container.error}` };
    containers.push({ id: container.id, index: i });
  }

  // Wait for ALL containers IN PARALLEL (Instagram processes them simultaneously)
  const waitResults = await Promise.all(
    containers.map(async (c) => ({
      index: c.index,
      error: await waitForContainer(accessToken, c.id),
    }))
  );
  const firstFailure = waitResults.find((r) => r.error);
  if (firstFailure) {
    return { error: `Item ${firstFailure.index + 1}: ${firstFailure.error}` };
  }

  // Create carousel container
  const carouselContainer = await createIgContainer(accessToken, igUserId, {
    media_type: "CAROUSEL",
    caption,
    children: containers.map((c) => c.id).join(","),
  });
  if (!carouselContainer.id) return { error: carouselContainer.error };

  // Wait for carousel container
  const carouselWaitErr = await waitForContainer(
    accessToken,
    carouselContainer.id
  );
  if (carouselWaitErr) return { error: `Carousel: ${carouselWaitErr}` };

  return { containerId: carouselContainer.id };
}

// ── Phase 2: PUBLISH (lightweight — runs at exact scheduled time) ──

/** Publish an already-prepared IG container */
async function publishInstagramContainer(
  accessToken: string,
  igUserId: string,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (!publishData.id) {
    return {
      success: false,
      error:
        publishData.error?.message ??
        `Publish failed: ${JSON.stringify(publishData)}`,
    };
  }
  return { success: true };
}

// ── Sleep helper ─────────────────────────────────────────────────

/** Sleep until the exact target time. No-ops if target is in the past. */
async function sleepUntil(targetMs: number): Promise<void> {
  const delay = targetMs - Date.now();
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
}

// ── Main cron page ──────────────────────────────────────────────

export default async function CronPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  const envName = "CRON_SECRET";
  const secret = process.env[envName];
  if (!key || key !== secret) {
    return <p>Unauthorized</p>;
  }

  // Admin client (service role bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Helper: resolve a stored value (path or legacy URL) to a signed URL
  async function resolveToSignedUrl(stored: string): Promise<string> {
    if (!stored.startsWith("http")) {
      const { data } = await supabase.storage
        .from("media")
        .createSignedUrl(stored, 3600);
      return data?.signedUrl || "";
    }
    const pathMatch = stored.match(
      /\/storage\/v1\/object\/(?:public|sign)\/media\/([^?]+)/
    );
    if (pathMatch) {
      const { data } = await supabase.storage
        .from("media")
        .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);
      return data?.signedUrl || stored;
    }
    return stored;
  }

  // ── Fetch posts due within the next 15 minutes ─────────────────
  // Images prep in <5s so extra window is harmless.
  // Video carousels (up to 10 items) need the full window for processing.
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);
  const { data: posts, error: fetchErr } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", windowEnd.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  if (fetchErr || !posts || posts.length === 0) {
    return (
      <p>
        OK: 0 found.{" "}
        {fetchErr ? `Error: ${fetchErr.message}` : "No posts due."}
      </p>
    );
  }

  const log: string[] = [
    `${now.toISOString()} — Found ${posts.length} post(s) due within 15 min`,
  ];
  let processed = 0;

  for (const post of posts) {
    const scheduledTime = new Date(post.scheduled_at).getTime();

    // ── Claim post (optimistic lock) ──
    const { data: claimed } = await supabase
      .from("scheduled_posts")
      .update({ status: "processing" })
      .eq("id", post.id)
      .eq("status", "pending")
      .select("id");

    if (!claimed || claimed.length === 0) {
      log.push(`"${post.title}": skipped (already claimed)`);
      continue;
    }

    // ── Fetch user's connected platforms ──
    const { data: connectedPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", post.user_id)
      .eq("is_active", true);

    // Track prepared state per platform
    const prepared: Record<
      string,
      | { type: "ig"; containerId: string }
      | { type: "yt"; videoBlob: Blob; metadata: object; thumbBlob?: Blob }
      | { type: "error"; error: string }
    > = {};

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: PREPARE — heavy work, runs before scheduled time
    // ═══════════════════════════════════════════════════════════════

    for (const platformId of post.platforms as string[]) {
      const conn = connectedPlatforms?.find(
        (c: { platform: string }) => c.platform === platformId
      );
      if (!conn) {
        prepared[platformId] = { type: "error", error: "Not connected" };
        continue;
      }

      let accessToken: string = conn.access_token;

      // Refresh token if expired
      if (
        conn.token_expires_at &&
        new Date(conn.token_expires_at) <= new Date()
      ) {
        if (platformId === "youtube" && conn.refresh_token) {
          const newToken = await refreshYouTubeToken(conn.refresh_token);
          if (newToken) {
            accessToken = newToken;
            await supabase
              .from("connected_platforms")
              .update({
                access_token: newToken,
                token_expires_at: new Date(
                  Date.now() + 3600 * 1000
                ).toISOString(),
              })
              .eq("id", conn.id);
          } else {
            prepared[platformId] = {
              type: "error",
              error: "Token refresh failed",
            };
            continue;
          }
        } else if (platformId === "instagram") {
          const refreshed = await refreshInstagramToken(accessToken);
          if (refreshed) {
            accessToken = refreshed.access_token;
            await supabase
              .from("connected_platforms")
              .update({
                access_token: refreshed.access_token,
                token_expires_at: new Date(
                  Date.now() + refreshed.expires_in * 1000
                ).toISOString(),
              })
              .eq("id", conn.id);
          } else {
            prepared[platformId] = {
              type: "error",
              error: "Token refresh failed",
            };
            continue;
          }
        }
      }

      // ── Prepare YouTube ──
      if (platformId === "youtube") {
        const videoIndex = (
          post.media_types as string[] | null
        )?.findIndex((t: string) => t.startsWith("video/"));
        if (
          videoIndex === undefined ||
          videoIndex === -1 ||
          !post.media_urls?.[videoIndex]
        ) {
          prepared[platformId] = {
            type: "error",
            error: "No video file found",
          };
          continue;
        }
        try {
          const fetchUrl = await resolveToSignedUrl(
            post.media_urls[videoIndex]
          );
          if (!fetchUrl) {
            prepared[platformId] = {
              type: "error",
              error: "Failed to create signed URL for video",
            };
            continue;
          }

          const videoRes = await fetch(fetchUrl);
          if (!videoRes.ok) {
            prepared[platformId] = {
              type: "error",
              error: "Failed to fetch video from storage",
            };
            continue;
          }
          const videoBlob = await videoRes.blob();
          const metadata = {
            snippet: {
              title: post.title || "New Video",
              description: post.description || "",
              categoryId: "22",
            },
            status: { privacyStatus: "public" },
          };

          // Pre-fetch thumbnail too
          let thumbBlob: Blob | undefined;
          if (post.thumbnail_url) {
            const thumbFetchUrl = await resolveToSignedUrl(
              post.thumbnail_url
            );
            if (thumbFetchUrl) {
              const thumbRes = await fetch(thumbFetchUrl);
              if (thumbRes.ok) thumbBlob = await thumbRes.blob();
            }
          }

          prepared[platformId] = {
            type: "yt",
            videoBlob,
            metadata,
            thumbBlob,
          };
          log.push(`"${post.title}" YouTube: prepared (video fetched)`);
        } catch (err) {
          prepared[platformId] = {
            type: "error",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // ── Prepare Instagram ──
      if (platformId === "instagram") {
        if (!post.media_urls || post.media_urls.length === 0) {
          prepared[platformId] = {
            type: "error",
            error: "No media files found",
          };
          continue;
        }
        if (!conn.platform_user_id) {
          prepared[platformId] = {
            type: "error",
            error: "Instagram account ID missing. Reconnect.",
          };
          continue;
        }

        const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;

        // Resolve stored paths/URLs to signed URLs
        const items: { url: string; isVideo: boolean }[] = [];
        for (let i = 0; i < (post.media_urls as string[]).length; i++) {
          const stored = (post.media_urls as string[])[i];
          const isVideo =
            (post.media_types as string[] | null)?.[i]?.startsWith(
              "video/"
            ) ?? false;
          const signedUrl = await resolveToSignedUrl(stored);
          if (!signedUrl) {
            prepared[platformId] = {
              type: "error",
              error: `Failed to create signed URL for item ${i + 1}`,
            };
            break;
          }
          items.push({ url: signedUrl, isVideo });
        }
        if (prepared[platformId]?.type === "error") continue;

        const igPostType =
          (post.ig_post_type as "post" | "reel" | "story" | undefined) ??
          "reel";

        let prepResult: { containerId?: string; error?: string };
        if (items.length === 1) {
          prepResult = await prepareInstagramSingle(
            accessToken,
            conn.platform_user_id,
            caption,
            items[0].url,
            items[0].isVideo,
            igPostType
          );
        } else {
          prepResult = await prepareInstagramCarousel(
            accessToken,
            conn.platform_user_id,
            caption,
            items
          );
        }

        if (prepResult.error || !prepResult.containerId) {
          prepared[platformId] = {
            type: "error",
            error: prepResult.error ?? "Unknown preparation error",
          };
        } else {
          prepared[platformId] = {
            type: "ig",
            containerId: prepResult.containerId,
          };
          log.push(
            `"${post.title}" Instagram: prepared (container ${prepResult.containerId})`
          );
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SLEEP until exact scheduled time
    // ═══════════════════════════════════════════════════════════════

    const prepDone = Date.now();
    const waitMs = scheduledTime - prepDone;
    if (waitMs > 0) {
      log.push(
        `"${post.title}": prep done, sleeping ${Math.round(waitMs / 1000)}s until ${new Date(scheduledTime).toISOString()}`
      );
    }
    await sleepUntil(scheduledTime);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: PUBLISH — lightweight calls at exact scheduled time
    // ═══════════════════════════════════════════════════════════════

    const results: Record<string, { success: boolean; error?: string }> = {};
    const publishTime = new Date().toISOString();

    for (const platformId of post.platforms as string[]) {
      const prep = prepared[platformId];
      if (!prep) {
        results[platformId] = { success: false, error: "Not prepared" };
        continue;
      }
      if (prep.type === "error") {
        results[platformId] = { success: false, error: prep.error };
        continue;
      }

      // Get fresh access token (may have been refreshed in phase 1)
      const conn = connectedPlatforms?.find(
        (c: { platform: string }) => c.platform === platformId
      );

      // ── Publish YouTube ──
      if (prep.type === "yt" && conn) {
        try {
          const form = new FormData();
          form.append(
            "metadata",
            new Blob([JSON.stringify(prep.metadata)], {
              type: "application/json",
            })
          );
          form.append("video", prep.videoBlob);

          const ytRes = await fetch(
            "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${conn.access_token}` },
              body: form,
            }
          );
          if (!ytRes.ok) {
            const errData = await ytRes.json().catch(() => ({}));
            results[platformId] = {
              success: false,
              error:
                errData?.error?.message ?? `YouTube error ${ytRes.status}`,
            };
          } else {
            const ytData = await ytRes.json();
            // Upload thumbnail
            if (prep.thumbBlob && ytData.id) {
              await fetch(
                `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${ytData.id}&uploadType=media`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${conn.access_token}`,
                    "Content-Type": "image/jpeg",
                  },
                  body: prep.thumbBlob,
                }
              );
            }
            results[platformId] = { success: true };
          }
        } catch (err) {
          results[platformId] = {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // ── Publish Instagram ──
      if (prep.type === "ig" && conn) {
        results[platformId] = await publishInstagramContainer(
          conn.access_token,
          conn.platform_user_id!,
          prep.containerId
        );
      }
    }

    const allFailed = Object.values(results).every((r) => !r.success);
    await supabase
      .from("scheduled_posts")
      .update({
        status: allFailed ? "failed" : "completed",
        results,
      })
      .eq("id", post.id);

    log.push(
      `"${post.title}": published at ${publishTime} → ${JSON.stringify(results)}`
    );
    processed++;
  }

  return (
    <div>
      <p>
        OK: {processed} processed, {posts.length - processed} skipped
      </p>
      <pre style={{ fontSize: "12px", whiteSpace: "pre-wrap" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}
