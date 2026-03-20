"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { processScheduledPosts } from "@/app/(app)/compose/actions";
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
  created_at: string;
};

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const loadPosts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, title, description, platforms, scheduled_at, status, results, media_urls, created_at")
      .order("scheduled_at", { ascending: true });
    setPosts(data ?? []);
    setLoading(false);
  }, []);

  // On mount: process any overdue posts, then load
  useEffect(() => {
    async function init() {
      setProcessing(true);
      try {
        const { processed } = await processScheduledPosts();
        if (processed > 0) {
          // Reload to show updated statuses
          await loadPosts();
        }
      } catch {
        // Processing failed silently — still load posts
      }
      setProcessing(false);
      await loadPosts();
    }
    init();
  }, [loadPosts]);

  async function handleProcessNow() {
    setProcessing(true);
    try {
      await processScheduledPosts();
    } catch {
      // ignore
    }
    await loadPosts();
    setProcessing(false);
  }

  async function cancelPost(id: string) {
    const supabase = createClient();
    await supabase.from("scheduled_posts").delete().eq("id", id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const pending = posts.filter((p) => p.status === "pending");
  const processingPosts = posts.filter((p) => p.status === "processing");
  const completed = posts.filter((p) => p.status === "completed");
  const failed = posts.filter((p) => p.status === "failed");
  const hasOverdue = pending.some((p) => new Date(p.scheduled_at) <= new Date());

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A]">Scheduled Posts</h1>
            <p className="text-[#5C5C5A] mt-1 text-sm">Manage your upcoming and past scheduled posts.</p>
          </div>
          {hasOverdue && !processing && (
            <button
              onClick={handleProcessNow}
              className="bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all shrink-0"
            >
              Post now
            </button>
          )}
        </div>
      </div>

      {loading || processing ? (
        <div className="flex items-center gap-2 text-sm text-[#5C5C5A]">
          <div className="w-4 h-4 border-2 border-[#0A0A0A] border-t-transparent animate-spin" />
          {processing ? "Processing overdue posts..." : "Loading..."}
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
          {/* Processing */}
          {processingPosts.length > 0 && (
            <div>
              <div className="font-bold text-sm text-[#00D4FF] mb-3">Processing ({processingPosts.length})</div>
              <div className="space-y-3">
                {processingPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <div className="font-bold text-sm text-[#7C3AED] mb-3">Upcoming ({pending.length})</div>
              <div className="space-y-3">
                {pending.map((post) => (
                  <PostCard key={post.id} post={post} onCancel={() => cancelPost(post.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <div className="font-bold text-sm text-green-600 mb-3">Completed ({completed.length})</div>
              <div className="space-y-3">
                {completed.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <div>
              <div className="font-bold text-sm text-[#FF4F4F] mb-3">Failed ({failed.length})</div>
              <div className="space-y-3">
                {failed.map((post) => (
                  <PostCard key={post.id} post={post} onCancel={() => cancelPost(post.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, onCancel }: { post: ScheduledPost; onCancel?: () => void }) {
  const scheduledDate = new Date(post.scheduled_at);
  const isPast = scheduledDate <= new Date();

  return (
    <div
      className={cn(
        "border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]",
        post.status === "completed" && "border-green-600 shadow-[4px_4px_0px_0px_#16a34a]",
        post.status === "failed" && "border-[#FF4F4F] shadow-[4px_4px_0px_0px_#FF4F4F]",
        post.status === "pending" && "border-[#7C3AED] shadow-[4px_4px_0px_0px_#7C3AED]",
        post.status === "processing" && "border-[#00D4FF] shadow-[4px_4px_0px_0px_#00D4FF]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-sm text-[#0A0A0A] truncate">{post.title}</div>
          <div className="text-xs text-[#5C5C5A] mt-0.5">
            {scheduledDate.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="flex gap-1 mt-1.5">
            {post.platforms.map((p) => (
              <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 bg-[#0A0A0A] text-[#F9F9F7] capitalize">
                {p}
              </span>
            ))}
          </div>
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="text-[10px] text-[#5C5C5A] mt-1">
              {post.media_urls.length} media file{post.media_urls.length !== 1 ? "s" : ""}
            </div>
          )}
          {post.results && (
            <div className="mt-2 space-y-0.5">
              {Object.entries(post.results).map(([platform, result]) => (
                <div key={platform} className="text-xs flex items-center gap-1">
                  <span className={result.success ? "text-green-600" : "text-[#FF4F4F]"}>
                    {result.success ? "\u2713" : "\u2717"}
                  </span>
                  <span className="capitalize">{platform}</span>
                  {result.error && <span className="text-[#5C5C5A]"> &mdash; {result.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5",
              post.status === "pending" && "bg-[#7C3AED] text-white",
              post.status === "processing" && "bg-[#00D4FF] text-[#0A0A0A]",
              post.status === "completed" && "bg-green-600 text-white",
              post.status === "failed" && "bg-[#FF4F4F] text-white"
            )}
          >
            {post.status === "pending" && isPast ? "OVERDUE" : post.status.toUpperCase()}
          </span>
          {onCancel && post.status !== "completed" && (
            <button
              onClick={onCancel}
              className="text-[10px] text-[#FF4F4F] font-bold hover:underline mt-1"
            >
              {post.status === "failed" ? "Delete" : "Cancel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
