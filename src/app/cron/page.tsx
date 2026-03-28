import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════
// STATE-MACHINE CRON — Cloudflare Workers compatible (each run < 30s)
//
// Three fast steps per cron run, no sleeping, no long waits:
//   Step 1 PREPARE:  pending → preparing   (create IG containers, kick off processing)
//   Step 2 POLL:     preparing → prepared  (check container status, < 3 API calls)
//   Step 3 PUBLISH:  prepared → completed  (publish at scheduled time)
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

type PreparedContainers = {
  instagram?: IgContainerState;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ── Token helpers ────────────────────────────────────────────────────────────

async function refreshYouTubeToken(refreshToken: string): Promise<string | null> {
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

// ── Instagram API helpers ────────────────────────────────────────────────────

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
    const res = await fetch(
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
  const res = await fetch(
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

    if (platformId === "bluesky" && conn.refresh_token) {
      const res = await fetch("https://bsky.social/xrpc/com.atproto.server.refreshSession", {
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
    let fatalError: string | null = null;
    const hasIg = (post.platforms as string[]).includes("instagram");

    if (hasIg) {
      const conn = connPlatforms?.find(
        (c: Row) => c.platform === "instagram"
      );
      if (!conn) {
        fatalError = "Instagram: Not connected";
      } else if (!conn.platform_user_id) {
        fatalError = "Instagram: Account ID missing. Reconnect.";
      } else if (!post.media_urls?.length) {
        fatalError = "Instagram: No media files found";
      } else {
        const accessToken = await getFreshToken(conn, "instagram");
        if (!accessToken) {
          fatalError = "Instagram: Token refresh failed";
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
            fatalError = `Instagram: Failed to resolve URL for item ${failedUrlIdx + 1}`;
          }
          const items = resolvedItems;

          if (!fatalError) {
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
                fatalError = `Instagram: ${container.error}`;
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
                fatalError = `Instagram: Carousel item ${failedItem.index + 1}: ${failedItem.error}`;
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

    if (fatalError) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", results: { error: fatalError } })
        .eq("id", post.id);
      log.push(`"${post.title}": PREPARE FAILED — ${fatalError}`);
    } else if (!hasIg) {
      // YouTube/Bluesky posts: skip straight to prepared (no container prep needed)
      await supabase
        .from("scheduled_posts")
        .update({ status: "prepared" })
        .eq("id", post.id);
      log.push(`"${post.title}": → prepared (no IG containers needed)`);
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
  // Check IG container status. For carousels: create parent when children done.
  // Fast: one status check API call per container.
  // ═══════════════════════════════════════════════════════════════════════

  const { data: preparingPosts } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "preparing")
    .limit(20);

  for (const post of preparingPosts ?? []) {
    const containers = (
      post.prepared_containers ?? {}
    ) as PreparedContainers;
    const igState = containers.instagram;

    const { data: connPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", post.user_id)
      .eq("is_active", true);

    const conn = connPlatforms?.find((c: Row) => c.platform === "instagram");
    let error: string | null = null;
    let ready = false;

    if (!igState) {
      // PREPARE didn't finish (cron timed out mid-work) — reset to retry
      await supabase
        .from("scheduled_posts")
        .update({ status: "pending" })
        .eq("id", post.id);
      log.push(`"${post.title}": containers missing, reset to pending for retry`);
      continue;
    } else if (!conn || !conn.platform_user_id) {
      error = "Instagram: Not connected";
    } else {
      const accessToken = conn.access_token as string;

      if (igState.type === "single" && igState.containerId) {
        // Single post: check the one container
        const status = await checkIgContainerStatus(
          accessToken,
          igState.containerId
        );
        if (status === "FINISHED") {
          ready = true;
          containers.instagram = { ...igState, ready: true };
        } else if (status === "ERROR") {
          error = "Instagram: Container processing failed";
        } else if (status === "EXPIRED") {
          error = "Instagram: Container expired";
        }
        // IN_PROGRESS: stay in preparing, poll next run
      } else if (igState.type === "carousel") {
        if (!igState.containerId) {
          // Phase 1: children not yet done — check all child containers
          let allChildrenDone = true;
          for (const childId of igState.childIds ?? []) {
            const status = await checkIgContainerStatus(
              accessToken,
              childId
            );
            if (status === "ERROR") {
              error = `Instagram: Carousel child ${childId} failed`;
              break;
            }
            if (status === "EXPIRED") {
              error = `Instagram: Carousel child ${childId} expired`;
              break;
            }
            if (status !== "FINISHED") {
              allChildrenDone = false;
              break;
            }
          }

          if (!error && allChildrenDone) {
            // All children done — create the carousel parent container
            const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
            const result = await createIgContainer(
              accessToken,
              conn.platform_user_id,
              {
                media_type: "CAROUSEL",
                caption,
                children: (igState.childIds ?? []).join(","),
              }
            );
            if (!result.id) {
              error = `Instagram: Carousel parent: ${result.error}`;
            } else {
              containers.instagram = { ...igState, containerId: result.id };
              log.push(
                `"${post.title}" IG carousel parent created: ${result.id}`
              );
              // Check parent status immediately (often FINISHED right away)
              const parentStatus = await checkIgContainerStatus(
                accessToken,
                result.id
              );
              if (parentStatus === "FINISHED") {
                ready = true;
                containers.instagram.ready = true;
              } else if (
                parentStatus === "ERROR" ||
                parentStatus === "EXPIRED"
              ) {
                error = `Instagram: Carousel parent ${parentStatus}`;
              }
              // else: IN_PROGRESS, poll next run
            }
          }
        } else {
          // Phase 2: children done, checking parent container
          const status = await checkIgContainerStatus(
            accessToken,
            igState.containerId
          );
          if (status === "FINISHED") {
            ready = true;
            containers.instagram = { ...igState, ready: true };
          } else if (status === "ERROR") {
            error = "Instagram: Carousel parent processing failed";
          } else if (status === "EXPIRED") {
            error = "Instagram: Carousel parent expired";
          }
        }
      }
    }

    if (error) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "failed", results: { error } })
        .eq("id", post.id);
      log.push(`"${post.title}": POLL FAILED — ${error}`);
    } else if (ready) {
      await supabase
        .from("scheduled_posts")
        .update({ status: "prepared", prepared_containers: containers })
        .eq("id", post.id);
      log.push(`"${post.title}": → prepared`);
    } else {
      // Save any state progress (e.g. carousel parent ID was just created)
      await supabase
        .from("scheduled_posts")
        .update({ prepared_containers: containers })
        .eq("id", post.id);
      log.push(`"${post.title}": still preparing...`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: PUBLISH (prepared → completed)
  // Posts are fully prepared. Publish now if scheduled time has passed.
  // Fast for IG (one API call). YouTube upload happens here.
  // ═══════════════════════════════════════════════════════════════════════

  const { data: preparedPosts } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "prepared")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  for (const post of preparedPosts ?? []) {
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

    const containers = (
      post.prepared_containers ?? {}
    ) as PreparedContainers;
    const results: Record<string, { success: boolean; error?: string }> =
      {};

    for (const platformId of post.platforms as string[]) {
      const conn = connPlatforms?.find(
        (c: Row) => c.platform === platformId
      );
      if (!conn) {
        results[platformId] = { success: false, error: "Not connected" };
        continue;
      }

      const accessToken = await getFreshToken(conn, platformId);
      if (!accessToken) {
        results[platformId] = {
          success: false,
          error: "Token refresh failed",
        };
        continue;
      }

      // ── Publish Instagram ──
      if (platformId === "instagram") {
        const igState = containers.instagram;
        if (!igState?.containerId) {
          results[platformId] = {
            success: false,
            error: "No prepared container found",
          };
        } else if (!conn.platform_user_id) {
          results[platformId] = {
            success: false,
            error: "Instagram account ID missing",
          };
        } else {
          results[platformId] = await publishIgContainer(
            accessToken,
            conn.platform_user_id,
            igState.containerId
          );
        }
      }

      // ── Upload to YouTube ──
      if (platformId === "youtube") {
        const videoIndex = (
          post.media_types as string[] | null
        )?.findIndex((t: string) => t.startsWith("video/"));
        if (
          videoIndex === undefined ||
          videoIndex === -1 ||
          !post.media_urls?.[videoIndex]
        ) {
          results[platformId] = {
            success: false,
            error: "No video file found",
          };
          continue;
        }
        try {
          const fetchUrl = await resolve(post.media_urls[videoIndex]);
          if (!fetchUrl) {
            results[platformId] = {
              success: false,
              error: "Failed to create signed URL for video",
            };
            continue;
          }
          const videoRes = await fetch(fetchUrl);
          if (!videoRes.ok) {
            results[platformId] = {
              success: false,
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
          const form = new FormData();
          form.append(
            "metadata",
            new Blob([JSON.stringify(metadata)], {
              type: "application/json",
            })
          );
          form.append("video", videoBlob);

          const ytRes = await fetch(
            "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: form,
            }
          );
          if (!ytRes.ok) {
            const errData = await ytRes.json().catch(() => ({}));
            results[platformId] = {
              success: false,
              error:
                errData?.error?.message ??
                `YouTube error ${ytRes.status}`,
            };
          } else {
            const ytData = await ytRes.json();
            if (post.thumbnail_url && ytData.id) {
              const thumbUrl = await resolve(post.thumbnail_url);
              if (thumbUrl) {
                const thumbRes = await fetch(thumbUrl);
                if (thumbRes.ok) {
                  const thumbBlob = await thumbRes.blob();
                  await fetch(
                    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${ytData.id}&uploadType=media`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "image/jpeg",
                      },
                      body: thumbBlob,
                    }
                  );
                }
              }
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

      // ── Post to Bluesky ──
      if (platformId === "bluesky") {
        try {
          const postText = `${post.title}${post.description ? "\n\n" + post.description : ""}`;
          let bskyImages: { bytes: number[]; mimeType: string; name: string }[] | undefined;
          let bskyVideo: { bytes: number[]; mimeType: string; name: string } | undefined;

          if (post.media_urls && (post.media_urls as string[]).length > 0) {
            for (let i = 0; i < (post.media_urls as string[]).length; i++) {
              const stored = (post.media_urls as string[])[i];
              const mimeType = (post.media_types as string[] | null)?.[i] ?? "image/jpeg";
              const isVideo = mimeType.startsWith("video/");
              const fileUrl = await resolve(stored);
              if (!fileUrl) continue;

              const fileRes = await fetch(fileUrl);
              if (!fileRes.ok) continue;
              const bytes = Array.from(new Uint8Array(await fileRes.arrayBuffer()));

              if (isVideo && !bskyVideo) {
                bskyVideo = { bytes, mimeType, name: stored.split("/").pop() || "video.mp4" };
                break;
              } else if (!isVideo) {
                if (!bskyImages) bskyImages = [];
                if (bskyImages.length < 4) {
                  bskyImages.push({ bytes, mimeType, name: stored.split("/").pop() || "image.jpg" });
                }
              }
            }
          }

          // Call Bluesky API directly (server actions not available in cron)
          const BSKY_API = "https://bsky.social/xrpc";
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

          // Upload images
          if (bskyImages && bskyImages.length > 0 && !bskyVideo) {
            const uploaded: Record<string, unknown>[] = [];
            for (const img of bskyImages) {
              const upRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": img.mimeType },
                body: new Uint8Array(img.bytes),
              });
              if (!upRes.ok) { results[platformId] = { success: false, error: "Bluesky image upload failed" }; break; }
              const upData = await upRes.json();
              uploaded.push({ alt: "", image: upData.blob });
            }
            if (results[platformId]) continue;
            record.embed = { $type: "app.bsky.embed.images", images: uploaded };
          }

          // Upload video
          if (bskyVideo) {
            const authRes = await fetch(
              `${BSKY_API}/com.atproto.server.getServiceAuth?aud=did:web:video.bsky.app&lxm=com.atproto.repo.uploadBlob`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!authRes.ok) { results[platformId] = { success: false, error: "Bluesky video auth failed" }; continue; }
            const { token: svcToken } = await authRes.json();

            const upRes = await fetch(
              `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(conn.platform_user_id)}&name=${encodeURIComponent(bskyVideo.name)}`,
              { method: "POST", headers: { Authorization: `Bearer ${svcToken}`, "Content-Type": "video/mp4" }, body: new Uint8Array(bskyVideo.bytes) }
            );
            if (!upRes.ok) { results[platformId] = { success: false, error: "Bluesky video upload failed" }; continue; }
            const upData = await upRes.json();

            if (upData.jobId) {
              let videoBlob = upData.blob;
              for (let j = 0; j < 60; j++) {
                await new Promise((r) => setTimeout(r, 2000));
                const sRes = await fetch(`https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(upData.jobId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
                if (!sRes.ok) continue;
                const sData = await sRes.json();
                if (sData.jobStatus?.state === "JOB_STATE_COMPLETED") { videoBlob = sData.jobStatus.blob; break; }
                if (sData.jobStatus?.state === "JOB_STATE_FAILED") { results[platformId] = { success: false, error: "Bluesky video processing failed" }; break; }
              }
              if (results[platformId]) continue;
              record.embed = { $type: "app.bsky.embed.video", video: videoBlob, alt: "" };
            } else {
              record.embed = { $type: "app.bsky.embed.video", video: upData.blob, alt: "" };
            }
          }

          const postRes = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ repo: conn.platform_user_id, collection: "app.bsky.feed.post", record }),
          });
          if (!postRes.ok) {
            const err = await postRes.json().catch(() => ({}));
            results[platformId] = { success: false, error: err?.message || `Bluesky post failed (${postRes.status})` };
          } else {
            results[platformId] = { success: true };
          }
        } catch (err) {
          results[platformId] = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
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
      `"${post.title}": published at ${new Date().toISOString()} → ${JSON.stringify(results)}`
    );
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
