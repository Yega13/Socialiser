"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { refreshYouTubeToken, refreshInstagramToken, postToInstagramServer, postCarouselToInstagram } from "./actions";

type ConnectedPlatform = {
  id: string;
  platform: string;
  platform_username: string | null;
  platform_user_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
};

type MediaItem = {
  file: File;
  preview: string;
  needsPadding: boolean;
};

const ASPECT_MODES = [
  { id: "original", label: "Original", ratio: null, icon: "↔" },
  { id: "square", label: "1:1", ratio: 1, icon: "□" },
  { id: "portrait", label: "4:5", ratio: 4 / 5, icon: "▯" },
  { id: "landscape", label: "1.91:1", ratio: 1.91, icon: "▭" },
] as const;

type AspectMode = (typeof ASPECT_MODES)[number]["id"];

const PAD_COLORS = [
  { label: "White", value: "#FFFFFF" },
  { label: "Black", value: "#000000" },
  { label: "Lime", value: "#C8FF00" },
  { label: "Violet", value: "#7C3AED" },
];

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

async function prepareImageForInstagram(
  file: File,
  padColor: string,
  quality = 0.92,
  targetRatio: number | null = null,
): Promise<{ blob: Blob; name: string }> {
  const img = new Image();
  const blobUrl = URL.createObjectURL(file);
  await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = blobUrl; });
  URL.revokeObjectURL(blobUrl);

  const { width, height } = img;
  const ratio = width / height;
  const canvas = document.createElement("canvas");

  if (targetRatio !== null) {
    // Crop mode: center-crop to target ratio
    let srcX = 0, srcY = 0, srcW = width, srcH = height;
    if (ratio > targetRatio) {
      // Image is wider — crop sides
      srcW = Math.round(height * targetRatio);
      srcX = Math.round((width - srcW) / 2);
    } else if (ratio < targetRatio) {
      // Image is taller — crop top/bottom
      srcH = Math.round(width / targetRatio);
      srcY = Math.round((height - srcH) / 2);
    }
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  } else {
    // Original mode: pad if outside Instagram's 4:5–1.91:1 range
    const minRatio = 4 / 5;
    const maxRatio = 1.91;
    let drawX = 0, drawY = 0;

    if (ratio < minRatio) {
      const newWidth = Math.ceil(height * minRatio);
      canvas.width = newWidth;
      canvas.height = height;
      drawX = Math.floor((newWidth - width) / 2);
    } else if (ratio > maxRatio) {
      const newHeight = Math.ceil(width / maxRatio);
      canvas.width = width;
      canvas.height = newHeight;
      drawY = Math.floor((newHeight - height) / 2);
    } else {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = padColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, drawX, drawY);
  }

  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality)
  );
  return { blob, name: file.name.replace(/\.[^.]+$/, ".jpg") };
}

export default function ComposePage() {
  const [connected, setConnected] = useState<ConnectedPlatform[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [padColor, setPadColor] = useState("#FFFFFF");
  const [aspectMode, setAspectMode] = useState<AspectMode>("original");
  const [imageQuality, setImageQuality] = useState(92);
  const [isPosting, setIsPosting] = useState(false);
  const [postingStatus, setPostingStatus] = useState("");
  const [results, setResults] = useState<Record<
    string,
    { success: boolean; error?: string }
  > | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
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

  async function handleFilesChange(files: FileList | null) {
    if (!files || files.length === 0) return;

    // Clean up old previews
    mediaItems.forEach((item) => URL.revokeObjectURL(item.preview));

    const newItems: MediaItem[] = [];
    const maxFiles = instagramSelected ? 10 : 1;
    const filesToAdd = Array.from(files).slice(0, maxFiles);

    for (const file of filesToAdd) {
      const preview = URL.createObjectURL(file);
      let needsPadding = false;

      if (file.type.startsWith("image/")) {
        const img = new Image();
        await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = preview; });
        const ratio = img.width / img.height;
        needsPadding = ratio < 4 / 5 || ratio > 1.91;
      }

      newItems.push({ file, preview, needsPadding });
    }

    setMediaItems(newItems);
    setPreviewIndex(0);
  }

  function removeMediaItem(index: number) {
    URL.revokeObjectURL(mediaItems[index].preview);
    const updated = mediaItems.filter((_, i) => i !== index);
    setMediaItems(updated);
    if (previewIndex >= updated.length) setPreviewIndex(Math.max(0, updated.length - 1));
  }

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
        const videoItem = mediaItems.find((m) => m.file.type.startsWith("video/"));
        if (!videoItem) {
          postResults[platformId] = { success: false, error: "YouTube requires a video file" };
        } else {
          setPostingStatus("Uploading to YouTube...");
          postResults[platformId] = await postToYouTube(accessToken, title, description, videoItem.file);
        }
      }

      if (platformId === "instagram") {
        if (mediaItems.length === 0) {
          postResults[platformId] = { success: false, error: "Instagram requires at least one image or video" };
        } else if (!conn.platform_user_id) {
          postResults[platformId] = { success: false, error: "Instagram account ID missing. Reconnect." };
        } else {
          // Upload all media files to Supabase
          const uploadedItems: { url: string; isVideo: boolean }[] = [];
          let uploadFailed = false;

          for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            const isVideo = item.file.type.startsWith("video/");

            setPostingStatus(`Uploading file ${i + 1}/${mediaItems.length}...`);

            let fileToUpload: File | Blob = item.file;
            let uploadName = item.file.name;

            if (!isVideo) {
              const modeRatio = ASPECT_MODES.find((m) => m.id === aspectMode)?.ratio ?? null;
              const prepared = await prepareImageForInstagram(item.file, padColor, imageQuality / 100, modeRatio);
              fileToUpload = prepared.blob;
              uploadName = prepared.name;
            }

            const fileName = `instagram/${Date.now()}-${i}-${uploadName}`;
            const { error: uploadError } = await supabase.storage
              .from("media")
              .upload(fileName, fileToUpload, { upsert: true, contentType: isVideo ? item.file.type : "image/jpeg" });

            if (uploadError) {
              postResults[platformId] = { success: false, error: `Upload failed (file ${i + 1}): ${uploadError.message}` };
              uploadFailed = true;
              break;
            }

            const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
            uploadedItems.push({ url: urlData.publicUrl, isVideo });
          }

          if (!uploadFailed) {
            const caption = `${title}${description ? "\n\n" + description : ""}`;

            if (uploadedItems.length === 1) {
              // Single post
              setPostingStatus(uploadedItems[0].isVideo ? "Publishing reel..." : "Publishing to Instagram...");
              postResults[platformId] = await postToInstagramServer(
                accessToken,
                conn.platform_user_id,
                caption,
                uploadedItems[0].url,
                uploadedItems[0].isVideo
              );
            } else {
              // Carousel post
              setPostingStatus(`Publishing carousel (${uploadedItems.length} items)...`);
              postResults[platformId] = await postCarouselToInstagram(
                accessToken,
                conn.platform_user_id,
                caption,
                uploadedItems
              );
            }
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
  const instagramConnected = connected.find((c) => c.platform === "instagram");
  const needsMedia = youtubeSelected || instagramSelected;
  const hasAnyPadding = mediaItems.some((m) => m.needsPadding && !m.file.type.startsWith("video/"));
  const canPost =
    !isPosting &&
    selected.length > 0 &&
    title.trim().length > 0 &&
    (!needsMedia || mediaItems.length > 0) &&
    (!youtubeSelected || mediaItems.some((m) => m.file.type.startsWith("video/")));

  const acceptTypes = youtubeSelected && !instagramSelected
    ? "video/*"
    : "image/*,video/*";

  const currentPreview = mediaItems[previewIndex] ?? null;

  return (
    <div className="flex gap-8 max-w-4xl">
      {/* Left — form */}
      <div className="flex-1 min-w-0 space-y-6">
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

        {/* Description / Links */}
        <div>
          <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
            Description / Links
            <span className="font-normal text-[#5C5C5A] ml-2">
              {instagramSelected ? "Added below caption on Instagram" : "Optional"}
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={instagramSelected
              ? "Add links, hashtags, mentions...\ne.g. https://yoursite.com #hashtag @mention"
              : "Add a description, links..."}
            rows={3}
            className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] outline-none focus:shadow-[4px_4px_0px_0px_#C8FF00] transition-all resize-none"
          />
        </div>

        {/* Media upload */}
        {needsMedia && (
          <div>
            <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
              {youtubeSelected && instagramSelected
                ? "Media (video for YouTube, image or video for Instagram)"
                : youtubeSelected
                ? "Video"
                : "Photos & Videos"}
              {" "}<span className="text-[#FF4F4F]">*</span>
              {instagramSelected && (
                <span className="font-normal text-[#5C5C5A] ml-2">Up to 10 for carousel</span>
              )}
            </label>
            <input
              type="file"
              accept={acceptTypes}
              multiple={instagramSelected}
              onChange={(e) => handleFilesChange(e.target.files)}
              className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] cursor-pointer"
            />
            {mediaItems.length > 0 && (
              <div className="mt-2 space-y-1">
                {mediaItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[#5C5C5A]">
                    <span className="font-bold text-[#0A0A0A] w-5">{i + 1}.</span>
                    <span className="truncate flex-1">{item.file.name}</span>
                    <span>({(item.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                    {item.needsPadding && instagramSelected && aspectMode === "original" && (
                      <span className="text-[#FF4F4F] font-bold text-[10px]">PAD</span>
                    )}
                    {!item.file.type.startsWith("video/") && instagramSelected && aspectMode !== "original" && (
                      <span className="text-[#0095F6] font-bold text-[10px]">CROP</span>
                    )}
                    <button
                      onClick={() => removeMediaItem(i)}
                      className="text-[#FF4F4F] font-black hover:scale-110 transition-transform px-1"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aspect ratio selector */}
        {instagramSelected && mediaItems.some((m) => m.file.type.startsWith("image/")) && (
          <div>
            <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
              Crop mode
              <span className="font-normal text-[#5C5C5A] ml-2">
                {aspectMode === "original" ? "Pads if needed" : "Center crop"}
              </span>
            </label>
            <div className="flex gap-2">
              {ASPECT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setAspectMode(mode.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 border text-xs font-bold transition-all",
                    aspectMode === mode.id
                      ? "bg-[#0A0A0A] text-[#F9F9F7] border-[#0A0A0A] shadow-[2px_2px_0px_0px_#C8FF00]"
                      : "bg-[#F9F9F7] text-[#0A0A0A] border-[#0A0A0A] shadow-[2px_2px_0px_0px_#0A0A0A] opacity-50"
                  )}
                >
                  <span className="text-base leading-none">{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Padding color picker */}
        {instagramSelected && aspectMode === "original" && hasAnyPadding && (
          <div>
            <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
              Padding color
              <span className="font-normal text-[#5C5C5A] ml-2">For images that need ratio adjustment</span>
            </label>
            <div className="flex gap-2">
              {PAD_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setPadColor(c.value)}
                  className={cn(
                    "w-9 h-9 border-2 transition-all",
                    padColor === c.value
                      ? "border-[#C8FF00] shadow-[2px_2px_0px_0px_#0A0A0A] scale-110"
                      : "border-[#0A0A0A]"
                  )}
                  style={{ background: c.value }}
                  title={c.label}
                />
              ))}
              <label className="flex items-center gap-2 text-xs font-bold text-[#0A0A0A] cursor-pointer">
                <input
                  type="color"
                  value={padColor}
                  onChange={(e) => setPadColor(e.target.value)}
                  className="w-9 h-9 border-2 border-[#0A0A0A] cursor-pointer p-0"
                />
                Custom
              </label>
            </div>
          </div>
        )}

        {/* Image quality */}
        {instagramSelected && mediaItems.some((m) => m.file.type.startsWith("image/")) && (
          <div>
            <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
              Image quality
              <span className="font-normal text-[#5C5C5A] ml-2">{imageQuality}%</span>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#5C5C5A] shrink-0">Low</span>
              <input
                type="range"
                min={30}
                max={100}
                value={imageQuality}
                onChange={(e) => setImageQuality(Number(e.target.value))}
                className="flex-1 accent-[#0A0A0A] h-2 cursor-pointer"
              />
              <span className="text-xs text-[#5C5C5A] shrink-0">Max</span>
            </div>
            <div className="text-xs text-[#5C5C5A] mt-1">
              {imageQuality >= 90 ? "Best quality, larger file" : imageQuality >= 60 ? "Good quality, moderate file size" : "Smaller file, some quality loss"}
            </div>
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
                : mediaItems.length > 1 && instagramSelected
                ? `Post carousel to ${selected.length} platform${selected.length !== 1 ? "s" : ""}`
                : `Post to ${selected.length} platform${selected.length !== 1 ? "s" : ""}`}
            </button>
            {isPosting && postingStatus && (
              <p className="text-xs text-[#5C5C5A] text-center">{postingStatus}</p>
            )}
          </div>
        )}
      </div>

      {/* Right — Instagram-style preview */}
      {mediaItems.length > 0 && (
        <div className="hidden md:block w-80 shrink-0">
          <div className="sticky top-24 space-y-3">
            <div className="font-bold text-sm text-[#0A0A0A]">Preview</div>

            {/* Instagram post mockup */}
            <div className="border border-[#DBDBDB] bg-white rounded-sm overflow-hidden">
              {/* Header — avatar + username */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FCAF45] via-[#E1306C] to-[#833AB4] flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-[#262626]">
                    {(instagramConnected?.platform_username ?? "you")[0].toUpperCase()}
                  </div>
                </div>
                <span className="text-[13px] font-semibold text-[#262626]">
                  {instagramConnected?.platform_username ?? "your_account"}
                </span>
              </div>

              {/* Image area */}
              <div
                className="relative bg-black overflow-hidden"
                style={{
                  aspectRatio: aspectMode === "square" ? "1/1"
                    : aspectMode === "portrait" ? "4/5"
                    : aspectMode === "landscape" ? "1.91/1"
                    : "1/1",
                }}
              >
                {currentPreview?.file.type.startsWith("video/") ? (
                  <video
                    key={currentPreview.preview}
                    src={currentPreview.preview}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : currentPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentPreview.preview}
                    alt="Preview"
                    className={cn(
                      "w-full h-full",
                      aspectMode === "original" ? "object-contain" : "object-cover"
                    )}
                  />
                ) : null}

                {/* Carousel dots */}
                {mediaItems.length > 1 && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
                    {mediaItems.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewIndex(i)}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all",
                          i === previewIndex ? "bg-[#0095F6] scale-125" : "bg-white/60"
                        )}
                      />
                    ))}
                  </div>
                )}

                {/* Carousel arrows */}
                {mediaItems.length > 1 && previewIndex > 0 && (
                  <button
                    onClick={() => setPreviewIndex((p) => p - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-[#262626] text-xs shadow-sm"
                  >
                    &lt;
                  </button>
                )}
                {mediaItems.length > 1 && previewIndex < mediaItems.length - 1 && (
                  <button
                    onClick={() => setPreviewIndex((p) => p + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-[#262626] text-xs shadow-sm"
                  >
                    &gt;
                  </button>
                )}
              </div>

              {/* Action icons */}
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>

              {/* Caption preview */}
              <div className="px-3 pb-3 pt-1">
                <p className="text-[13px] text-[#262626] leading-[18px]">
                  <span className="font-semibold">{instagramConnected?.platform_username ?? "your_account"}</span>{" "}
                  <span className="whitespace-pre-wrap break-words">
                    {title || "Your caption here..."}
                    {description && (
                      <>
                        {"\n\n"}
                        <span className="text-[#00376B]">{description}</span>
                      </>
                    )}
                  </span>
                </p>
              </div>
            </div>

            {/* File info */}
            {currentPreview && (
              <div className="text-xs text-[#5C5C5A] flex items-center gap-2">
                <span className="truncate">{currentPreview.file.name}</span>
                <span className="shrink-0">({(currentPreview.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                {instagramSelected && !currentPreview.file.type.startsWith("video/") && (
                  aspectMode === "original" && currentPreview.needsPadding
                    ? <span className="text-[#FF4F4F] font-bold shrink-0">+pad</span>
                    : aspectMode !== "original"
                    ? <span className="text-[#0095F6] font-bold shrink-0">crop {ASPECT_MODES.find((m) => m.id === aspectMode)?.label}</span>
                    : null
                )}
              </div>
            )}

            {/* Thumbnail strip */}
            {mediaItems.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {mediaItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewIndex(i)}
                    className={cn(
                      "w-12 h-12 shrink-0 border-2 overflow-hidden transition-all",
                      i === previewIndex
                        ? "border-[#C8FF00] shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "border-[#0A0A0A] opacity-60"
                    )}
                  >
                    {item.file.type.startsWith("video/") ? (
                      <div className="w-full h-full bg-[#0A0A0A] flex items-center justify-center text-[#F9F9F7] text-[10px] font-black">
                        VID
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.preview} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
