"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type ConnectedPlatform = { platform: string; platform_username: string | null };

export default function ComposePage() {
  const [connected, setConnected] = useState<ConnectedPlatform[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [results, setResults] = useState<Record<
    string,
    { success: boolean; error?: string }
  > | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("connected_platforms")
      .select("platform, platform_username")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          setConnected(data);
          setSelected(data.map((p) => p.platform));
        }
      });
  }, []);

  async function handlePost() {
    if (!title.trim() || selected.length === 0) return;
    setIsPosting(true);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("platforms", JSON.stringify(selected));
    if (video) formData.append("video", video);

    const res = await fetch("/api/post", { method: "POST", body: formData });
    const data = await res.json();
    setResults(data.results);
    setIsPosting(false);
  }

  function togglePlatform(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const youtubeSelected = selected.includes("youtube");
  const canPost =
    !isPosting &&
    selected.length > 0 &&
    title.trim().length > 0 &&
    (!youtubeSelected || (video !== null && video.size > 0));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A]">
          New Post
        </h1>
        <p className="text-[#5C5C5A] mt-1 text-sm">
          Post to all your connected platforms at once.
        </p>
      </div>

      {/* Platform selector */}
      <div>
        <div className="font-bold text-sm text-[#0A0A0A] mb-3">Post to</div>
        {connected.length === 0 ? (
          <p className="text-sm text-[#5C5C5A]">
            No platforms connected.{" "}
            <a href="/dashboard" className="underline font-bold">
              Connect one first.
            </a>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {connected.map(({ platform, platform_username }) => {
              const p = PLATFORMS.find((pl) => pl.id === platform);
              if (!p) return null;
              const isSelected = selected.includes(platform);
              return (
                <button
                  key={platform}
                  onClick={() => togglePlatform(platform)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 border border-[#0A0A0A] text-sm font-bold transition-all",
                    isSelected
                      ? "bg-[#0A0A0A] text-[#F9F9F7] shadow-[2px_2px_0px_0px_#C8FF00]"
                      : "bg-[#F9F9F7] text-[#0A0A0A] shadow-[2px_2px_0px_0px_#0A0A0A] opacity-50"
                  )}
                >
                  <span
                    className="w-5 h-5 flex items-center justify-center text-xs font-black"
                    style={{ background: p.color, color: "#F9F9F7" }}
                  >
                    {p.icon}
                  </span>
                  {platform_username ?? p.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
          Title{" "}
          {youtubeSelected && (
            <span className="text-[#FF4F4F]">* required for YouTube</span>
          )}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Video title or post content"
          maxLength={100}
          className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] outline-none focus:shadow-[4px_4px_0px_0px_#C8FF00] transition-all"
        />
        <div className="text-xs text-[#5C5C5A] mt-1 text-right">
          {title.length}/100
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description..."
          rows={4}
          className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] outline-none focus:shadow-[4px_4px_0px_0px_#C8FF00] transition-all resize-none"
        />
      </div>

      {/* Video upload (YouTube) */}
      {youtubeSelected && (
        <div>
          <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
            Video <span className="text-[#FF4F4F]">*</span>
            <span className="text-[#5C5C5A] font-normal ml-1">
              (required for YouTube, max 100MB)
            </span>
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] cursor-pointer"
          />
          {video && (
            <div className="text-xs text-[#5C5C5A] mt-1">
              {video.name} ({(video.size / 1024 / 1024).toFixed(1)} MB)
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]">
          <div className="font-bold text-sm mb-3">Results</div>
          {Object.entries(results).map(([platform, result]) => (
            <div key={platform} className="flex items-center gap-2 text-sm py-1">
              <span
                className={
                  result.success ? "text-green-600 font-bold" : "text-[#FF4F4F] font-bold"
                }
              >
                {result.success ? "✓" : "✗"}
              </span>
              <span className="font-medium capitalize">{platform}</span>
              {result.error && (
                <span className="text-[#5C5C5A]">— {result.error}</span>
              )}
            </div>
          ))}
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 w-full bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      )}

      {/* Post button */}
      {!results && (
        <button
          onClick={handlePost}
          disabled={!canPost}
          className="w-full bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-6 py-3 font-bold text-[#0A0A0A] disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:translate-x-[2px] hover:enabled:translate-y-[2px] hover:enabled:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
        >
          {isPosting
            ? "Posting..."
            : `Post to ${selected.length} platform${selected.length !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
