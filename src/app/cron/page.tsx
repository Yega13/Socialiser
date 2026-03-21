import { createClient } from "@supabase/supabase-js";
import {
  refreshYouTubeToken,
  refreshInstagramToken,
  postToInstagramServer,
  postCarouselToInstagram,
} from "@/app/(app)/compose/actions";

// This is a PAGE (not a route handler) so it works on Cloudflare Workers.
// An external cron service hits this URL every ~5 minutes with the secret key.
// e.g. https://socialiser.yeganyansuren13.workers.dev/cron?key=YOUR_SECRET

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function CronPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  if (!key || key !== process.env.CRON_SECRET) {
    return <p>Unauthorized</p>;
  }

  const supabase = getAdminClient();

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
              .createSignedUrl(pathMatch[1], 3600);
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
                  .createSignedUrl(thumbPathMatch[1], 3600);
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

        // Convert public URLs to signed URLs
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
            const { data: signedData } = await supabase.storage
              .from("media")
              .createSignedUrl(pathMatch[1], 3600);
            items.push({
              url: signedData?.signedUrl || publicUrl,
              isVideo,
            });
          } else {
            items.push({ url: publicUrl, isVideo });
          }
        }

        if (items.length === 1) {
          results[platformId] = await postToInstagramServer(
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
