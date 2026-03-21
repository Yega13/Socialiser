import { createClient } from "@supabase/supabase-js";

// Fully self-contained cron page — no imports from "use server" files.
// An external cron service hits this URL every minute with the secret key.

export const dynamic = "force-dynamic";

// ── Helper functions (inlined to avoid "use server" import issues on CF Workers) ──

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
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(
      `https://graph.instagram.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    const data = await res.json();
    if (data.status_code === "FINISHED") return null;
    if (data.status_code === "ERROR")
      return `Media processing failed${data.status ? `: ${data.status}` : ""}`;
    if (data.status_code === "EXPIRED") return "Media container expired";
  }
  return "Media processing timed out (3min)";
}

async function postToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrl: string,
  isVideo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const params: Record<string, string> = { caption };
    if (isVideo) {
      params.media_type = "REELS";
      params.video_url = mediaUrl;
    } else {
      params.image_url = mediaUrl;
    }
    const container = await createIgContainer(accessToken, igUserId, params);
    if (!container.id) return { success: false, error: container.error };
    const waitErr = await waitForContainer(accessToken, container.id);
    if (waitErr) return { success: false, error: waitErr };
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: container.id,
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
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function postCarouselToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  items: { url: string; isVideo: boolean }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (items.length < 2 || items.length > 10) {
      return { success: false, error: "Carousel requires 2-10 items" };
    }
    const childIds: string[] = [];
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
        return { success: false, error: `Item ${i + 1}: ${container.error}` };
      const waitErr = await waitForContainer(accessToken, container.id);
      if (waitErr)
        return { success: false, error: `Item ${i + 1}: ${waitErr}` };
      childIds.push(container.id);
    }
    const carouselContainer = await createIgContainer(
      accessToken,
      igUserId,
      {
        media_type: "CAROUSEL",
        caption,
        children: childIds.join(","),
      }
    );
    if (!carouselContainer.id)
      return { success: false, error: carouselContainer.error };
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: carouselContainer.id,
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
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Main cron page ──────────────────────────────────────────────

export default async function CronPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  // Use bracket notation to read runtime value from wrangler.toml [vars],
  // not the build-time inlined value from GitHub secrets
  const envName = "CRON_SECRET";
  const secret = process.env[envName];
  if (!key || key !== secret) {
    return <p>Unauthorized</p>;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Reset any stuck "processing" posts back to pending
  await supabase
    .from("scheduled_posts")
    .update({ status: "pending" })
    .eq("status", "processing");

  // Get ALL pending overdue posts across ALL users
  const { data: posts, error: fetchErr } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .limit(10);

  if (fetchErr || !posts || posts.length === 0) {
    return <p>OK: 0 processed</p>;
  }

  let processed = 0;

  for (const post of posts) {
    await supabase
      .from("scheduled_posts")
      .update({ status: "processing" })
      .eq("id", post.id);

    const { data: connectedPlatforms } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", post.user_id)
      .eq("is_active", true);

    const results: Record<string, { success: boolean; error?: string }> = {};

    for (const platformId of post.platforms as string[]) {
      const conn = connectedPlatforms?.find(
        (c: { platform: string }) => c.platform === platformId
      );
      if (!conn) {
        results[platformId] = { success: false, error: "Not connected" };
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
            results[platformId] = {
              success: false,
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
            results[platformId] = {
              success: false,
              error: "Token refresh failed",
            };
            continue;
          }
        }
      }

      // ── YouTube ──
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
          const videoUrl = post.media_urls[videoIndex];
          const pathMatch = videoUrl.match(
            /\/storage\/v1\/object\/public\/media\/(.+)$/
          );
          let fetchUrl = videoUrl;
          if (pathMatch) {
            const { data: signedData } = await supabase.storage
              .from("media")
              .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);
            if (signedData?.signedUrl) fetchUrl = signedData.signedUrl;
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
                errData?.error?.message ?? `YouTube error ${ytRes.status}`,
            };
          } else {
            const ytData = await ytRes.json();
            if (post.thumbnail_url && ytData.id) {
              const thumbPathMatch = post.thumbnail_url.match(
                /\/storage\/v1\/object\/public\/media\/(.+)$/
              );
              let thumbFetchUrl = post.thumbnail_url;
              if (thumbPathMatch) {
                const { data: sd } = await supabase.storage
                  .from("media")
                  .createSignedUrl(decodeURIComponent(thumbPathMatch[1]), 3600);
                if (sd?.signedUrl) thumbFetchUrl = sd.signedUrl;
              }
              const thumbRes = await fetch(thumbFetchUrl);
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
            results[platformId] = { success: true };
          }
        } catch (err) {
          results[platformId] = {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // ── Instagram ──
      if (platformId === "instagram") {
        if (!post.media_urls || post.media_urls.length === 0) {
          results[platformId] = {
            success: false,
            error: "No media files found",
          };
          continue;
        }
        if (!conn.platform_user_id) {
          results[platformId] = {
            success: false,
            error: "Instagram account ID missing. Reconnect.",
          };
          continue;
        }

        const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;

        // Convert public URLs to signed URLs so Instagram can access private bucket
        const items: { url: string; isVideo: boolean }[] = [];
        for (let i = 0; i < (post.media_urls as string[]).length; i++) {
          const publicUrl = (post.media_urls as string[])[i];
          const isVideo =
            (post.media_types as string[] | null)?.[i]?.startsWith(
              "video/"
            ) ?? false;
          const pathMatch = publicUrl.match(
            /\/storage\/v1\/object\/public\/media\/(.+)$/
          );
          if (pathMatch) {
            const decodedPath = decodeURIComponent(pathMatch[1]);
            const { data: signedData } = await supabase.storage
              .from("media")
              .createSignedUrl(decodedPath, 3600);
            items.push({
              url: signedData?.signedUrl || publicUrl,
              isVideo,
            });
          } else {
            items.push({ url: publicUrl, isVideo });
          }
        }

        if (items.length === 1) {
          results[platformId] = await postToInstagram(
            accessToken,
            conn.platform_user_id,
            caption,
            items[0].url,
            items[0].isVideo
          );
        } else {
          results[platformId] = await postCarouselToInstagram(
            accessToken,
            conn.platform_user_id,
            caption,
            items
          );
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

    processed++;
  }

  return <p>OK: {processed} processed</p>;
}
