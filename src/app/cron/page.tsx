import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════
// STATE-MACHINE CRON — Cloudflare Workers compatible (each run < 30s)
//
// Three fast steps per cron run, no sleeping, no long waits:
//   Step 1 PREPARE:  pending → preparing   (create IG + Threads containers)
//   Step 2 POLL:     preparing → prepared  (check container status, few API calls)
//   Step 3 PUBLISH:  prepared → completed  (publish at scheduled time, fast calls only)
//
// State persists in prepared_containers JSONB column between runs.
// Run every minute via external cron service.
// ═══════════════════════════════════════════════════════════════════════════

type IgContainerState = {
  type: "single" | "carousel";
  containerId?: string; // main container (single) or carousel parent
  childIds?: string[]; // carousel child containers only
  ready: boolean;
};

type ThreadsContainerState = {
  type: "text" | "single" | "carousel";
  containerId?: string; // main container or carousel parent
  childIds?: string[]; // carousel child containers
  ready: boolean;
};

type BskyPreparedState = {
  imageBlobs?: Record<string, unknown>[]; // uploaded blob refs
  videoBlob?: Record<string, unknown>; // uploaded video blob ref
  videoJobId?: string; // polling job ID for video processing
  ready: boolean;
};

type PreparedContainers = {
  instagram?: IgContainerState;
  threads?: ThreadsContainerState;
  bluesky?: BskyPreparedState;
  _errors?: Record<string, string>; // per-platform prep errors
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ── Timeout-aware fetch (prevents API hangs from killing cron) ──────────────
async function timedFetch(
  url: string | URL,
  init?: RequestInit,
  timeoutMs = 10_000
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await globalThis.fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── Token helpers ────────────────────────────────────────────────────────────

async function refreshYouTubeToken(refreshToken: string): Promise<string | null> {
  const res = await timedFetch("https://oauth2.googleapis.com/token", {
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
  const res = await timedFetch(
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

async function refreshThreadsToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await timedFetch(
    `https://graph.threads.net/refresh_access_token?` +
      new URLSearchParams({
        grant_type: "th_refresh_token",
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

// ── Instagram API helpers ────────────────────────────────────────────────────

async function createIgContainer(
  accessToken: string,
  igUserId: string,
  params: Record<string, string>
): Promise<{ id?: string; error?: string }> {
  const res = await timedFetch(
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
    return { error: `Non-JSON (${res.status}): ${text.slice(0, 200)}` };
  }
  if (!data.id) {
    const detail = data.error
      ? `[${data.error.code}] ${data.error.message}`
      : JSON.stringify(data);
    return { error: `Container failed (${res.status}): ${detail}` };
  }
  return { id: data.id };
}

async function checkIgContainerStatus(
  accessToken: string,
  containerId: string
): Promise<"FINISHED" | "ERROR" | "EXPIRED" | "IN_PROGRESS"> {
  try {
    const res = await timedFetch(
      `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    if (!res.ok) return "IN_PROGRESS";
    const data = await res.json();
    if (data.status_code === "FINISHED") return "FINISHED";
    if (data.status_code === "ERROR") return "ERROR";
    if (data.status_code === "EXPIRED") return "EXPIRED";
    return "IN_PROGRESS";
  } catch {
    return "IN_PROGRESS";
  }
}

async function publishIgContainer(
  accessToken: string,
  igUserId: string,
  containerId: string
): Promise<{ success: boolean; error?: string }> {
  const res = await timedFetch(
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
  const data = await res.json();
  if (!data.id) {
    return {
      success: false,
      error:
        data.error?.message ?? `Publish failed: ${JSON.stringify(data)}`,
    };
  }
  return { success: true };
}

// ── Main cron page ───────────────────────────────────────────────────────────

export default async function CronPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  if (!key || key !== process.env.CRON_SECRET) {
    return <p>Unauthorized</p>;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const log: string[] = [`${new Date().toISOString()} — Cron start`];
  const now = new Date();
  const cronStart = Date.now();

  // Helper: resolve a storage path or legacy URL to a 2-hour signed URL
  async function resolve(stored: string): Promise<string> {
    if (!stored.startsWith("http")) {
      const { data } = await supabase.storage
        .from("media")
        .createSignedUrl(stored, 7200);
      return data?.signedUrl || "";
    }
    const m = stored.match(
      /\/storage\/v1\/object\/(?:public|sign)\/media\/([^?]+)/
    );
    if (m) {
      const { data } = await supabase.storage
        .from("media")
        .createSignedUrl(decodeURIComponent(m[1]), 7200);
      return data?.signedUrl || stored;
    }
    return stored;
  }

  // Helper: get a valid access token, refreshing if expired
  async function getFreshToken(
    conn: Row,
    platformId: string
  ): Promise<string | null> {
    const isExpired =
      conn.token_expires_at &&
      new Date(conn.token_expires_at as string) <= new Date();
    if (!isExpired) return conn.access_token as string;

    if (platformId === "youtube" && conn.refresh_token) {
      const newToken = await refreshYouTubeToken(conn.refresh_token as string);
      if (newToken) {
        await supabase
          .from("connected_platforms")
          .update({
            access_token: newToken,
            token_expires_at: new Date(
              Date.now() + 3600 * 1000
            ).toISOString(),
          })
          .eq("id", conn.id);
        return newToken;
      }
      return null;
    }

    if (platformId === "instagram") {
      const refreshed = await refreshInstagramToken(
        conn.access_token as string
      );
      if (refreshed) {
        await supabase
          .from("connected_platforms")
          .update({
            access_token: refreshed.access_token,
            token_expires_at: new Date(
              Date.now() + refreshed.expires_in * 1000
            ).toISOString(),
          })
          .eq("id", conn.id);
        return refreshed.access_token;
      }
      return null;
    }

    if (platformId === "threads") {
      const refreshed = await refreshThreadsToken(
        conn.access_token as string
      );
      if (refreshed) {
        await supabase
          .from("connected_platforms")
          .update({
            access_token: refreshed.access_token,
            token_expires_at: new Date(
              Date.now() + refreshed.expires_in * 1000
            ).toISOString(),
          })
          .eq("id", conn.id);
        return refreshed.access_token;
      }
      return null;
    }

    if (platformId === "bluesky" && conn.refresh_token) {
      const res = await timedFetch("https://bsky.social/xrpc/com.atproto.server.refreshSession", {
        method: "POST",
        headers: { Authorization: `Bearer ${conn.refresh_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accessJwt) {
          await supabase
            .from("connected_platforms")
            .update({
              access_token: data.accessJwt,
              refresh_token: data.refreshJwt,
              token_expires_at: new Date(
                Date.now() + 2 * 3600 * 1000
              ).toISOString(),
            })
            .eq("id", conn.id);
          return data.accessJwt;
        }
      }
      return null;
    }

    return conn.access_token as string;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RECOVERY: Reset stuck posts from crashed cron runs
  // ═══════════════════════════════════════════════════════════════════════

  {
    // Posts stuck in "publishing" > 5 min → cron crashed mid-publish → retry
    const { data: stuckPub } = await supabase
      .from("scheduled_posts")
      .update({ status: "prepared" })
      .eq("status", "publishing")
      .lt("scheduled_at", new Date(now.getTime() - 5 * 60_000).toISOString())
      .select("id, title");
    if (stuckPub?.length)
      log.push(`Recovery: ${stuckPub.length} stuck publishing → prepared`);

    // Posts stuck in "preparing" > 20 min → container creation failed → retry
    const { data: stuckPrep } = await supabase
      .from("scheduled_posts")
      .update({ status: "pending", prepared_containers: null })
      .eq("status", "preparing")
      .lt("scheduled_at", new Date(now.getTime() - 20 * 60_000).toISOString())
      .select("id, title");
    if (stuckPrep?.length)
      log.push(`Recovery: ${stuckPrep.length} stuck preparing → pending`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIORITY: Check if any prepared posts are due NOW — if so, skip to PUBLISH
  // ═══════════════════════════════════════════════════════════════════════

  const { count: urgentCount } = await supabase
    .from("scheduled_posts")
    .select("*", { count: "exact", head: true })
    .eq("status", "prepared")
    .lte("scheduled_at", now.toISOString());
  const hasUrgentPublish = (urgentCount ?? 0) > 0;
  if (hasUrgentPublish)
    log.push(`PRIORITY: ${urgentCount} prepared post(s) due NOW, skipping PREPARE/POLL`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: PREPARE (pending → preparing)
  // Create IG containers for posts due in the next 20 minutes.
  // Fast: just creates containers (kicks off IG processing), then done.
  // ═══════════════════════════════════════════════════════════════════════

  const windowEnd = new Date(now.getTime() + 20 * 60 * 1000);
  const { data: pendingPosts } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", windowEnd.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  for (const post of pendingPosts ?? []) {
    if (hasUrgentPublish) {
      log.push("PREPARE: urgent publish pending, deferring PREPARE");
      break;
    }
    if (Date.now() - cronStart > 15_000) {
      log.push("PREPARE: time limit (15s), deferring remaining");
      break;
    }
    // Optimistic lock: claim before processing
    const { data: claimed } = await supabase
      .from("scheduled_posts")
      .update({ status: "preparing" })
      .eq("id", post.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;

    const { data: connPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", post.user_id)
      .eq("is_active", true);

    const preparedContainers: PreparedContainers = {};
    const prepErrors: Record<string, string> = {}; // per-platform errors
    const hasIg = (post.platforms as string[]).includes("instagram");

    if (hasIg) {
      const conn = connPlatforms?.find(
        (c: Row) => c.platform === "instagram"
      );
      if (!conn) {
        prepErrors.instagram = "Not connected";
      } else if (!conn.platform_user_id) {
        prepErrors.instagram = "Account ID missing. Reconnect.";
      } else if (!post.media_urls?.length) {
        prepErrors.instagram = "No media files found";
      } else {
        const accessToken = await getFreshToken(conn, "instagram");
        if (!accessToken) {
          prepErrors.instagram = "Token refresh failed";
        } else {
          const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
          const igPostType =
            (post.ig_post_type as "post" | "reel" | "story") ?? "reel";

          // Resolve all media URLs in parallel
          const resolvedItems = await Promise.all(
            (post.media_urls as string[]).map(async (stored, i) => ({
              url: await resolve(stored),
              isVideo:
                (post.media_types as string[] | null)?.[i]?.startsWith(
                  "video/"
                ) ?? false,
            }))
          );
          const failedUrlIdx = resolvedItems.findIndex((item) => !item.url);
          if (failedUrlIdx !== -1) {
            prepErrors.instagram = `Failed to resolve URL for item ${failedUrlIdx + 1}`;
          }
          const items = resolvedItems;

          if (!prepErrors.instagram) {
            if (items.length === 1) {
              // Single post/reel/story: create one container
              const params: Record<string, string> = {};
              if (igPostType !== "story") params.caption = caption;

              if (igPostType === "story") {
                params.media_type = "STORIES";
                if (items[0].isVideo) params.video_url = items[0].url;
                else params.image_url = items[0].url;
              } else if (items[0].isVideo) {
                params.media_type =
                  igPostType === "reel" ? "REELS" : "VIDEO";
                params.video_url = items[0].url;
              } else {
                params.image_url = items[0].url;
              }

              const container = await createIgContainer(
                accessToken,
                conn.platform_user_id,
                params
              );
              if (!container.id) {
                prepErrors.instagram = container.error ?? "Container failed";
              } else {
                preparedContainers.instagram = {
                  type: "single",
                  containerId: container.id,
                  ready: false,
                };
                log.push(
                  `"${post.title}" IG single container: ${container.id}`
                );
              }
            } else {
              // Carousel: create all child containers in parallel
              // (IG requires all children to be FINISHED before creating parent)
              const containerResults = await Promise.all(
                items.map(async (item, i) => {
                  const params: Record<string, string> = {
                    is_carousel_item: "true",
                  };
                  if (item.isVideo) {
                    params.media_type = "VIDEO";
                    params.video_url = item.url;
                  } else {
                    params.image_url = item.url;
                  }
                  const result = await createIgContainer(
                    accessToken,
                    conn.platform_user_id,
                    params
                  );
                  return { index: i, ...result };
                })
              );
              const failedItem = containerResults.find((r) => !r.id);
              if (failedItem) {
                prepErrors.instagram = `Carousel item ${failedItem.index + 1}: ${failedItem.error}`;
              } else {
                const childIds = containerResults.map((r) => r.id as string);
                preparedContainers.instagram = {
                  type: "carousel",
                  childIds,
                  ready: false,
                };
                log.push(
                  `"${post.title}" IG carousel: ${childIds.length} child containers created`
                );
              }
            }
          }
        }
      }
    }

    // ── Threads container preparation ──
    const hasThreads = (post.platforms as string[]).includes("threads");
    if (hasThreads) {
      const conn = connPlatforms?.find((c: Row) => c.platform === "threads");
      if (!conn) {
        prepErrors.threads = "Not connected";
        log.push(`"${post.title}" Threads: not connected`);
      } else {
        const threadsToken = await getFreshToken(conn, "threads");
        if (!threadsToken) {
          prepErrors.threads = "Token refresh failed — reconnect Threads";
          log.push(`"${post.title}" Threads: token refresh failed`);
        } else {
          const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
          const THREADS_API = "https://graph.threads.net/v1.0";

          if (!post.media_urls || (post.media_urls as string[]).length === 0) {
            // Text-only: create container NOW so PUBLISH is a single fast call
            const cRes = await timedFetch(`${THREADS_API}/me/threads`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ media_type: "TEXT", text: caption, access_token: threadsToken }),
            });
            const cData = await cRes.json().catch(() => ({}));
            if (cData.id) {
              // Text containers have no processing wait — mark ready immediately
              preparedContainers.threads = { type: "text", containerId: cData.id, ready: true };
              log.push(`"${post.title}" Threads text container: ${cData.id}`);
            } else {
              prepErrors.threads = `Text container failed: ${cData.error?.message || "unknown"}`;
              log.push(`"${post.title}" Threads text container failed: ${cData.error?.message || "unknown"}`);
            }
          } else {
            // Resolve media URLs
            const resolvedItems = await Promise.all(
              (post.media_urls as string[]).map(async (stored, i) => ({
                url: await resolve(stored),
                isVideo: (post.media_types as string[] | null)?.[i]?.startsWith("video/") ?? false,
              }))
            );
            const failedUrlIdx = resolvedItems.findIndex((item) => !item.url);
            if (failedUrlIdx !== -1) {
              prepErrors.threads = `Failed to resolve media URL for item ${failedUrlIdx + 1}`;
              log.push(`"${post.title}" Threads: ${prepErrors.threads}`);
            } else if (resolvedItems.length === 1) {
              // Single media: create one container
              const params: Record<string, string> = { text: caption, access_token: threadsToken };
              if (resolvedItems[0].isVideo) {
                params.media_type = "VIDEO";
                params.video_url = resolvedItems[0].url;
              } else {
                params.media_type = "IMAGE";
                params.image_url = resolvedItems[0].url;
              }
              const cRes = await timedFetch(`${THREADS_API}/me/threads`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(params),
              });
              const cData = await cRes.json().catch(() => ({}));
              if (cData.id) {
                preparedContainers.threads = { type: "single", containerId: cData.id, ready: false };
                log.push(`"${post.title}" Threads single container: ${cData.id}`);
              } else {
                prepErrors.threads = `Container failed: ${cData.error?.message || "unknown"}`;
                log.push(`"${post.title}" Threads container failed: ${cData.error?.message || "unknown"}`);
              }
            } else {
              // Carousel: create all child containers in parallel
              const childResults = await Promise.all(
                resolvedItems.map(async (item) => {
                  const params: Record<string, string> = { is_carousel_item: "true", access_token: threadsToken };
                  if (item.isVideo) { params.media_type = "VIDEO"; params.video_url = item.url; }
                  else { params.media_type = "IMAGE"; params.image_url = item.url; }
                  const cRes = await timedFetch(`${THREADS_API}/me/threads`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams(params),
                  });
                  return cRes.json().catch(() => ({}));
                })
              );
              const failedChildIdx = childResults.findIndex((r) => !r.id);
              if (failedChildIdx !== -1) {
                const errMsg = childResults[failedChildIdx]?.error?.message || "unknown";
                prepErrors.threads = `Carousel item ${failedChildIdx + 1}: ${errMsg}`;
                log.push(`"${post.title}" Threads child ${failedChildIdx + 1} failed: ${errMsg}`);
              } else {
                const childIds = childResults.map((r) => r.id as string);
                preparedContainers.threads = { type: "carousel", childIds, ready: false };
                log.push(`"${post.title}" Threads carousel: ${childIds.length} children created`);
              }
            }
          }
        }
      }
    }

    // ── Bluesky media pre-upload ──
    const hasBluesky = (post.platforms as string[]).includes("bluesky");
    if (hasBluesky && post.media_urls && (post.media_urls as string[]).length > 0) {
      const conn = connPlatforms?.find((c: Row) => c.platform === "bluesky");
      if (conn) {
        const bskyToken = await getFreshToken(conn, "bluesky");
        if (bskyToken) {
          const BSKY_API = "https://bsky.social/xrpc";
          const imageBlobs: Record<string, unknown>[] = [];
          let videoBlob: Record<string, unknown> | undefined;
          let videoJobId: string | undefined;

          for (let i = 0; i < (post.media_urls as string[]).length; i++) {
            const stored = (post.media_urls as string[])[i];
            const mimeType = (post.media_types as string[] | null)?.[i] ?? "image/jpeg";
            const isVideo = mimeType.startsWith("video/");
            const fileUrl = await resolve(stored);
            if (!fileUrl) continue;

            if (isVideo && !videoBlob && !videoJobId) {
              // Video: upload to video.bsky.app
              let pdsHost = "bsky.social";
              let pdsEndpoint = "https://bsky.social";
              try {
                const plcRes = await timedFetch(`https://plc.directory/${encodeURIComponent(conn.platform_user_id)}`);
                if (plcRes.ok) {
                  const plcData = await plcRes.json();
                  const pdsService = plcData.service?.find((s: { id: string; serviceEndpoint: string }) => s.id === "#atproto_pds");
                  if (pdsService?.serviceEndpoint) {
                    pdsHost = new URL(pdsService.serviceEndpoint).host;
                    pdsEndpoint = pdsService.serviceEndpoint.replace(/\/$/, "");
                  }
                }
              } catch { /* fallback */ }

              const authRes = await timedFetch(
                `${pdsEndpoint}/xrpc/com.atproto.server.getServiceAuth?` + new URLSearchParams({
                  aud: `did:web:${pdsHost}`,
                  lxm: "com.atproto.repo.uploadBlob",
                  exp: String(Math.floor(Date.now() / 1000) + 1800),
                }),
                { headers: { Authorization: `Bearer ${bskyToken}` } }
              );
              if (authRes.ok) {
                const { token: svcToken } = await authRes.json();
                if (svcToken) {
                  const fileRes = await timedFetch(fileUrl, undefined, 20_000);
                  if (fileRes.ok) {
                    const buf = await fileRes.arrayBuffer();
                    const upRes = await timedFetch(
                      `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(conn.platform_user_id)}&name=${encodeURIComponent(stored.split("/").pop() || "video.mp4")}`,
                      { method: "POST", headers: { Authorization: `Bearer ${svcToken}`, "Content-Type": mimeType || "video/mp4" }, body: buf },
                      20_000
                    );
                    if (upRes.ok) {
                      const upData = await upRes.json();
                      if (upData.blob) videoBlob = upData.blob;
                      else if (upData.jobId) videoJobId = upData.jobId;
                      log.push(`"${post.title}" Bluesky video uploaded (jobId: ${upData.jobId || "immediate"})`);
                    }
                  }
                }
              }
              break; // Bluesky supports 1 video
            } else if (!isVideo && imageBlobs.length < 4) {
              // Image: upload blob
              const fileRes = await timedFetch(fileUrl);
              if (!fileRes.ok) continue;
              const buf = await fileRes.arrayBuffer();
              const upRes = await timedFetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
                method: "POST",
                headers: { Authorization: `Bearer ${bskyToken}`, "Content-Type": mimeType },
                body: buf,
              });
              if (upRes.ok) {
                const upData = await upRes.json();
                imageBlobs.push(upData.blob);
              }
            }
          }

          const bskyState: BskyPreparedState = { ready: false };
          if (imageBlobs.length > 0) { bskyState.imageBlobs = imageBlobs; bskyState.ready = true; }
          if (videoBlob) { bskyState.videoBlob = videoBlob; bskyState.ready = true; }
          if (videoJobId) { bskyState.videoJobId = videoJobId; }
          preparedContainers.bluesky = bskyState;
          log.push(`"${post.title}" Bluesky: ${imageBlobs.length} images, video: ${videoBlob ? "ready" : videoJobId ? "processing" : "none"}`);
        }
      }
    }

    // Store per-platform errors for the PUBLISH step
    if (Object.keys(prepErrors).length > 0) {
      preparedContainers._errors = prepErrors;
      log.push(`"${post.title}" prep errors: ${JSON.stringify(prepErrors)}`);
    }

    // Determine if any platform needs container preparation (polling)
    const needsPrep =
      (hasIg && !prepErrors.instagram && preparedContainers.instagram && !preparedContainers.instagram.ready) ||
      (hasThreads && !prepErrors.threads && preparedContainers.threads && !preparedContainers.threads.ready) ||
      (hasBluesky && !prepErrors.bluesky && preparedContainers.bluesky && !preparedContainers.bluesky.ready);

    // Check if EVERY selected platform failed during prepare
    // (if only some failed, let the survivors proceed through POLL/PUBLISH)
    const allPlatformsFailed = (post.platforms as string[]).every((p: string) => {
      if (p === "youtube") return false; // YouTube has no prepare step, can never fail here
      return !!prepErrors[p];
    });

    if (allPlatformsFailed) {
      // Every platform failed — mark post as failed with per-platform errors
      const failResults: Record<string, { success: boolean; error?: string }> = {};
      for (const p of post.platforms as string[]) {
        failResults[p] = { success: false, error: prepErrors[p] || "Preparation failed" };
      }
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", results: failResults })
        .eq("id", post.id);
      log.push(`"${post.title}": PREPARE FAILED — all platforms: ${JSON.stringify(prepErrors)}`);
    } else if (!needsPrep) {
      // All platforms ready or don't need containers — skip to prepared
      await supabase
        .from("scheduled_posts")
        .update({ status: "prepared", prepared_containers: preparedContainers })
        .eq("id", post.id);
      log.push(`"${post.title}": → prepared (no containers need polling)`);
    } else {
      await supabase
        .from("scheduled_posts")
        .update({
          status: "preparing",
          prepared_containers: preparedContainers,
        })
        .eq("id", post.id);
      log.push(`"${post.title}": → preparing`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: POLL (preparing → prepared)
  // Check IG + Threads container status + Bluesky video processing.
  // Fast: one status check API call per container per cron run.
  // ═══════════════════════════════════════════════════════════════════════

  const { data: preparingPosts } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "preparing")
    .limit(20);

  for (const post of preparingPosts ?? []) {
    if (hasUrgentPublish) {
      log.push("POLL: urgent publish pending, deferring POLL");
      break;
    }
    if (Date.now() - cronStart > 20_000) {
      log.push("POLL: time limit (20s), deferring remaining");
      break;
    }
    const containers = (
      post.prepared_containers ?? {}
    ) as PreparedContainers;
    const igState = containers.instagram;
    const threadsState = containers.threads;
    const bskyState = containers.bluesky;

    const { data: connPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", post.user_id)
      .eq("is_active", true);

    let error: string | null = null;
    const pollPrepErrors = containers._errors ?? {};
    const hasIgInPost = (post.platforms as string[]).includes("instagram");
    const hasThreadsInPost = (post.platforms as string[]).includes("threads");
    const hasBskyInPost = (post.platforms as string[]).includes("bluesky");

    // Check if PREPARE didn't finish at all (no containers AND no errors — means crash)
    // Applies to ANY post regardless of which platforms — Threads-only / Bluesky-only included
    const hasAnyState = !!igState || !!threadsState || !!bskyState;
    const needsAnyPrep = hasIgInPost || hasThreadsInPost || hasBskyInPost;
    if (needsAnyPrep && !hasAnyState && Object.keys(pollPrepErrors).length === 0) {
      await supabase.from("scheduled_posts").update({ status: "pending" }).eq("id", post.id);
      log.push(`"${post.title}": containers missing, reset to pending for retry`);
      continue;
    }

    // ── Poll Instagram containers ──
    // If IG had a prep error or no containers exist, consider it "done" (will fail in PUBLISH)
    let igReady = !hasIgInPost || !!pollPrepErrors.instagram || !igState || (igState.ready ?? false);
    if (hasIgInPost && igState && !igState.ready) {
      const conn = connPlatforms?.find((c: Row) => c.platform === "instagram");
      if (!conn || !conn.platform_user_id) {
        error = "Instagram: Not connected";
      } else {
        const accessToken = conn.access_token as string;

        if (igState.type === "single" && igState.containerId) {
          const status = await checkIgContainerStatus(accessToken, igState.containerId);
          if (status === "FINISHED") { igReady = true; containers.instagram = { ...igState, ready: true }; }
          else if (status === "ERROR") error = "Instagram: Container processing failed";
          else if (status === "EXPIRED") error = "Instagram: Container expired";
        } else if (igState.type === "carousel") {
          if (!igState.containerId) {
            // Check children first
            let allChildrenDone = true;
            for (const childId of igState.childIds ?? []) {
              const status = await checkIgContainerStatus(accessToken, childId);
              if (status === "ERROR") { error = `Instagram: Carousel child failed`; break; }
              if (status === "EXPIRED") { error = `Instagram: Carousel child expired`; break; }
              if (status !== "FINISHED") { allChildrenDone = false; break; }
            }
            if (!error && allChildrenDone) {
              const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
              const result = await createIgContainer(accessToken, conn.platform_user_id, {
                media_type: "CAROUSEL", caption, children: (igState.childIds ?? []).join(","),
              });
              if (!result.id) { error = `Instagram: Carousel parent: ${result.error}`; }
              else {
                containers.instagram = { ...igState, containerId: result.id };
                log.push(`"${post.title}" IG carousel parent: ${result.id}`);
                const parentStatus = await checkIgContainerStatus(accessToken, result.id);
                if (parentStatus === "FINISHED") { igReady = true; containers.instagram!.ready = true; }
                else if (parentStatus === "ERROR" || parentStatus === "EXPIRED") error = `Instagram: Carousel parent ${parentStatus}`;
              }
            }
          } else {
            const status = await checkIgContainerStatus(accessToken, igState.containerId);
            if (status === "FINISHED") { igReady = true; containers.instagram = { ...igState, ready: true }; }
            else if (status === "ERROR") error = "Instagram: Carousel parent processing failed";
            else if (status === "EXPIRED") error = "Instagram: Carousel parent expired";
          }
        }
      }
    }

    // ── Poll Threads containers ──
    let threadsReady = !hasThreadsInPost || !!pollPrepErrors.threads || !threadsState || (threadsState.ready ?? false);
    if (!error && hasThreadsInPost && threadsState && !threadsState.ready) {
      try {
      const conn = connPlatforms?.find((c: Row) => c.platform === "threads");
      if (conn) {
        const accessToken = await getFreshToken(conn, "threads");
        if (accessToken) {
          const THREADS_API = "https://graph.threads.net/v1.0";

          if (threadsState.type === "single" && threadsState.containerId) {
            const sRes = await timedFetch(`${THREADS_API}/${threadsState.containerId}?fields=status&access_token=${accessToken}`);
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData.status === "FINISHED") { threadsReady = true; containers.threads = { ...threadsState, ready: true }; }
              else if (sData.status === "ERROR" || sData.status === "EXPIRED") {
                log.push(`"${post.title}" Threads single container failed: ${sData.status}`);
                // Non-fatal — other platforms can still work
                containers.threads = { ...threadsState, ready: true }; // Mark as "done" (will skip in publish)
                threadsReady = true;
              }
            }
          } else if (threadsState.type === "carousel") {
            if (!threadsState.containerId) {
              // Check children
              let allDone = true;
              let childError = false;
              for (const childId of threadsState.childIds ?? []) {
                const sRes = await timedFetch(`${THREADS_API}/${childId}?fields=status&access_token=${accessToken}`);
                if (!sRes.ok) { allDone = false; break; }
                const sData = await sRes.json();
                if (sData.status === "ERROR" || sData.status === "EXPIRED") { childError = true; break; }
                if (sData.status !== "FINISHED") { allDone = false; break; }
              }
              if (childError) {
                log.push(`"${post.title}" Threads carousel child failed`);
                containers.threads = { ...threadsState, ready: true };
                threadsReady = true;
              } else if (allDone) {
                // Create carousel parent
                const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
                const carRes = await timedFetch(`${THREADS_API}/me/threads`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({ media_type: "CAROUSEL", children: (threadsState.childIds ?? []).join(","), text: caption, access_token: accessToken }),
                });
                const carData = await carRes.json();
                if (carData.id) {
                  containers.threads = { ...threadsState, containerId: carData.id };
                  log.push(`"${post.title}" Threads carousel parent: ${carData.id}`);
                  // Check immediately
                  const pRes = await timedFetch(`${THREADS_API}/${carData.id}?fields=status&access_token=${accessToken}`);
                  if (pRes.ok) {
                    const pData = await pRes.json();
                    if (pData.status === "FINISHED") { threadsReady = true; containers.threads!.ready = true; }
                  }
                } else {
                  log.push(`"${post.title}" Threads carousel parent failed: ${carData.error?.message || "unknown"}`);
                  containers.threads = { ...threadsState, ready: true };
                  threadsReady = true;
                }
              }
            } else {
              // Parent exists, check it
              const sRes = await timedFetch(`${THREADS_API}/${threadsState.containerId}?fields=status&access_token=${accessToken}`);
              if (sRes.ok) {
                const sData = await sRes.json();
                if (sData.status === "FINISHED") { threadsReady = true; containers.threads = { ...threadsState, ready: true }; }
                else if (sData.status === "ERROR" || sData.status === "EXPIRED") {
                  log.push(`"${post.title}" Threads carousel parent failed: ${sData.status}`);
                  containers.threads = { ...threadsState, ready: true };
                  threadsReady = true;
                }
              }
            }
          }
        }
      } else {
        threadsReady = true; // Not connected, skip
      }
      } catch (err) {
        // Threads POLL failure is non-fatal — mark done, other platforms proceed
        log.push(`"${post.title}" Threads POLL exception: ${err instanceof Error ? err.message : String(err)}`);
        containers.threads = { ...threadsState, ready: true };
        threadsReady = true;
      }
    }

    // ── Poll Bluesky video processing ──
    let bskyReady = !hasBskyInPost || !!pollPrepErrors.bluesky || (bskyState?.ready ?? true);
    if (!error && hasBskyInPost && bskyState && !bskyState.ready && bskyState.videoJobId) {
      const conn = connPlatforms?.find((c: Row) => c.platform === "bluesky");
      if (conn) {
        const accessToken = await getFreshToken(conn, "bluesky");
        if (accessToken) {
          const sRes = await timedFetch(
            `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(bskyState.videoJobId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.jobStatus?.state === "JOB_STATE_COMPLETED") {
              containers.bluesky = { ...bskyState, videoBlob: sData.jobStatus.blob, ready: true };
              bskyReady = true;
              log.push(`"${post.title}" Bluesky video ready`);
            } else if (sData.jobStatus?.state === "JOB_STATE_FAILED") {
              containers.bluesky = { ...bskyState, ready: true }; // Mark done, will skip video in publish
              bskyReady = true;
              log.push(`"${post.title}" Bluesky video processing failed`);
            }
          }
        }
      } else {
        bskyReady = true;
      }
    }

    const allReady = igReady && threadsReady && bskyReady;

    if (error) {
      const failResults: Record<string, { success: boolean; error?: string }> = {};
      for (const p of post.platforms as string[]) failResults[p] = { success: false, error };
      await supabase.from("scheduled_posts").update({ status: "failed", results: failResults }).eq("id", post.id);
      log.push(`"${post.title}": POLL FAILED — ${error}`);
    } else if (allReady) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "prepared", prepared_containers: containers })
        .eq("id", post.id);
      log.push(`"${post.title}": → prepared`);
    } else {
      await supabase
        .from("scheduled_posts")
        .update({ prepared_containers: containers })
        .eq("id", post.id);
      log.push(`"${post.title}": still preparing (ig:${igReady} threads:${threadsReady} bsky:${bskyReady})`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: PUBLISH (prepared → completed)
  // All containers are ready. Each platform needs only 1 fast API call.
  // YouTube upload still happens here (no container system).
  // ═══════════════════════════════════════════════════════════════════════

  const { data: preparedPosts } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "prepared")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  for (const post of preparedPosts ?? []) {
    if (Date.now() - cronStart > 28_000) {
      log.push("PUBLISH: time limit (28s), deferring remaining");
      break;
    }
    // Optimistic lock: claim for publishing
    const { data: claimed } = await supabase
      .from("scheduled_posts")
      .update({ status: "publishing" })
      .eq("id", post.id)
      .eq("status", "prepared")
      .select("id");
    if (!claimed?.length) continue;

    const { data: connPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", post.user_id)
      .eq("is_active", true);

    const containers = (post.prepared_containers ?? {}) as PreparedContainers;
    const results: Record<string, { success: boolean; error?: string }> = {};
    const prepErrs = containers._errors ?? {};

    // Publish all platforms in parallel for speed
    const publishPromises = (post.platforms as string[]).map(async (platformId) => {
      // Skip platforms that failed during preparation
      if (prepErrs[platformId]) return { platformId, success: false, error: prepErrs[platformId] };

      const conn = connPlatforms?.find((c: Row) => c.platform === platformId);
      if (!conn) return { platformId, success: false, error: "Not connected" };

      const accessToken = await getFreshToken(conn, platformId);
      if (!accessToken) return { platformId, success: false, error: "Token refresh failed" };

      // ── Publish Instagram (one API call — container ready) ──
      if (platformId === "instagram") {
        const igState = containers.instagram;
        if (!igState?.containerId) return { platformId, success: false, error: "No prepared container" };
        if (!conn.platform_user_id) return { platformId, success: false, error: "Account ID missing" };
        const r = await publishIgContainer(accessToken, conn.platform_user_id, igState.containerId);
        return { platformId, ...r };
      }

      // ── Publish Threads (one API call — container ready from PREPARE) ──
      if (platformId === "threads") {
        const tState = containers.threads;
        if (!tState?.containerId) return { platformId, success: false, error: "No prepared container" };
        const THREADS_API = "https://graph.threads.net/v1.0";
        try {
          const pRes = await timedFetch(`${THREADS_API}/me/threads_publish`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ creation_id: tState.containerId, access_token: accessToken }),
          });
          const pData = await pRes.json().catch(() => ({}));
          return pData.id ? { platformId, success: true } : { platformId, success: false, error: pData.error?.message || `Publish failed (${pRes.status})` };
        } catch (err) {
          return { platformId, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }

      // ── Publish Bluesky (one API call — blobs pre-uploaded) ──
      if (platformId === "bluesky") {
        try {
          const postText = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
          const BSKY_API = "https://bsky.social/xrpc";

          // Detect facets (URLs, hashtags)
          const facets: { index: { byteStart: number; byteEnd: number }; features: Record<string, string>[] }[] = [];
          const encoder = new TextEncoder();
          const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
          let match;
          while ((match = urlRegex.exec(postText)) !== null) {
            const before = encoder.encode(postText.slice(0, match.index));
            const url = encoder.encode(match[0]);
            facets.push({
              index: { byteStart: before.length, byteEnd: before.length + url.length },
              features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
            });
          }

          const record: Record<string, unknown> = {
            $type: "app.bsky.feed.post",
            text: postText,
            createdAt: new Date().toISOString(),
            ...(facets.length > 0 && { facets }),
          };

          const bskyPrep = containers.bluesky;
          if (bskyPrep?.imageBlobs && bskyPrep.imageBlobs.length > 0 && !bskyPrep.videoBlob) {
            record.embed = { $type: "app.bsky.embed.images", images: bskyPrep.imageBlobs.map((b) => ({ alt: "", image: b })) };
          } else if (bskyPrep?.videoBlob) {
            record.embed = { $type: "app.bsky.embed.video", video: bskyPrep.videoBlob, alt: "" };
          } else if (post.media_urls && (post.media_urls as string[]).length > 0) {
            // Fallback: no pre-uploaded blobs — upload images now (fast for small images)
            const uploaded: Record<string, unknown>[] = [];
            for (let i = 0; i < Math.min((post.media_urls as string[]).length, 4); i++) {
              const stored = (post.media_urls as string[])[i];
              const mimeType = (post.media_types as string[] | null)?.[i] ?? "image/jpeg";
              if (mimeType.startsWith("video/")) continue; // Skip video in fallback
              const fileUrl = await resolve(stored);
              if (!fileUrl) continue;
              const fileRes = await timedFetch(fileUrl);
              if (!fileRes.ok) continue;
              const buf = await fileRes.arrayBuffer();
              const upRes = await timedFetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": mimeType },
                body: buf,
              });
              if (!upRes.ok) continue;
              const upData = await upRes.json();
              uploaded.push({ alt: "", image: upData.blob });
            }
            if (uploaded.length > 0) record.embed = { $type: "app.bsky.embed.images", images: uploaded };
          }

          const postRes = await timedFetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ repo: conn.platform_user_id, collection: "app.bsky.feed.post", record }),
          });
          if (!postRes.ok) {
            const err = await postRes.json().catch(() => ({}));
            return { platformId, success: false, error: err?.message || `Post failed (${postRes.status})` };
          }
          return { platformId, success: true };
        } catch (err) {
          return { platformId, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }

      // ── Upload to YouTube (no container system — upload happens at publish) ──
      if (platformId === "youtube") {
        const videoIndex = (post.media_types as string[] | null)?.findIndex((t: string) => t.startsWith("video/"));
        if (videoIndex === undefined || videoIndex === -1 || !post.media_urls?.[videoIndex]) {
          return { platformId, success: false, error: "No video file found" };
        }
        try {
          const fetchUrl = await resolve(post.media_urls[videoIndex]);
          if (!fetchUrl) return { platformId, success: false, error: "Failed to resolve video URL" };
          const videoRes = await timedFetch(fetchUrl, undefined, 20_000);
          if (!videoRes.ok) return { platformId, success: false, error: "Failed to fetch video" };
          const videoBlob = await videoRes.blob();

          const metadata = {
            snippet: { title: post.title || "New Video", description: post.description || "", categoryId: "22" },
            status: { privacyStatus: "public" },
          };
          const form = new FormData();
          form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
          form.append("video", videoBlob);

          const ytRes = await timedFetch(
            "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
            { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: form },
            25_000
          );
          if (!ytRes.ok) {
            const errData = await ytRes.json().catch(() => ({}));
            return { platformId, success: false, error: errData?.error?.message ?? `YouTube error ${ytRes.status}` };
          }
          const ytData = await ytRes.json();
          // Thumbnail upload (best-effort)
          if (post.thumbnail_url && ytData.id) {
            try {
              const thumbUrl = await resolve(post.thumbnail_url);
              if (thumbUrl) {
                const thumbRes = await timedFetch(thumbUrl);
                if (thumbRes.ok) {
                  await timedFetch(
                    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${ytData.id}&uploadType=media`,
                    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/jpeg" }, body: await thumbRes.blob() }
                  );
                }
              }
            } catch { /* thumbnail is best-effort */ }
          }
          return { platformId, success: true };
        } catch (err) {
          return { platformId, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }

      return { platformId, success: false, error: "Unknown platform" };
    });

    const publishResults = await Promise.allSettled(publishPromises);
    for (const settled of publishResults) {
      if (settled.status === "fulfilled") {
        const { platformId, success, error: err } = settled.value;
        results[platformId] = { success, ...(err && { error: err }) };
      } else {
        // Promise rejected — shouldn't happen but handle gracefully
        log.push(`Publish promise rejected: ${settled.reason}`);
      }
    }

    const allFailed = Object.values(results).length > 0 && Object.values(results).every((r) => !r.success);
    await supabase
      .from("scheduled_posts")
      .update({ status: allFailed ? "failed" : "completed", results })
      .eq("id", post.id);
    log.push(`"${post.title}": published → ${JSON.stringify(results)}`);
  }

  log.push(`${new Date().toISOString()} — Done`);
  return (
    <div>
      <p>
        OK — pending:{pendingPosts?.length ?? 0} preparing:
        {preparingPosts?.length ?? 0} prepared:{preparedPosts?.length ?? 0}
      </p>
      <pre style={{ fontSize: "12px", whiteSpace: "pre-wrap" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}
