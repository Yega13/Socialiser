"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { refreshYouTubeToken, refreshInstagramToken, postToInstagramServer } from "./actions";

type ConnectedPlatform = {
  id: string;
  platform: string;
  platform_username: string | null;
  platform_user_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
};

async function postToYouTube(
  accessToken: string,
  title: string,
  description: string,
  videoFile: File
): Promise<{ success: boolean; error?: string }> {
  const metadata = {
    snippet: { title: title || "New Video", description: description || "", categoryId: "22" },
    status: { privacyStatus: "public" },
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("video", videoFile);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: form }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err?.error?.message ?? `YouTube error ${res.status}` };
  }
  return { success: true };
}

export default function ComposePage() {
  const [connected, setConnected] = useState<ConnectedPlatform[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [postingStatus, setPostingStatus] = useState("");
  const [results, setResults] = useState<Record<
    string,
    { success: boolean; error?: string }
  > | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("connected_platforms")
      .select("id, platform, platform_username, platform_user_id, access_token, refresh_token, token_expires_at")
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

    const supabase = createClient();
    const postResults: Record<string, { success: boolean; error?: string }> = {};

    for (const platformId of selected) {
      const conn = connected.find((c) => c.platform === platformId);
      if (!conn) {
        postResults[platformId] = { success: false, error: "Not connected" };
        continue;
      }

      let accessToken = conn.access_token;

      // Refresh token if expired
      if (conn.token_expires_at && new Date(conn.token_expires_at) <= new Date()) {
        if (platformId === "youtube" && conn.refresh_token) {
          setPostingStatus("Refreshing YouTube token...");
          const newToken = await refreshYouTubeToken(conn.refresh_token);
          if (newToken) {
            accessToken = newToken;
            await supabase.from("connected_platforms").update({
              access_token: newToken,
              token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }).eq("id", conn.id);
          }
        } else if (platformId === "instagram") {
          setPostingStatus("Refreshing Instagram token...");
          const result = await refreshInstagramToken(accessToken);
          if (result) {
            accessToken = result.access_token;
            await supabase.from("connected_platforms").update({
              access_token: result.access_token,
              token_expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
            }).eq("id", conn.id);
          }
        }
      }

      if (platformId === "youtube") {
        if (!mediaFile || mediaFile.size === 0 || !mediaFile.type.startsWith("video/")) {
          postResults[platformId] = { success: false, error: "YouTube requires a video file" };
        } else {
          setPostingStatus("Uploading to YouTube...");
          postResults[platformId] = await postToYouTube(accessToken, title, description, mediaFile);
        }
      }

      if (platformId === "instagram") {
        if (!mediaFile || mediaFile.size === 0) {
          postResults[platformId] = { success: false, error: "Instagram requires an image or video" };
        } else if (!conn.platform_user_id) {
          postResults[platformId] = { success: false, error: "Instagram account ID missing. Reconnect." };
        } else {
          const isVideo = mediaFile.type.startsWith("video/");

          setPostingStatus("Uploading media...");
          const fileName = `instagram/${Date.now()}-${mediaFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from("media")
            .upload(fileName, mediaFile, { upsert: true });

          if (uploadError) {
            postResults[platformId] = { success: false, error: `Upload failed: ${uploadError.message}` };
          } else {
            const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);

            setPostingStatus(isVideo ? "Publishing reel (this may take a minute)..." : "Publishing to Instagram...");
            postResults[platformId] = await postToInstagramServer(
              accessToken,
              conn.platform_user_id,
              `${title}${description ? "\n\n" + description : ""}`,
              urlData.publicUrl,
              isVideo
            );
          }
        }
      }
    }

    setPostingStatus("");
    setResults(postResults);
    setIsPosting(false);
  }

  function togglePlatform(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  const youtubeSelected = selected.includes("youtube");
  const instagramSelected = selected.includes("instagram");
  const needsMedia = youtubeSelected || instagramSelected;
  const canPost =
    !isPosting &&
    selected.length > 0 &&
    title.trim().length > 0 &&
    (!needsMedia || (mediaFile !== null && mediaFile.size > 0)) &&
    (!youtubeSelected || (mediaFile !== null && mediaFile.type.startsWith("video/")));

  const acceptTypes = youtubeSelected && !instagramSelected
    ? "video/*"
    : "image/*,video/*";

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
          Title / Caption
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={instagramSelected ? "Write a caption..." : "Video title or post content"}
          maxLength={instagramSelected ? 2200 : 100}
          className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] outline-none focus:shadow-[4px_4px_0px_0px_#C8FF00] transition-all"
        />
        <div className="text-xs text-[#5C5C5A] mt-1 text-right">
          {title.length}/{instagramSelected ? 2200 : 100}
        </div>
      </div>

      {/* Description (only for YouTube) */}
      {youtubeSelected && (
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
      )}

      {/* Media upload */}
      {needsMedia && (
        <div>
          <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
            {youtubeSelected && instagramSelected
              ? "Media (video for YouTube, image or video for Instagram)"
              : youtubeSelected
              ? "Video"
              : "Photo or Video"}
            {" "}<span className="text-[#FF4F4F]">*</span>
          </label>
          <input
            type="file"
            accept={acceptTypes}
            onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
            className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] cursor-pointer"
          />
          {mediaFile && (
            <div className="text-xs text-[#5C5C5A] mt-1">
              {mediaFile.name} ({(mediaFile.size / 1024 / 1024).toFixed(1)} MB)
              {youtubeSelected && !mediaFile.type.startsWith("video/") && (
                <span className="text-[#FF4F4F] ml-2">YouTube requires a video file</span>
              )}
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
              <span className={result.success ? "text-green-600 font-bold" : "text-[#FF4F4F] font-bold"}>
                {result.success ? "\u2713" : "\u2717"}
              </span>
              <span className="font-medium capitalize">{platform}</span>
              {result.error && <span className="text-[#5C5C5A]">&mdash; {result.error}</span>}
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
        <div className="space-y-2">
          <button
            onClick={handlePost}
            disabled={!canPost}
            className="w-full bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-6 py-3 font-bold text-[#0A0A0A] disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:translate-x-[2px] hover:enabled:translate-y-[2px] hover:enabled:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all flex items-center justify-center gap-3"
          >
            {isPosting && (
              <div className="w-5 h-5 border-2 border-[#0A0A0A] border-t-transparent animate-spin" />
            )}
            {isPosting
              ? "Uploading..."
              : `Post to ${selected.length} platform${selected.length !== 1 ? "s" : ""}`}
          </button>
          {isPosting && postingStatus && (
            <p className="text-xs text-[#5C5C5A] text-center">{postingStatus}</p>
          )}
        </div>
      )}
    </div>
  );
}
