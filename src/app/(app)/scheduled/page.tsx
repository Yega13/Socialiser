"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  refreshYouTubeToken,
  refreshInstagramToken,
  refreshThreadsToken,
  refreshBlueskySession,
  postToInstagramServer,
  postCarouselToInstagram,
  postToThreadsServer,
  postCarouselToThreads,
  postToBlueskyServer,
  postToFacebookServer,
  postCarouselToFacebook,
} from "@/app/(app)/compose/actions";
import { uploadBlueskyVideo } from "@/lib/bluesky-video";
import type { BskyBlob } from "@/lib/bluesky-video";
import { cn } from "@/lib/utils";

type ScheduledPost = {
  id: string;
  title: string;
  description: string | null;
  platforms: string[];
  scheduled_at: string;
  status: string;
  results: Record<string, { success: boolean; error?: string }> | null;
  media_urls: string[] | null;
  media_types: string[] | null;
  thumbnail_url: string | null;
  created_at: string;
};

type ConnectedPlatform = {
  id: string;
  platform: string;
  platform_username: string | null;
  platform_user_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
};

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingError, setProcessingError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, title, description, platforms, scheduled_at, status, results, media_urls, media_types, thumbnail_url, created_at")
      .order("scheduled_at", { ascending: true });
    setPosts(data ?? []);
    setLoading(false);
  }, []);

  // Helper: resolve stored value (path or legacy URL) to a signed URL
  const resolveToSignedUrl = useCallback(async (supabase: ReturnType<typeof createClient>, stored: string): Promise<string> => {
    // New format: just a file path like "scheduled/1234-image.jpg"
    if (!stored.startsWith("http")) {
      const { data } = await supabase.storage
        .from("media")
        .createSignedUrl(stored, 3600);
      return data?.signedUrl || "";
    }
    // Legacy: full URL — extract path and create signed URL
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
  }, []);

  // Process overdue posts client-side using browser supabase client
  const processOverduePosts = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    // Get overdue pending posts
    const { data: overduePosts } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString());

    if (!overduePosts || overduePosts.length === 0) return 0;

    // Get connected platforms
    const { data: connectedPlatforms } = await supabase
      .from("connected_platforms")
      .select("id, platform, platform_username, platform_user_id, access_token, refresh_token, token_expires_at")
      .eq("user_id", user.id)
      .eq("is_active", true);

    let processedCount = 0;

    for (const post of overduePosts) {
      setProcessingStatus(`Processing "${post.title}"...`);

      // Optimistic lock: claim post before processing (prevents double-post with cron)
      const { data: claimed } = await supabase
        .from("scheduled_posts")
        .update({ status: "publishing" })
        .eq("id", post.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue; // Already claimed by cron

      const results: Record<string, { success: boolean; error?: string }> = {};

      for (const platformId of post.platforms as string[]) {
        const conn = connectedPlatforms?.find(
          (c: ConnectedPlatform) => c.platform === platformId
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
            setProcessingStatus("Refreshing YouTube token...");
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
            setProcessingStatus("Refreshing Instagram token...");
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
          } else if (platformId === "threads") {
            setProcessingStatus("Refreshing Threads token...");
            const refreshed = await refreshThreadsToken(accessToken);
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
                error: "Threads token expired. Reconnect.",
              };
              continue;
            }
          } else if (platformId === "bluesky" && conn.refresh_token) {
            setProcessingStatus("Refreshing Bluesky session...");
            const refreshed = await refreshBlueskySession(conn.refresh_token);
            if (refreshed) {
              accessToken = refreshed.accessJwt;
              await supabase
                .from("connected_platforms")
                .update({
                  access_token: refreshed.accessJwt,
                  refresh_token: refreshed.refreshJwt,
                  token_expires_at: new Date(
                    Date.now() + 2 * 3600 * 1000
                  ).toISOString(),
                })
                .eq("id", conn.id);
            } else {
              results[platformId] = {
                success: false,
                error: "Bluesky session expired. Reconnect.",
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
            setProcessingStatus("Uploading to YouTube...");
            const fetchUrl = await resolveToSignedUrl(supabase, post.media_urls[videoIndex]);
            if (!fetchUrl) {
              results[platformId] = { success: false, error: "Failed to create signed URL for video" };
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
                  errData?.error?.message ?? `YouTube error ${ytRes.status}`,
              };
            } else {
              const ytData = await ytRes.json();
              if (post.thumbnail_url && ytData.id) {
                const thumbFetchUrl = await resolveToSignedUrl(supabase, post.thumbnail_url);
                const thumbRes = thumbFetchUrl ? await fetch(thumbFetchUrl) : null;
                if (thumbRes && thumbRes.ok) {
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

          setProcessingStatus("Publishing to Instagram...");
          const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;

          // Resolve stored paths/URLs to signed URLs
          const items: { url: string; isVideo: boolean }[] = [];
          for (let i = 0; i < (post.media_urls as string[]).length; i++) {
            const stored = (post.media_urls as string[])[i];
            const isVideo =
              (post.media_types as string[] | null)?.[i]?.startsWith(
                "video/"
              ) ?? false;
            const signedUrl = await resolveToSignedUrl(supabase, stored);
            if (!signedUrl) {
              results[platformId] = { success: false, error: `Failed to create signed URL for item ${i + 1}` };
              break;
            }
            items.push({ url: signedUrl, isVideo });
          }
          if (items.length !== (post.media_urls as string[]).length) continue;

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

        // ── Threads ──
        if (platformId === "threads") {
          if (!conn.platform_user_id) {
            results[platformId] = { success: false, error: "Threads account ID missing. Reconnect." };
            continue;
          }
          setProcessingStatus("Posting to Threads...");
          const caption = `${post.title}${post.description ? "\n\n" + post.description : ""}`;

          if (!post.media_urls || (post.media_urls as string[]).length === 0) {
            // Text-only post
            results[platformId] = await postToThreadsServer(accessToken, conn.platform_user_id, caption);
          } else {
            const items: { url: string; isVideo: boolean }[] = [];
            for (let i = 0; i < (post.media_urls as string[]).length; i++) {
              const stored = (post.media_urls as string[])[i];
              const mimeType = (post.media_types as string[] | null)?.[i] ?? "image/jpeg";
              const isVideo = mimeType.startsWith("video/");
              const signedUrl = await resolveToSignedUrl(supabase, stored);
              if (!signedUrl) {
                results[platformId] = { success: false, error: `Failed to get URL for file ${i + 1}` };
                break;
              }
              items.push({ url: signedUrl, isVideo });
            }
            if (!results[platformId]) {
              if (items.length === 1) {
                results[platformId] = await postToThreadsServer(
                  accessToken, conn.platform_user_id, caption, items[0].url, items[0].isVideo
                );
              } else {
                results[platformId] = await postCarouselToThreads(
                  accessToken, conn.platform_user_id, caption, items
                );
              }
            }
          }
        }

        // ── Facebook ──
        if (platformId === "facebook") {
          if (!conn.platform_user_id) {
            results[platformId] = { success: false, error: "Facebook Page ID missing. Reconnect." };
            continue;
          }
          setProcessingStatus("Posting to Facebook...");
          const message = `${post.title}${post.description ? "\n\n" + post.description : ""}`;

          if (!post.media_urls || (post.media_urls as string[]).length === 0) {
            results[platformId] = await postToFacebookServer(accessToken, conn.platform_user_id, message);
          } else {
            const items: { url: string; isVideo: boolean }[] = [];
            let urlErr = false;
            for (let i = 0; i < (post.media_urls as string[]).length; i++) {
              const stored = (post.media_urls as string[])[i];
              const mimeType = (post.media_types as string[] | null)?.[i] ?? "image/jpeg";
              const isVideo = mimeType.startsWith("video/");
              const signedUrl = await resolveToSignedUrl(supabase, stored);
              if (!signedUrl) {
                results[platformId] = { success: false, error: `Failed to get URL for file ${i + 1}` };
                urlErr = true;
                break;
              }
              items.push({ url: signedUrl, isVideo });
            }
            if (!urlErr) {
              if (items.length === 1) {
                results[platformId] = await postToFacebookServer(
                  accessToken, conn.platform_user_id, message, items[0].url, items[0].isVideo
                );
              } else {
                results[platformId] = await postCarouselToFacebook(
                  accessToken, conn.platform_user_id, message, items
                );
              }
            }
          }
        }

        // ── Bluesky ──
        if (platformId === "bluesky") {
          setProcessingStatus("Posting to Bluesky...");
          const postText = `${post.title}${post.description ? "\n\n" + post.description : ""}`;

          let bskyImageBlobs: BskyBlob[] | undefined;
          let bskyVideoBlob: { $type: string; ref: { $link: string }; mimeType: string; size: number } | null = null;

          if (post.media_urls && post.media_urls.length > 0) {
            for (let i = 0; i < (post.media_urls as string[]).length; i++) {
              const stored = (post.media_urls as string[])[i];
              const mimeType = (post.media_types as string[] | null)?.[i] ?? "image/jpeg";
              const isVideo = mimeType.startsWith("video/");
              const signedUrl = await resolveToSignedUrl(supabase, stored);
              if (!signedUrl) continue;

              if (isVideo && !bskyVideoBlob) {
                // Fetch video and upload client-side directly to Bluesky
                const fileRes = await fetch(signedUrl);
                if (!fileRes.ok) continue;
                const videoBlob = await fileRes.blob();
                const videoResult = await uploadBlueskyVideo(
                  accessToken, conn.platform_user_id!, videoBlob,
                  stored.split("/").pop() || "video.mp4",
                  (msg) => setProcessingStatus(msg)
                );
                if (videoResult.blob) bskyVideoBlob = videoResult.blob;
                else if (videoResult.error) { results[platformId] = { success: false, error: `Video: ${videoResult.error}` }; }
                break; // Bluesky supports 1 video per post
              } else if (!isVideo) {
                const fileRes = await fetch(signedUrl);
                if (!fileRes.ok) continue;
                const imageBlob = await fileRes.blob();
                const uploadRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": mimeType },
                  body: imageBlob,
                });
                if (!uploadRes.ok) continue;
                const uploadData = await uploadRes.json();
                if (!bskyImageBlobs) bskyImageBlobs = [];
                if (bskyImageBlobs.length < 4) {
                  bskyImageBlobs.push(uploadData.blob as BskyBlob);
                }
              }
            }
          }

          if (!results[platformId]) {
            results[platformId] = await postToBlueskyServer(
              accessToken,
              conn.platform_user_id!,
              postText,
              bskyImageBlobs,
              bskyVideoBlob
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

      processedCount++;
    }

    setProcessingStatus("");
    return processedCount;
  }, [resolveToSignedUrl]);

  // On mount: reset stuck posts, then load
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Reset posts stuck in transient states for >30 minutes
        const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: stuckPosts } = await supabase
          .from("scheduled_posts")
          .select("id, scheduled_at, status")
          .eq("user_id", user.id)
          .in("status", ["preparing", "publishing"])
          .lt("scheduled_at", stuckCutoff);

        if (stuckPosts && stuckPosts.length > 0) {
          await supabase
            .from("scheduled_posts")
            .update({ status: "pending", prepared_containers: null, results: null })
            .in("id", stuckPosts.map((p) => p.id));
        }
      }
      await loadPosts();
    }
    init();
  }, [loadPosts]);

  // Real-time: subscribe to DB changes so status updates appear instantly
  useEffect(() => {
    const supabase = createClient();
    let cleanup = () => {};

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const channel = supabase
        .channel("scheduled-posts-live")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "scheduled_posts",
            filter: `user_id=eq.${user.id}`,
          },
          () => loadPosts()
        )
        .subscribe();
      cleanup = () => supabase.removeChannel(channel);
    });

    return () => cleanup();
  }, [loadPosts]);

  // Adaptive auto-refresh: 2s when a post is imminent/publishing, 30s otherwise.
  // Realtime subscription handles most updates, but this catches edge cases
  // (CF Workers + Supabase realtime can miss events) and makes status changes
  // around scheduled time feel instant.
  useEffect(() => {
    const now = Date.now();
    const hasImminent = posts.some((p) => {
      if (["preparing", "publishing"].includes(p.status)) return true;
      if (p.status === "prepared" || p.status === "pending") {
        const until = new Date(p.scheduled_at).getTime() - now;
        return until < 2 * 60 * 1000; // within 2 min of fire time (or past)
      }
      return false;
    });
    const hasActive = posts.some((p) =>
      ["pending", "preparing", "prepared", "publishing"].includes(p.status)
    );
    if (!hasActive) return;
    const interval = setInterval(loadPosts, hasImminent ? 2000 : 30000);
    return () => clearInterval(interval);
  }, [posts, loadPosts]);

  // Refresh when user switches back to this tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadPosts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadPosts]);

  async function handleProcessNow() {
    setProcessing(true);
    setProcessingError(null);
    try {
      await processOverduePosts();
    } catch (err) {
      setProcessingError(err instanceof Error ? err.message : "Failed to process posts. Please try again.");
    }
    await loadPosts();
    setProcessing(false);
  }

  async function deletePost(id: string) {
    const supabase = createClient();
    await supabase.from("scheduled_posts").delete().eq("id", id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function deleteAllCompleted() {
    const supabase = createClient();
    const ids = [...completed, ...failed].map((p) => p.id);
    if (ids.length === 0) return;
    await supabase.from("scheduled_posts").delete().in("id", ids);
    setPosts((prev) => prev.filter((p) => !ids.includes(p.id)));
  }

  async function retryPost(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("scheduled_posts")
      .update({ status: "pending", results: null })
      .eq("id", id);
    if (error) return;
    await loadPosts();
  }

  async function reschedulePost(id: string, newDate: string) {
    const supabase = createClient();
    await supabase
      .from("scheduled_posts")
      .update({
        scheduled_at: new Date(newDate).toISOString(),
        status: "pending",
        prepared_containers: null,
        results: null,
      })
      .eq("id", id);
    await loadPosts();
  }

  const pending = posts.filter((p) => p.status === "pending");
  const inProgress = posts.filter((p) =>
    ["processing", "preparing", "publishing"].includes(p.status)
  );
  const prepared = posts.filter((p) => p.status === "prepared");
  const completed = posts.filter((p) => p.status === "completed");
  const failed = posts.filter((p) => p.status === "failed");
  const hasOverdue = pending.some(
    (p) => new Date(p.scheduled_at) <= new Date()
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A]">
              Scheduled Posts
            </h1>
            <p className="text-[#5C5C5A] mt-1 text-sm">
              Manage your upcoming and past scheduled posts.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {(completed.length > 0 || failed.length > 0) && !processing && (
              <button
                onClick={deleteAllCompleted}
                className="bg-white border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#FF4F4F] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
              >
                Clear history
              </button>
            )}
            {hasOverdue && !processing && (
              <button
                onClick={handleProcessNow}
                className="bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
              >
                Post now
              </button>
            )}
          </div>
        </div>
      </div>

      {processingError && (
        <div className="border border-[#FF4F4F] bg-red-50 p-3 shadow-[4px_4px_0px_0px_#FF4F4F]">
          <p className="text-sm font-bold text-[#FF4F4F]">{processingError}</p>
        </div>
      )}

      {loading || processing ? (
        <div className="flex items-center gap-2 text-sm text-[#5C5C5A]">
          <div className="w-4 h-4 border-2 border-[#0A0A0A] border-t-transparent animate-spin" />
          {processing
            ? processingStatus || "Processing overdue posts..."
            : "Loading..."}
        </div>
      ) : posts.length === 0 ? (
        <div className="border border-[#0A0A0A] p-6 shadow-[4px_4px_0px_0px_#0A0A0A] text-center">
          <p className="text-sm text-[#5C5C5A]">No scheduled posts yet.</p>
          <a
            href="/compose"
            className="inline-block mt-3 bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
          >
            Create a post
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {/* In-progress (processing / preparing / publishing) */}
          {inProgress.length > 0 && (
            <div>
              <div className="font-bold text-sm text-[#00D4FF] mb-3">
                In Progress ({inProgress.length})
              </div>
              <div className="space-y-3">
                {inProgress.map((post) => (
                  <PostCard key={post.id} post={post} onDelete={() => deletePost(post.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Prepared — containers ready, waiting for publish time */}
          {prepared.length > 0 && (
            <div>
              <div className="font-bold text-sm text-teal-500 mb-3">
                Ready to Post ({prepared.length})
              </div>
              <div className="space-y-3">
                {prepared.map((post) => (
                  <PostCard key={post.id} post={post} onDelete={() => deletePost(post.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <div className="font-bold text-sm text-[#7C3AED] mb-3">
                Upcoming ({pending.length})
              </div>
              <div className="space-y-3">
                {pending.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDelete={() => deletePost(post.id)}
                    onReschedule={(newDate) => reschedulePost(post.id, newDate)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <div className="font-bold text-sm text-green-600 mb-3">
                Completed ({completed.length})
              </div>
              <div className="space-y-3">
                {completed.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDelete={() => deletePost(post.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <div>
              <div className="font-bold text-sm text-[#FF4F4F] mb-3">
                Failed ({failed.length})
              </div>
              <div className="space-y-3">
                {failed.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onDelete={() => deletePost(post.id)}
                    onRetry={() => retryPost(post.id)}
                    onReschedule={(newDate) => reschedulePost(post.id, newDate)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  onDelete,
  onRetry,
  onReschedule,
}: {
  post: ScheduledPost;
  onDelete?: () => void;
  onRetry?: () => void;
  onReschedule?: (newDate: string) => Promise<void>;
}) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const scheduledDate = new Date(post.scheduled_at);
  const isPast = scheduledDate <= new Date();

  return (
    <div
      className={cn(
        "border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]",
        post.status === "completed" &&
          "border-green-600 shadow-[4px_4px_0px_0px_#16a34a]",
        post.status === "failed" &&
          "border-[#FF4F4F] shadow-[4px_4px_0px_0px_#FF4F4F]",
        post.status === "pending" &&
          "border-[#7C3AED] shadow-[4px_4px_0px_0px_#7C3AED]",
        post.status === "prepared" &&
          "border-teal-500 shadow-[4px_4px_0px_0px_#14b8a6]",
        ["processing", "preparing", "publishing"].includes(post.status) &&
          "border-[#00D4FF] shadow-[4px_4px_0px_0px_#00D4FF]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm text-[#0A0A0A] truncate">
            {post.title}
          </div>
          <div className="text-xs text-[#5C5C5A] mt-0.5">
            {scheduledDate.toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div className="flex gap-1 mt-1.5">
            {post.platforms.map((p) => (
              <span
                key={p}
                className="text-[10px] font-bold px-1.5 py-0.5 bg-[#0A0A0A] text-[#F9F9F7] capitalize"
              >
                {p}
              </span>
            ))}
          </div>
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="text-[10px] text-[#5C5C5A] mt-1">
              {post.media_urls.length} media file
              {post.media_urls.length !== 1 ? "s" : ""}
            </div>
          )}
          {post.results && (
            <div className="mt-2 space-y-0.5">
              {Object.entries(post.results).map(([platform, result]) => (
                <div key={platform} className="text-xs flex items-center gap-1">
                  <span
                    className={
                      result.success ? "text-green-600" : "text-[#FF4F4F]"
                    }
                  >
                    {result.success ? "\u2713" : "\u2717"}
                  </span>
                  <span className="capitalize">{platform}</span>
                  {result.error && (
                    <span className="text-[#5C5C5A]">
                      {" "}
                      &mdash; {result.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5",
              post.status === "pending" && "bg-[#7C3AED] text-white",
              ["processing", "preparing", "publishing"].includes(post.status) && "bg-[#00D4FF] text-[#0A0A0A]",
              post.status === "prepared" && "bg-teal-500 text-white",
              post.status === "completed" && "bg-green-600 text-white",
              post.status === "failed" && "bg-[#FF4F4F] text-white"
            )}
          >
            {post.status === "pending" && isPast
              ? "POST NOW"
              : post.status === "pending"
              ? "SCHEDULED"
              : post.status === "preparing"
              ? "PROCESSING"
              : post.status === "prepared"
              ? "READY"
              : post.status === "publishing"
              ? "POSTING..."
              : post.status === "completed"
              ? "POSTED"
              : post.status === "failed"
              ? "FAILED"
              : post.status.toUpperCase()}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 text-[#7C3AED] hover:bg-[#7C3AED]/10 transition-colors"
              title="Retry post"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          )}
          {onReschedule && !showReschedule && (
            <button
              onClick={() => setShowReschedule(true)}
              className="flex items-center gap-1 p-1.5 text-[#5C5C5A] hover:bg-[#0A0A0A]/5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                <rect x="3" y="4" width="18" height="18" rx="0" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="text-[10px] font-bold">Reschedule</span>
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 text-[#FF4F4F] hover:bg-[#FF4F4F]/10 transition-colors"
              title="Delete post"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {showReschedule && (
        <div className="mt-3 flex gap-1.5 items-center">
          <input
            type="datetime-local"
            value={rescheduleDate}
            min={new Date(Date.now() + 5 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            onChange={(e) => setRescheduleDate(e.target.value)}
            className="flex-1 min-w-0 border border-[#0A0A0A] p-2 text-xs bg-[#F9F9F7] outline-none focus:shadow-[2px_2px_0px_0px_#C8FF00]"
          />
          <button
            onClick={async () => {
              if (!rescheduleDate) return;
              await onReschedule?.(rescheduleDate);
              setShowReschedule(false);
              setRescheduleDate("");
            }}
            disabled={!rescheduleDate}
            className="p-2 bg-[#C8FF00] border border-[#0A0A0A] shadow-[2px_2px_0px_0px_#0A0A0A] disabled:opacity-40 hover:enabled:translate-x-[1px] hover:enabled:translate-y-[1px] hover:enabled:shadow-none transition-all"
            title="Confirm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            onClick={() => { setShowReschedule(false); setRescheduleDate(""); }}
            className="p-2 border border-[#0A0A0A] shadow-[2px_2px_0px_0px_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
            title="Cancel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
