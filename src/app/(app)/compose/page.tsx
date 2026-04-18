"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PLATFORMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { refreshYouTubeToken, refreshInstagramToken, refreshThreadsToken, refreshBlueskySession, postToInstagramServer, postCarouselToInstagram, postToThreadsServer, postCarouselToThreads, postToBlueskyServer, postToFacebookServer, postCarouselToFacebook, uploadMastodonMedia, checkMastodonMedia, postToMastodonServer } from "./actions";
import { uploadBlueskyVideo } from "@/lib/bluesky-video";
import type { BskyBlob } from "@/lib/bluesky-video";
import { resolveBlueskyPDS } from "@/lib/bluesky";
import { moderatePost } from "@/lib/moderation";

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
  cropOffset: { x: number; y: number };
};

type FilterSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
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
  videoFile: File,
  thumbnailBlob?: Blob | null,
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

  const data = await res.json();
  const videoId = data.id;

  // Set custom thumbnail if provided
  if (thumbnailBlob && videoId) {
    const thumbRes = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/jpeg" },
        body: thumbnailBlob,
      }
    );
    if (!thumbRes.ok) {
      return { success: true, error: "Video uploaded but custom thumbnail failed (channel may need verification)" };
    }
  }

  return { success: true };
}

/** Fast Bluesky image prep — downscales to max 2048px, crops to 1:1, JPEG 0.85. No padding, no Instagram logic. */
async function prepareImageForBluesky(
  file: File,
  offset: { x: number; y: number } = { x: 0.5, y: 0.5 },
  imageFilters: FilterSettings = { brightness: 100, contrast: 100, saturation: 100 },
): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const MAX = 2048;

  // Downscale to max dimension first — this is the key speed optimization
  let sw = width, sh = height;
  if (sw > MAX || sh > MAX) {
    const scale = MAX / Math.max(sw, sh);
    sw = Math.round(sw * scale);
    sh = Math.round(sh * scale);
  }

  // Crop to 1:1
  const side = Math.min(sw, sh);
  let srcX = 0, srcY = 0, srcW = width, srcH = height;
  const ratio = width / height;
  if (ratio > 1) {
    srcW = Math.round(height * 1);
    srcX = Math.round((width - srcW) * offset.x);
  } else if (ratio < 1) {
    srcH = Math.round(width / 1);
    srcY = Math.round((height - srcH) * offset.y);
  }

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;

  const hasFilters = imageFilters.brightness !== 100 || imageFilters.contrast !== 100 || imageFilters.saturation !== 100;
  if (hasFilters) {
    ctx.filter = `brightness(${imageFilters.brightness}%) contrast(${imageFilters.contrast}%) saturate(${imageFilters.saturation}%)`;
  }
  ctx.drawImage(bmp, srcX, srcY, srcW > width ? width : srcW, srcH > height ? height : srcH, 0, 0, side, side);
  bmp.close();

  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
}

async function prepareImageForInstagram(
  file: File,
  padColor: string,
  quality = 0.92,
  targetRatio: number | null = null,
  offset: { x: number; y: number } = { x: 0.5, y: 0.5 },
  imageFilters: FilterSettings = { brightness: 100, contrast: 100, saturation: 100 },
): Promise<{ blob: Blob; name: string }> {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const ratio = width / height;
  const canvas = document.createElement("canvas");
  const hasFilters = imageFilters.brightness !== 100 || imageFilters.contrast !== 100 || imageFilters.saturation !== 100;
  const filterStr = hasFilters ? `brightness(${imageFilters.brightness}%) contrast(${imageFilters.contrast}%) saturate(${imageFilters.saturation}%)` : "";

  if (targetRatio !== null) {
    let srcX = 0, srcY = 0, srcW = width, srcH = height;
    if (ratio > targetRatio) {
      srcW = Math.round(height * targetRatio);
      srcX = Math.round((width - srcW) * offset.x);
    } else if (ratio < targetRatio) {
      srcH = Math.round(width / targetRatio);
      srcY = Math.round((height - srcH) * offset.y);
    }
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext("2d")!;
    if (hasFilters) ctx.filter = filterStr;
    ctx.drawImage(bmp, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  } else {
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
    if (hasFilters) ctx.filter = filterStr;
    ctx.drawImage(bmp, drawX, drawY);
  }

  bmp.close();

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
  const [filters, setFilters] = useState<FilterSettings>({ brightness: 100, contrast: 100, saturation: 100 });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [postingStatus, setPostingStatus] = useState("");
  const [results, setResults] = useState<Record<
    string,
    { success: boolean; error?: string }
  > | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [previewTab, setPreviewTab] = useState<string>("instagram");
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [igPostType, setIgPostType] = useState<"post" | "reel" | "story">("post");
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const router = useRouter();

  const currentPreview = mediaItems[previewIndex] ?? null;
  const currentPreviewIsImage = currentPreview !== null && currentPreview.file.type.startsWith("image/");
  const canDrag = currentPreviewIsImage;

  const updateCropOffset = useCallback((clientX: number, clientY: number) => {
    if (!dragStart.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = (clientX - dragStart.current.x) / rect.width;
    const dy = (clientY - dragStart.current.y) / rect.height;
    const newX = Math.max(0, Math.min(1, dragStart.current.ox - dx));
    const newY = Math.max(0, Math.min(1, dragStart.current.oy - dy));
    setMediaItems((prev) => prev.map((item, i) =>
      i === previewIndex ? { ...item, cropOffset: { x: newX, y: newY } } : item
    ));
  }, [previewIndex]);

  function handleDragStart(clientX: number, clientY: number) {
    if (!canDrag) return;
    const item = mediaItems[previewIndex];
    if (!item) return;
    dragStart.current = { x: clientX, y: clientY, ox: item.cropOffset.x, oy: item.cropOffset.y };
    setIsDragging(true);
  }

  function captureVideoFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
        setThumbnailBlob(blob);
        setThumbnailPreview(URL.createObjectURL(blob));
      }
    }, "image/jpeg", 0.95);
  }

  useEffect(() => {
    if (!isDragging) return;
    function onMove(e: MouseEvent | TouchEvent) {
      const p = "touches" in e ? e.touches[0] : e;
      updateCropOffset(p.clientX, p.clientY);
    }
    function onUp() { setIsDragging(false); dragStart.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isDragging, updateCropOffset]);

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

  // Auto-switch preview tab when current tab's platform is deselected
  useEffect(() => {
    const currentSelected = selected.includes(previewTab);
    if (!currentSelected) {
      if (selected.includes("instagram")) setPreviewTab("instagram");
      else if (selected.includes("youtube")) setPreviewTab("youtube");
      else if (selected.includes("bluesky")) setPreviewTab("bluesky");
      else if (selected.includes("threads")) setPreviewTab("threads");
      else if (selected.includes("facebook")) setPreviewTab("facebook");
      else if (selected.includes("mastodon")) setPreviewTab("mastodon");
    }
  }, [selected, previewTab]);

  async function handleFilesChange(files: FileList | null) {
    if (!files || files.length === 0) return;

    // Clean up old previews
    mediaItems.forEach((item) => URL.revokeObjectURL(item.preview));

    const newItems: MediaItem[] = [];
    const mastodonSelected = selected.includes("mastodon");
    const maxFiles = threadsSelected ? 20 : instagramSelected ? 10 : facebookSelected ? 10 : blueskySelected ? 4 : mastodonSelected ? 4 : 1;
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

      newItems.push({ file, preview, needsPadding, cropOffset: { x: 0.5, y: 0.5 } });
    }

    setMediaItems(newItems);
    setPreviewIndex(0);
    // Default to "reel" for single video, "post" for images/carousel
    if (newItems.length === 1 && newItems[0].file.type.startsWith("video/")) {
      setIgPostType("reel");
    } else {
      setIgPostType("post");
    }
  }

  function removeMediaItem(index: number) {
    URL.revokeObjectURL(mediaItems[index].preview);
    const updated = mediaItems.filter((_, i) => i !== index);
    setMediaItems(updated);
    if (previewIndex >= updated.length) setPreviewIndex(Math.max(0, updated.length - 1));
  }

  async function handlePost() {
    if (!title.trim() || selected.length === 0) return;

    setModerationError(null);
    const modResult = moderatePost(title, description);
    if (modResult.blocked) {
      setModerationError(modResult.reason ?? "Content blocked by moderation.");
      return;
    }

    setIsPosting(true);
    setPostingStatus(`Posting to ${selected.length} platform${selected.length !== 1 ? "s" : ""} in parallel...`);

    const supabase = createClient();

    // Helper: refresh token for a platform, return fresh token or error
    async function getFreshToken(conn: ConnectedPlatform, platformId: string): Promise<{ token: string } | { error: string }> {
      let accessToken = conn.access_token;
      if (conn.token_expires_at && new Date(conn.token_expires_at) <= new Date()) {
        if (platformId === "youtube" && conn.refresh_token) {
          const newToken = await refreshYouTubeToken(conn.refresh_token);
          if (!newToken) return { error: "YouTube token expired. Reconnect in Settings." };
          accessToken = newToken;
          await supabase.from("connected_platforms").update({
            access_token: newToken,
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          }).eq("id", conn.id);
        } else if (platformId === "instagram") {
          const result = await refreshInstagramToken(accessToken);
          if (!result) return { error: "Instagram token expired. Reconnect in Settings." };
          accessToken = result.access_token;
          await supabase.from("connected_platforms").update({
            access_token: result.access_token,
            token_expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
          }).eq("id", conn.id);
        } else if (platformId === "threads") {
          const result = await refreshThreadsToken(accessToken);
          if (!result) return { error: "Threads token expired. Reconnect in Settings." };
          accessToken = result.access_token;
          await supabase.from("connected_platforms").update({
            access_token: result.access_token,
            token_expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
          }).eq("id", conn.id);
        } else if (platformId === "bluesky" && conn.refresh_token) {
          const result = await refreshBlueskySession(conn.refresh_token);
          if (!result) return { error: "Bluesky session expired. Reconnect in Settings." };
          accessToken = result.accessJwt;
          await supabase.from("connected_platforms").update({
            access_token: result.accessJwt,
            refresh_token: result.refreshJwt,
            token_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          }).eq("id", conn.id);
        }
      }
      return { token: accessToken };
    }

    // Pre-upload media to Supabase once (shared by Instagram + Threads + Facebook)
    const supabaseNeeded = (selected.includes("instagram") || selected.includes("threads") || selected.includes("facebook")) && mediaItems.length > 0;
    let sharedMediaUrls: { url: string; isVideo: boolean }[] | null = null;
    let sharedUploadError: string | null = null;

    if (supabaseNeeded) {
      setPostingStatus("Preparing & uploading media...");
      const uploadResults = await Promise.all(
        mediaItems.map(async (item, i) => {
          const isVideo = item.file.type.startsWith("video/");
          let fileToUpload: File | Blob = item.file;
          let uploadName = item.file.name;

          if (!isVideo) {
            const modeRatio = ASPECT_MODES.find((m) => m.id === aspectMode)?.ratio ?? null;
            const prepared = await prepareImageForInstagram(item.file, padColor, imageQuality / 100, modeRatio, item.cropOffset, filters);
            fileToUpload = prepared.blob;
            uploadName = prepared.name;
          }

          const fileName = `media/${Date.now()}-${i}-${uploadName}`;
          const { error: uploadError } = await supabase.storage
            .from("media")
            .upload(fileName, fileToUpload, { upsert: true, contentType: isVideo ? item.file.type : "image/jpeg" });

          if (uploadError) return { error: `Upload failed (file ${i + 1}): ${uploadError.message}` };

          const { data: signedData } = await supabase.storage.from("media").createSignedUrl(fileName, 3600);
          const mediaUrl = signedData?.signedUrl || supabase.storage.from("media").getPublicUrl(fileName).data.publicUrl;
          return { url: mediaUrl, isVideo };
        })
      );

      const firstErr = uploadResults.find((r) => "error" in r);
      if (firstErr && "error" in firstErr) {
        sharedUploadError = firstErr.error as string;
      } else {
        sharedMediaUrls = uploadResults as { url: string; isVideo: boolean }[];
      }
    }

    setPostingStatus(`Posting to ${selected.length} platform${selected.length !== 1 ? "s" : ""} in parallel...`);

    // Run all platforms in parallel
    const platformPromises = selected.map(async (platformId): Promise<[string, { success: boolean; error?: string }]> => {
      const conn = connected.find((c) => c.platform === platformId);
      if (!conn) return [platformId, { success: false, error: "Not connected" }];

      const tokenResult = await getFreshToken(conn, platformId);
      if ("error" in tokenResult) return [platformId, { success: false, error: tokenResult.error }];
      const accessToken = tokenResult.token;

      // ── YouTube ──
      if (platformId === "youtube") {
        const videoItem = mediaItems.find((m) => m.file.type.startsWith("video/"));
        if (!videoItem) return [platformId, { success: false, error: "YouTube requires a video file" }];
        return [platformId, await postToYouTube(accessToken, title, description, videoItem.file, thumbnailBlob)];
      }

      // ── Instagram ──
      if (platformId === "instagram") {
        if (mediaItems.length === 0) return [platformId, { success: false, error: "Instagram requires at least one image or video" }];
        if (!conn.platform_user_id) return [platformId, { success: false, error: "Instagram account ID missing. Reconnect." }];
        if (sharedUploadError) return [platformId, { success: false, error: sharedUploadError }];
        if (!sharedMediaUrls) return [platformId, { success: false, error: "Media upload failed" }];

        const caption = `${title}${description ? "\n\n" + description : ""}`;

        if (sharedMediaUrls.length === 1) {
          return [platformId, await postToInstagramServer(
            accessToken,
            conn.platform_user_id,
            caption,
            sharedMediaUrls[0].url,
            sharedMediaUrls[0].isVideo,
            effectiveIgPostType === "reel" ? "reel" : effectiveIgPostType === "story" ? "story" : "post"
          )];
        } else {
          return [platformId, await postCarouselToInstagram(
            accessToken,
            conn.platform_user_id,
            caption,
            sharedMediaUrls
          )];
        }
      }

      // ── Threads ──
      if (platformId === "threads") {
        if (!conn.platform_user_id) return [platformId, { success: false, error: "Threads account ID missing. Reconnect." }];
        const caption = `${title}${description ? "\n\n" + description : ""}`;

        try {
          if (mediaItems.length === 0) {
            const r = await postToThreadsServer(accessToken, conn.platform_user_id, caption);
            return [platformId, { ...r, error: r.error ? `[text] ${r.error}` : undefined }];
          }

          if (sharedUploadError) return [platformId, { success: false, error: `[upload] ${sharedUploadError}` }];
          if (!sharedMediaUrls) return [platformId, { success: false, error: "[upload] Media upload failed" }];

          if (sharedMediaUrls.length === 1) {
            const r = await postToThreadsServer(
              accessToken, conn.platform_user_id, caption, sharedMediaUrls[0].url, sharedMediaUrls[0].isVideo
            );
            return [platformId, { ...r, error: r.error ? `[single] ${r.error}` : undefined }];
          } else {
            const r = await postCarouselToThreads(
              accessToken, conn.platform_user_id, caption, sharedMediaUrls
            );
            return [platformId, { ...r, error: r.error ? `[carousel] ${r.error}` : undefined }];
          }
        } catch (err) {
          return [platformId, { success: false, error: `[threads-crash] ${err instanceof Error ? err.message : String(err)}` }];
        }
      }

      // ── Facebook ──
      if (platformId === "facebook") {
        if (!conn.platform_user_id) return [platformId, { success: false, error: "Facebook Page ID missing. Reconnect." }];
        const message = `${title}${description ? "\n\n" + description : ""}`;

        try {
          if (mediaItems.length === 0) {
            return [platformId, await postToFacebookServer(accessToken, conn.platform_user_id, message)];
          }
          if (sharedUploadError) return [platformId, { success: false, error: sharedUploadError }];
          if (!sharedMediaUrls) return [platformId, { success: false, error: "Media upload failed" }];

          if (sharedMediaUrls.length === 1) {
            return [platformId, await postToFacebookServer(
              accessToken, conn.platform_user_id, message, sharedMediaUrls[0].url, sharedMediaUrls[0].isVideo
            )];
          }
          // Multi-photo (Facebook doesn't support image+video mix; postCarouselToFacebook will error out cleanly if mixed)
          return [platformId, await postCarouselToFacebook(
            accessToken, conn.platform_user_id, message, sharedMediaUrls
          )];
        } catch (err) {
          return [platformId, { success: false, error: err instanceof Error ? err.message : String(err) }];
        }
      }

      // ── Bluesky ──
      if (platformId === "bluesky") {
        const postText = `${title}${description ? "\n\n" + description : ""}`;

        let bskyImageBlobs: BskyBlob[] | undefined;
        let bskyVideoBlob: BskyBlob | null = null;

        // Resolve the user's PDS — uploadBlob and createRecord MUST hit the same host
        const pdsEndpoint = await resolveBlueskyPDS(conn.platform_user_id!);

        if (mediaItems.length > 0) {
          const videoItem = mediaItems.find((m) => m.file.type.startsWith("video/"));
          if (videoItem) {
            const videoResult = await uploadBlueskyVideo(
              accessToken, conn.platform_user_id!, videoItem.file, videoItem.file.name,
              (msg) => setPostingStatus(msg)
            );
            if (videoResult.error) return [platformId, { success: false, error: `Video upload: ${videoResult.error}` }];
            bskyVideoBlob = videoResult.blob ?? null;
          } else {
            const imageItems = mediaItems.filter((m) => m.file.type.startsWith("image/")).slice(0, 4);
            if (imageItems.length > 0) {
              setPostingStatus("Uploading images to Bluesky...");
              const results = await Promise.all(imageItems.map(async (img) => {
                const blob = await prepareImageForBluesky(img.file, img.cropOffset, filters);
                const res = await fetch(`${pdsEndpoint}/xrpc/com.atproto.repo.uploadBlob`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/jpeg" },
                  body: blob,
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err?.message || `Image upload failed (${res.status})`);
                }
                const data = await res.json();
                return data.blob as BskyBlob;
              }));
              bskyImageBlobs = results;
            }
          }
        }

        return [platformId, await postToBlueskyServer(accessToken, conn.platform_user_id!, postText, bskyImageBlobs, bskyVideoBlob, pdsEndpoint)];
      }

      // ── Mastodon ──
      if (platformId === "mastodon") {
        const postText = `${title}${description ? "\n\n" + description : ""}`;
        const instance = (conn.refresh_token as string | undefined)?.replace(/\/+$/, "") || "";
        if (!instance) return [platformId, { success: false, error: "Mastodon instance missing. Reconnect in Settings." }];

        const mediaIds: string[] = [];
        if (mediaItems.length > 0) {
          setPostingStatus("Uploading media to Mastodon...");
          // Mastodon allows EITHER 1 video OR up to 4 images, never mixed
          const videoItem = mediaItems.find((m) => m.file.type.startsWith("video/"));
          const itemsToUpload = videoItem
            ? [videoItem]
            : mediaItems.filter((m) => m.file.type.startsWith("image/")).slice(0, 4);
          for (const item of itemsToUpload) {
            const buf = await item.file.arrayBuffer();
            const form = new FormData();
            form.append("file", new Blob([buf], { type: item.file.type }), item.file.name);
            const res = await fetch(`${instance}/api/v2/media`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: form,
            });
            if (!res.ok && res.status !== 202) {
              const err = await res.text().catch(() => "");
              return [platformId, { success: false, error: `Media upload failed (${res.status}): ${err.slice(0, 150)}` }];
            }
            const data = await res.json();
            if (!data?.id) return [platformId, { success: false, error: "Mastodon returned no media id" }];
            let mediaId: string = String(data.id);
            if (res.status === 202) {
              setPostingStatus("Processing media...");
              for (let attempt = 0; attempt < 10; attempt++) {
                await new Promise((r) => setTimeout(r, 1500));
                const state = await checkMastodonMedia(instance, accessToken, mediaId);
                if (state === "ready") break;
                if (state === "error") return [platformId, { success: false, error: "Mastodon media processing failed" }];
              }
            }
            mediaIds.push(mediaId);
          }
        }

        return [platformId, await postToMastodonServer(instance, accessToken, postText, mediaIds)];
      }

      return [platformId, { success: false, error: "Unknown platform" }];
    });

    try {
      const results = await Promise.allSettled(platformPromises);
      const postResults: Record<string, { success: boolean; error?: string }> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          const [platformId, platformResult] = result.value;
          postResults[platformId] = platformResult;
        } else {
          // Shouldn't happen but catch rejected promises
          const errMsg = result.reason instanceof Error ? result.reason.message : "Something went wrong";
          // Can't easily map back to platformId, set for all unresolved
          for (const pid of selected) {
            if (!postResults[pid]) postResults[pid] = { success: false, error: errMsg };
          }
        }
      }
      setResults(postResults);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      const postResults: Record<string, { success: boolean; error?: string }> = {};
      for (const platformId of selected) {
        postResults[platformId] = { success: false, error: message };
      }
      setResults(postResults);
    }

    setPostingStatus("");
    setIsPosting(false);
  }

  async function handleSchedule() {
    if (!title.trim() || selected.length === 0 || !scheduleDate) return;
    const scheduledMs = new Date(scheduleDate).getTime();
    if (isNaN(scheduledMs) || scheduledMs <= Date.now()) {
      setResults({ schedule: { success: false, error: "Can't schedule in the past." } });
      return;
    }
    if (scheduledMs - Date.now() < 4 * 60 * 1000) {
      setResults({ schedule: { success: false, error: "Please schedule at least 5 minutes ahead." } });
      return;
    }

    setModerationError(null);
    const modResult = moderatePost(title, description);
    if (modResult.blocked) {
      setModerationError(modResult.reason ?? "Content blocked by moderation.");
      return;
    }

    setIsPosting(true);
    setPostingStatus("Preparing scheduled post...");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsPosting(false); return; }

      // Upload all media to storage (pre-process images)
      const mediaUrls: string[] = [];
      const mediaTypes: string[] = [];
      const cropOffsets: { x: number; y: number }[] = [];

      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        const isVideo = item.file.type.startsWith("video/");
        setPostingStatus(`Preparing file ${i + 1}/${mediaItems.length}...`);

        let fileToUpload: File | Blob = item.file;
        let uploadName = item.file.name;
        let contentType = item.file.type;

        if (!isVideo && instagramSelected) {
          const modeRatio = ASPECT_MODES.find((m) => m.id === aspectMode)?.ratio ?? null;
          const prepared = await prepareImageForInstagram(item.file, padColor, imageQuality / 100, modeRatio, item.cropOffset, filters);
          fileToUpload = prepared.blob;
          uploadName = prepared.name;
          contentType = "image/jpeg";
        }

        const fileName = `scheduled/${Date.now()}-${i}-${uploadName}`;
        const { error } = await supabase.storage
          .from("media")
          .upload(fileName, fileToUpload, { upsert: true, contentType });

        if (error) {
          setResults({ schedule: { success: false, error: `Upload failed: ${error.message}` } });
          setIsPosting(false);
          setPostingStatus("");
          return;
        }

        // Store the raw file path — signed URLs are created at processing time
        mediaUrls.push(fileName);
        mediaTypes.push(contentType);
        cropOffsets.push(item.cropOffset);
      }

      // Upload thumbnail if set
      let thumbUrl: string | undefined;
      if (thumbnailBlob) {
        const thumbName = `scheduled/${Date.now()}-thumbnail.jpg`;
        const { error } = await supabase.storage
          .from("media")
          .upload(thumbName, thumbnailBlob, { upsert: true, contentType: "image/jpeg" });
        if (!error) {
          thumbUrl = thumbName; // Store path, not URL
        }
      }

      setPostingStatus("Saving schedule...");
      const { error: insertErr } = await supabase.from("scheduled_posts").insert({
        user_id: user.id,
        title,
        description: description || null,
        platforms: selected,
        scheduled_at: new Date(scheduleDate).toISOString(),
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        media_types: mediaTypes.length > 0 ? mediaTypes : null,
        aspect_mode: aspectMode,
        pad_color: padColor,
        image_quality: imageQuality,
        crop_offsets: cropOffsets,
        thumbnail_url: thumbUrl ?? null,
        filter_settings: filters,
        ig_post_type: effectiveIgPostType === "carousel" ? "post" : effectiveIgPostType,
      });

      if (insertErr) {
        setResults({ schedule: { success: false, error: insertErr.message } });
      } else {
        setResults({ schedule: { success: true } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setResults({ schedule: { success: false, error: message } });
    }

    setPostingStatus("");
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
  const blueskySelected = selected.includes("bluesky");
  const threadsSelected = selected.includes("threads");
  const facebookSelected = selected.includes("facebook");
  const needsMedia = youtubeSelected || instagramSelected;
  const showMediaPicker = needsMedia || blueskySelected || threadsSelected || facebookSelected;
  const hasAnyPadding = mediaItems.some((m) => m.needsPadding && !m.file.type.startsWith("video/"));
  const hasVideo = mediaItems.some((m) => m.file.type.startsWith("video/"));
  const videoCount = mediaItems.filter((m) => m.file.type.startsWith("video/")).length;
  const imageCount = mediaItems.filter((m) => m.file.type.startsWith("image/")).length;
  const facebookMixedMedia = facebookSelected && videoCount > 0 && imageCount > 0;
  const facebookMultipleVideos = facebookSelected && videoCount > 1;
  const canPost =
    !isPosting &&
    selected.length > 0 &&
    title.trim().length > 0 &&
    (!needsMedia || mediaItems.length > 0) &&
    (!youtubeSelected || hasVideo) &&
    !facebookMixedMedia &&
    !facebookMultipleVideos &&
    (!scheduleEnabled || scheduleDate.length > 0);
  const postBlockReason =
    youtubeSelected && !hasVideo && mediaItems.length > 0
      ? "YouTube requires video — deselect YouTube or upload a video"
      : facebookMixedMedia
      ? "Facebook can't mix images and videos — remove one type or deselect Facebook"
      : facebookMultipleVideos
      ? "Facebook supports only one video per post — remove extra videos or deselect Facebook"
      : scheduleEnabled && !scheduleDate
      ? "Pick a date & time to schedule"
      : null;

  const acceptTypes = youtubeSelected && !instagramSelected
    ? "video/*"
    : "image/*,video/*";

  // Instagram post type detection
  const isCarousel = mediaItems.length > 1;
  const hasSingleVideo = mediaItems.length === 1 && mediaItems[0]?.file.type.startsWith("video/");
  const hasSingleImage = mediaItems.length === 1 && mediaItems[0]?.file.type.startsWith("image/");
  // Carousel = always "post", single media = user chooses post type
  const showIgPostTypePicker = instagramSelected && (hasSingleVideo || hasSingleImage);
  const effectiveIgPostType: "post" | "reel" | "story" | "carousel" = isCarousel
    ? "carousel"
    : (hasSingleVideo || hasSingleImage)
    ? igPostType
    : "post";

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
          {youtubeSelected && mediaItems.length > 0 && mediaItems.some((m) => !m.file.type.startsWith("video/")) && (
            <p className="text-xs text-[#FF4F4F] font-bold mt-2">
              YouTube only supports videos — photos will be skipped on YouTube.
            </p>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
            Title / Caption
          </label>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setModerationError(null); }}
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
              Optional
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setModerationError(null); }}
            placeholder={instagramSelected
              ? "Add links, hashtags, mentions...\ne.g. https://yoursite.com #hashtag @mention"
              : "Add a description, links..."}
            rows={3}
            className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] outline-none focus:shadow-[4px_4px_0px_0px_#C8FF00] transition-all resize-none"
          />
        </div>

        {/* Media upload */}
        {showMediaPicker && (
          <div>
            <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
              {youtubeSelected && instagramSelected
                ? "Media (video for YouTube, image or video for Instagram)"
                : youtubeSelected
                ? "Video"
                : "Photos & Videos"}
              {needsMedia ? <>{" "}<span className="text-[#FF4F4F]">*</span></> : <span className="font-normal text-[#5C5C5A] ml-2">Optional</span>}
              {instagramSelected && (
                <span className="font-normal text-[#5C5C5A] ml-2">Up to 10 for carousel</span>
              )}
              {threadsSelected && !instagramSelected && (
                <span className="font-normal text-[#5C5C5A] ml-2">Up to 20 for carousel</span>
              )}
            </label>
            <input
              type="file"
              accept={acceptTypes}
              multiple={instagramSelected || threadsSelected || blueskySelected}
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
                      <span className="text-[#FF4F4F] font-bold text-[10px]" title="Image ratio outside 4:5–1.91:1 — colored bars will be added">PAD</span>
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

        {/* Instagram post type selector */}
        {instagramSelected && mediaItems.length > 0 && (
          <div>
            <label className="font-bold text-sm text-[var(--color-base-black)] block mb-2">
              Post type
              {isCarousel && (
                <span className="font-normal text-[var(--color-gray-500)] ml-2">Carousel — always posted as feed post</span>
              )}
            </label>
            {showIgPostTypePicker ? (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setIgPostType("post")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 border border-[var(--color-base-black)] text-sm font-bold transition-all",
                    igPostType === "post"
                      ? "bg-[var(--color-base-black)] text-[var(--color-base-white)] shadow-[2px_2px_0px_0px_#C8FF00]"
                      : "bg-[var(--color-base-white)] text-[var(--color-base-black)] shadow-[2px_2px_0px_0px_var(--color-base-black)] opacity-50 hover:opacity-75"
                  )}
                >
                  <span className="text-base leading-none">{hasSingleVideo ? "▶" : "◻"}</span>
                  {hasSingleVideo ? "Video Post" : "Feed Post"}
                </button>
                {hasSingleVideo && (
                  <button
                    onClick={() => setIgPostType("reel")}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 border border-[var(--color-base-black)] text-sm font-bold transition-all",
                      igPostType === "reel"
                        ? "bg-[var(--color-base-black)] text-[var(--color-base-white)] shadow-[2px_2px_0px_0px_#C8FF00]"
                        : "bg-[var(--color-base-white)] text-[var(--color-base-black)] shadow-[2px_2px_0px_0px_var(--color-base-black)] opacity-50 hover:opacity-75"
                    )}
                  >
                    <span className="text-base leading-none">♫</span>
                    Reel
                  </button>
                )}
                <button
                  onClick={() => setIgPostType("story")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 border border-[var(--color-base-black)] text-sm font-bold transition-all",
                    igPostType === "story"
                      ? "bg-[var(--color-base-black)] text-[var(--color-base-white)] shadow-[2px_2px_0px_0px_#C8FF00]"
                      : "bg-[var(--color-base-white)] text-[var(--color-base-black)] shadow-[2px_2px_0px_0px_var(--color-base-black)] opacity-50 hover:opacity-75"
                  )}
                >
                  <span className="text-base leading-none">◎</span>
                  Story
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex items-center gap-2 px-4 py-2.5 border border-[var(--color-base-black)] bg-[var(--color-base-black)] text-[var(--color-base-white)] text-sm font-bold shadow-[2px_2px_0px_0px_#C8FF00]">
                  <span className="text-base leading-none">⊞</span>
                  {`Carousel · ${mediaItems.length} items`}
                </div>
              </div>
            )}
            {igPostType === "reel" && hasSingleVideo && (
              <p className="text-xs text-[var(--color-gray-500)] mt-2">
                Reels appear in the Reels tab and can reach non-followers.
              </p>
            )}
            {igPostType === "story" && (
              <p className="text-xs text-[var(--color-gray-500)] mt-2">
                Story disappears after 24 hours. No stickers, music, or polls via API.
              </p>
            )}
          </div>
        )}

        {/* Aspect ratio selector — Instagram images only, hidden when YouTube also selected */}
        {instagramSelected && !youtubeSelected && mediaItems.some((m) => m.file.type.startsWith("image/")) && (
          <div>
            <label className="font-bold text-sm text-[#0A0A0A] block mb-2">
              Crop mode
              <span className="font-normal text-[#5C5C5A] ml-2">
                {aspectMode === "original" ? "Pads if needed" : "Drag preview to adjust"}
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

        {/* Padding color picker — Instagram only */}
        {instagramSelected && !youtubeSelected && aspectMode === "original" && hasAnyPadding && (
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

        {/* Image filters & quality — Instagram images only */}
        {instagramSelected && !youtubeSelected && mediaItems.some((m) => m.file.type.startsWith("image/")) && (
          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-2 w-full"
            >
              <span className={cn("text-xs text-[#0A0A0A] transition-transform", filtersOpen && "rotate-90")}>
                ▶
              </span>
              <span className="font-bold text-sm text-[#0A0A0A]">Filters</span>
              {(filters.brightness !== 100 || filters.contrast !== 100 || filters.saturation !== 100 || imageQuality !== 92) && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#7C3AED] text-white ml-auto">ACTIVE</span>
              )}
            </button>
            {filtersOpen && (
              <div className="mt-3 space-y-3">
                {(filters.brightness !== 100 || filters.contrast !== 100 || filters.saturation !== 100 || imageQuality !== 92) && (
                  <button
                    onClick={() => { setFilters({ brightness: 100, contrast: 100, saturation: 100 }); setImageQuality(92); }}
                    className="text-xs text-[#0095F6] font-bold hover:underline"
                  >
                    Reset all
                  </button>
                )}
                {([
                  { key: "brightness" as const, label: "Brightness" },
                  { key: "contrast" as const, label: "Contrast" },
                  { key: "saturation" as const, label: "Saturation" },
                ]).map(({ key, label }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#5C5C5A]">{label}</span>
                      <span className="text-xs font-bold text-[#0A0A0A] w-10 text-right">{filters[key]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={filters[key]}
                      onChange={(e) => setFilters((f) => ({ ...f, [key]: Number(e.target.value) }))}
                      className="w-full accent-[#0A0A0A] h-2 cursor-pointer"
                    />
                  </div>
                ))}
                <div className="border-t border-[#E0E0E0] pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#5C5C5A]">Quality</span>
                    <span className="text-xs font-bold text-[#0A0A0A] w-10 text-right">{imageQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={imageQuality}
                    onChange={(e) => setImageQuality(Number(e.target.value))}
                    className="w-full accent-[#0A0A0A] h-2 cursor-pointer"
                  />
                  <div className="text-[10px] text-[#5C5C5A] mt-1">
                    {imageQuality >= 90 ? "Best quality, larger file" : imageQuality >= 60 ? "Good balance" : "Smaller file, some loss"}
                  </div>
                </div>
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
                <span className="font-medium capitalize">
                  {platform === "schedule" ? (result.success ? "Scheduled successfully" : "Scheduling failed") : platform}
                </span>
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

        {/* Moderation error */}
        {moderationError && (
          <div className="p-3 border border-[#FF4F4F] bg-[#FF4F4F]/10">
            <p className="text-xs text-[#FF4F4F] font-medium">{moderationError}</p>
          </div>
        )}

        {/* Schedule & Post */}
        {!results && (
          <div className="space-y-3">
            {/* Schedule toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => {
                    setScheduleEnabled(e.target.checked);
                    if (!e.target.checked) setScheduleDate("");
                  }}
                  className="w-4 h-4 accent-[#7C3AED] cursor-pointer"
                />
                <span className="font-bold text-sm text-[#0A0A0A]">Schedule for later</span>
              </label>
              {scheduleEnabled && (
                <div className="mt-2 space-y-1.5">
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && new Date(val).getTime() <= Date.now()) {
                        setResults({ schedule: { success: false, error: "Can't schedule in the past. Pick a time at least 5 minutes from now." } });
                        setScheduleDate("");
                        return;
                      }
                      setResults(null);
                      setScheduleDate(val);
                    }}
                    min={new Date(Date.now() + 6 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                    className="w-full border border-[#0A0A0A] p-3 text-sm bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] outline-none focus:shadow-[4px_4px_0px_0px_#C8FF00] transition-all"
                  />
                  {mediaItems.some((m) => m.file.type.startsWith("video/")) &&
                   scheduleDate &&
                   (new Date(scheduleDate).getTime() - Date.now()) / 60000 < 10 ? (
                    <p className="text-xs font-semibold text-amber-600">
                      ⚠ Video posts need ~10 min — may be slightly late
                    </p>
                  ) : (
                    <p className="text-xs text-[#5C5C5A]">
                      Schedule at least 5 min ahead
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <button
              onClick={scheduleDate ? handleSchedule : handlePost}
              disabled={!canPost}
              className={cn(
                "w-full border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-6 py-3 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:translate-x-[2px] hover:enabled:translate-y-[2px] hover:enabled:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all flex items-center justify-center gap-3",
                scheduleDate ? "bg-[#7C3AED] text-[#F9F9F7]" : "bg-[#C8FF00] text-[#0A0A0A]"
              )}
            >
              {isPosting && (
                <div className={cn("w-5 h-5 border-2 border-t-transparent animate-spin", scheduleDate ? "border-[#F9F9F7]" : "border-[#0A0A0A]")} />
              )}
              {isPosting
                ? scheduleDate ? "Scheduling..." : "Uploading..."
                : scheduleDate
                ? `Schedule for ${new Date(scheduleDate).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : instagramSelected && effectiveIgPostType === "carousel"
                ? `Post carousel to ${selected.length} platform${selected.length !== 1 ? "s" : ""}`
                : instagramSelected && effectiveIgPostType === "reel"
                ? `Post reel${selected.length > 1 ? ` + ${selected.length - 1} more` : ""}`
                : instagramSelected && effectiveIgPostType === "story"
                ? `Post story${selected.length > 1 ? ` + ${selected.length - 1} more` : ""}`
                : `Post to ${selected.length} platform${selected.length !== 1 ? "s" : ""}`}
            </button>
            {isPosting && postingStatus && (
              <p className="text-xs text-[#5C5C5A] text-center">{postingStatus}</p>
            )}
            {!isPosting && postBlockReason && (
              <p className="text-xs text-[#FF4F4F] font-medium text-center">{postBlockReason}</p>
            )}
          </div>
        )}
      </div>

      {/* Right — Preview panel */}
      {mediaItems.length > 0 && (
        <div className="hidden md:block w-80 shrink-0">
          <div className="sticky top-24 space-y-3">
            <div className="font-bold text-sm text-[#0A0A0A]">Preview</div>

            {/* Platform preview tabs — show when 2+ platforms selected */}
            {selected.length > 1 && (
              <div className="flex gap-2">
                {instagramSelected && (
                  <button
                    onClick={() => setPreviewTab("instagram")}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-bold border border-[#0A0A0A] transition-all",
                      previewTab === "instagram"
                        ? "bg-[#E1306C] text-white shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "bg-white text-[#0A0A0A] hover:bg-[#F0F0F0]"
                    )}
                  >
                    Instagram Preview
                  </button>
                )}
                {youtubeSelected && (
                  <button
                    onClick={() => setPreviewTab("youtube")}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-bold border border-[#0A0A0A] transition-all",
                      previewTab === "youtube"
                        ? "bg-[#FF0000] text-white shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "bg-white text-[#0A0A0A] hover:bg-[#F0F0F0]"
                    )}
                  >
                    YouTube Preview
                  </button>
                )}
                {selected.includes("bluesky") && (
                  <button
                    onClick={() => setPreviewTab("bluesky")}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-bold border border-[#0A0A0A] transition-all",
                      previewTab === "bluesky"
                        ? "bg-[#0085FF] text-white shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "bg-white text-[#0A0A0A] hover:bg-[#F0F0F0]"
                    )}
                  >
                    Bluesky Preview
                  </button>
                )}
                {selected.includes("threads") && (
                  <button
                    onClick={() => setPreviewTab("threads")}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-bold border border-[#0A0A0A] transition-all",
                      previewTab === "threads"
                        ? "bg-[#000000] text-white shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "bg-white text-[#0A0A0A] hover:bg-[#F0F0F0]"
                    )}
                  >
                    Threads Preview
                  </button>
                )}
                {facebookSelected && (
                  <button
                    onClick={() => setPreviewTab("facebook")}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-bold border border-[#0A0A0A] transition-all",
                      previewTab === "facebook"
                        ? "bg-[#1877F2] text-white shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "bg-white text-[#0A0A0A] hover:bg-[#F0F0F0]"
                    )}
                  >
                    Facebook Preview
                  </button>
                )}
                {selected.includes("mastodon") && (
                  <button
                    onClick={() => setPreviewTab("mastodon")}
                    className={cn(
                      "flex-1 px-3 py-2 text-xs font-bold border border-[#0A0A0A] transition-all",
                      previewTab === "mastodon"
                        ? "bg-[#6364FF] text-white shadow-[2px_2px_0px_0px_#0A0A0A]"
                        : "bg-white text-[#0A0A0A] hover:bg-[#F0F0F0]"
                    )}
                  >
                    Mastodon Preview
                  </button>
                )}
              </div>
            )}

            {/* ── Instagram Preview ── */}
            {(selected.length === 1 ? instagramSelected : previewTab === "instagram" && instagramSelected) && (
              <>
                <div className="border border-[#DBDBDB] bg-white rounded-sm overflow-hidden">
                  {/* Header — avatar + username + post type badge */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FCAF45] via-[#E1306C] to-[#833AB4] flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-[#262626]">
                        {(instagramConnected?.platform_username ?? "you")[0].toUpperCase()}
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold text-[#262626]">
                      {instagramConnected?.platform_username ?? "your_account"}
                    </span>
                    <span className={cn(
                      "ml-auto text-[10px] font-bold px-1.5 py-0.5",
                      effectiveIgPostType === "reel" ? "bg-[#E1306C] text-white"
                        : effectiveIgPostType === "story" ? "bg-gradient-to-r from-[#FCAF45] via-[#E1306C] to-[#833AB4] text-white"
                        : effectiveIgPostType === "carousel" ? "bg-[#7C3AED] text-white"
                        : "bg-[#0A0A0A] text-[#F9F9F7]"
                    )}>
                      {effectiveIgPostType === "reel" ? "REEL" : effectiveIgPostType === "story" ? "STORY" : effectiveIgPostType === "carousel" ? "CAROUSEL" : "POST"}
                    </span>
                  </div>

                  {/* Image area */}
                  <div
                    ref={previewRef}
                    className={cn(
                      "relative overflow-hidden select-none",
                      canDrag && "cursor-grab",
                      canDrag && isDragging && "cursor-grabbing"
                    )}
                    style={{
                      aspectRatio: (effectiveIgPostType === "reel" || effectiveIgPostType === "story") ? "9/16"
                        : aspectMode === "square" ? "1/1"
                        : aspectMode === "portrait" ? "4/5"
                        : aspectMode === "landscape" ? "1.91/1"
                        : "1/1",
                      backgroundColor: aspectMode === "original" ? padColor : "#000000",
                    }}
                    onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientX, e.clientY); }}
                    onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
                  >
                    {currentPreview?.file.type.startsWith("video/") ? (
                      <video
                        ref={videoRef}
                        key={currentPreview.preview}
                        src={currentPreview.preview}
                        controls
                        className="w-full h-full object-contain"
                        onLoadedMetadata={(e) => setVideoDuration((e.target as HTMLVideoElement).duration)}
                        onTimeUpdate={(e) => setVideoTime((e.target as HTMLVideoElement).currentTime)}
                      />
                    ) : currentPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentPreview.preview}
                        alt="Preview"
                        draggable={false}
                        className="w-full h-full pointer-events-none object-cover"
                        style={{
                          objectPosition: `${currentPreview.cropOffset.x * 100}% ${currentPreview.cropOffset.y * 100}%`,
                          filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`,
                        }}
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

                {/* Drag hint */}
                {currentPreviewIsImage && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#5C5C5A]">Drag image to reposition</span>
                    {(currentPreview!.cropOffset.x !== 0.5 || currentPreview!.cropOffset.y !== 0.5) && (
                      <button
                        onClick={() => setMediaItems((prev) => prev.map((item, i) =>
                          i === previewIndex ? { ...item, cropOffset: { x: 0.5, y: 0.5 } } : item
                        ))}
                        className="text-[10px] text-[#0095F6] font-bold hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── YouTube Preview ── */}
            {(selected.length === 1 ? youtubeSelected : previewTab === "youtube" && youtubeSelected) && (
              <>
                <div className="border border-[#0A0A0A] bg-white overflow-hidden shadow-[2px_2px_0px_0px_#0A0A0A]">
                  {/* Video player area */}
                  <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
                    {currentPreview?.file.type.startsWith("video/") ? (
                      <video
                        ref={videoRef}
                        key={currentPreview.preview}
                        src={currentPreview.preview}
                        controls
                        className="w-full h-full object-contain"
                        onLoadedMetadata={(e) => setVideoDuration((e.target as HTMLVideoElement).duration)}
                        onTimeUpdate={(e) => setVideoTime((e.target as HTMLVideoElement).currentTime)}
                      />
                    ) : currentPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentPreview.preview}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                    ) : null}
                  </div>

                  {/* Title & description */}
                  <div className="p-3 space-y-1.5">
                    <h3 className="font-bold text-sm text-[#0F0F0F] leading-tight line-clamp-2">
                      {title || "Video title"}
                    </h3>
                    {description && (
                      <p className="text-xs text-[#606060] line-clamp-2">{description}</p>
                    )}
                  </div>
                </div>

                {/* YouTube thumbnail picker */}
                {currentPreview && currentPreview.file.type.startsWith("video/") && videoDuration > 0 && (
                  <div className="border border-[#0A0A0A] p-3 shadow-[2px_2px_0px_0px_#0A0A0A] space-y-2">
                    <div className="font-bold text-xs text-[#0A0A0A]">YouTube Thumbnail</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#5C5C5A] shrink-0 w-8">
                        {Math.floor(videoTime / 60)}:{String(Math.floor(videoTime % 60)).padStart(2, "0")}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={videoDuration}
                        step={0.1}
                        value={videoTime}
                        onChange={(e) => {
                          const t = Number(e.target.value);
                          setVideoTime(t);
                          if (videoRef.current) videoRef.current.currentTime = t;
                        }}
                        className="flex-1 accent-[#FF0000] h-1.5 cursor-pointer"
                      />
                      <span className="text-[10px] text-[#5C5C5A] shrink-0 w-8 text-right">
                        {Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={captureVideoFrame}
                        className="flex-1 bg-[#FF0000] text-white border border-[#0A0A0A] px-2 py-1.5 text-xs font-bold shadow-[2px_2px_0px_0px_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#0A0A0A] transition-all"
                      >
                        Capture frame
                      </button>
                      {thumbnailBlob && (
                        <button
                          onClick={() => { setThumbnailBlob(null); if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview); setThumbnailPreview(null); }}
                          className="px-2 py-1.5 border border-[#0A0A0A] text-xs font-bold text-[#FF4F4F] shadow-[2px_2px_0px_0px_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#0A0A0A] transition-all"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {thumbnailPreview && (
                      <div className="mt-1">
                        <div className="text-[10px] text-[#5C5C5A] mb-1">Thumbnail preview:</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbnailPreview} alt="Thumbnail" className="w-full border border-[#0A0A0A]" />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Bluesky Preview ── */}
            {(selected.length === 1 ? selected.includes("bluesky") : previewTab === "bluesky" && selected.includes("bluesky")) && (
              <div className="border border-[#0A0A0A] bg-white overflow-hidden shadow-[2px_2px_0px_0px_#0A0A0A]">
                {/* Header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#E4E4E4]">
                  <div className="w-8 h-8 bg-[#0085FF] flex items-center justify-center text-white text-xs font-black">
                    {(connected.find((c) => c.platform === "bluesky")?.platform_username ?? "you")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#0A0A0A]">
                      {connected.find((c) => c.platform === "bluesky")?.platform_username ?? "your.handle"}
                    </div>
                    <div className="text-[10px] text-[#5C5C5A]">just now</div>
                  </div>
                </div>
                {/* Text */}
                <div className="px-3 py-2">
                  <p className="text-[13px] text-[#0A0A0A] whitespace-pre-wrap break-words">
                    {title}{description ? `\n\n${description}` : ""}
                  </p>
                  <p className="text-[10px] text-[#5C5C5A] mt-1">
                    {(`${title}${description ? "\n\n" + description : ""}`).length}/300 characters
                  </p>
                </div>
                {/* Media */}
                {currentPreview && (
                  <div className="px-3 pb-3">
                    {currentPreview.file.type.startsWith("video/") ? (
                      <video
                        src={currentPreview.preview}
                        className="w-full border border-[#E4E4E4]"
                        style={{ aspectRatio: "16/9", objectFit: "cover" }}
                        muted
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <div
                        className={cn("relative overflow-hidden select-none border border-[#E4E4E4]", canDrag && "cursor-grab", canDrag && isDragging && "cursor-grabbing")}
                        style={{ aspectRatio: "1/1" }}
                        onMouseDown={(e) => { e.preventDefault(); handleDragStart(e.clientX, e.clientY); }}
                        onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
                      >
                        <img
                          src={currentPreview.preview}
                          alt="Preview"
                          draggable={false}
                          className="w-full h-full pointer-events-none object-cover"
                          style={{ objectPosition: `${currentPreview.cropOffset.x * 100}% ${currentPreview.cropOffset.y * 100}%` }}
                        />
                      </div>
                    )}
                    {mediaItems.length > 1 && (
                      <p className="text-[10px] text-[#5C5C5A] mt-1">
                        {hasVideo
                          ? `1 video only (Bluesky doesn't support carousels)`
                          : `${Math.min(mediaItems.filter((m) => m.file.type.startsWith("image/")).length, 4)} of ${mediaItems.filter((m) => m.file.type.startsWith("image/")).length} images (Bluesky max: 4)`
                        }
                      </p>
                    )}
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-4 px-3 py-2 border-t border-[#E4E4E4] text-[#5C5C5A]">
                  <span className="text-xs">Reply</span>
                  <span className="text-xs">Repost</span>
                  <span className="text-xs">Like</span>
                </div>
              </div>
            )}

            {/* ── Threads Preview ── */}
            {(selected.length === 1 ? selected.includes("threads") : previewTab === "threads" && selected.includes("threads")) && (
              <div className="border border-[#0A0A0A] bg-white overflow-hidden shadow-[2px_2px_0px_0px_#0A0A0A]">
                {/* Header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#E4E4E4]">
                  <div className="w-8 h-8 rounded-full bg-[#000000] flex items-center justify-center text-white text-xs font-black">
                    {(connected.find((c) => c.platform === "threads")?.platform_username ?? "you")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#0A0A0A]">
                      {connected.find((c) => c.platform === "threads")?.platform_username ?? "your_account"}
                    </div>
                    <div className="text-[10px] text-[#5C5C5A]">just now</div>
                  </div>
                </div>
                {/* Text */}
                <div className="px-3 py-2">
                  <p className="text-[13px] text-[#0A0A0A] whitespace-pre-wrap break-words">
                    {title}{description ? `\n\n${description}` : ""}
                  </p>
                  <p className="text-[10px] text-[#5C5C5A] mt-1">
                    {(`${title}${description ? "\n\n" + description : ""}`).length}/500 characters
                  </p>
                </div>
                {/* Media */}
                {currentPreview && (
                  <div className="px-3 pb-3">
                    {currentPreview.file.type.startsWith("video/") ? (
                      <video
                        src={currentPreview.preview}
                        className="w-full border border-[#E4E4E4] rounded-lg"
                        style={{ aspectRatio: "16/9", objectFit: "cover" }}
                        muted
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentPreview.preview}
                        alt="Preview"
                        className="w-full border border-[#E4E4E4] rounded-lg object-cover"
                        style={{ aspectRatio: "1/1", objectFit: "cover", objectPosition: `${currentPreview.cropOffset.x * 100}% ${currentPreview.cropOffset.y * 100}%` }}
                      />
                    )}
                    {mediaItems.length > 1 && (
                      <p className="text-[10px] text-[#5C5C5A] mt-1">
                        {mediaItems.length} items — Threads supports up to 20 in a carousel
                      </p>
                    )}
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-4 px-3 py-2 border-t border-[#E4E4E4] text-[#5C5C5A]">
                  <span className="text-xs">♡</span>
                  <span className="text-xs">💬</span>
                  <span className="text-xs">↗</span>
                </div>
              </div>
            )}

            {/* ── Facebook Pages Preview ── */}
            {(selected.length === 1 ? facebookSelected : previewTab === "facebook" && facebookSelected) && (
              <div className="border border-[#0A0A0A] bg-white overflow-hidden shadow-[2px_2px_0px_0px_#0A0A0A]">
                {/* Header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#E4E4E4]">
                  <div className="w-8 h-8 rounded-full bg-[#1877F2] flex items-center justify-center text-white text-xs font-black">
                    {(connected.find((c) => c.platform === "facebook")?.platform_username ?? "Page")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#0A0A0A]">
                      {connected.find((c) => c.platform === "facebook")?.platform_username ?? "Your Page"}
                    </div>
                    <div className="text-[10px] text-[#5C5C5A]">Just now · 🌐</div>
                  </div>
                </div>
                {/* Text */}
                <div className="px-3 py-2">
                  <p className="text-[14px] text-[#050505] whitespace-pre-wrap break-words leading-[20px]">
                    {title}{description ? `\n\n${description}` : ""}
                  </p>
                </div>
                {/* Media */}
                {currentPreview && (
                  <div className="border-t border-[#E4E4E4]">
                    {currentPreview.file.type.startsWith("video/") ? (
                      <video
                        src={currentPreview.preview}
                        className="w-full"
                        style={{ aspectRatio: "16/9", objectFit: "cover" }}
                        muted
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentPreview.preview}
                        alt="Preview"
                        className="w-full object-cover"
                        style={{ aspectRatio: mediaItems.length > 1 ? "1/1" : "1.91/1", objectPosition: `${currentPreview.cropOffset.x * 100}% ${currentPreview.cropOffset.y * 100}%` }}
                      />
                    )}
                    {mediaItems.length > 1 && (
                      <p className="text-[10px] text-[#5C5C5A] px-3 py-1">
                        {mediaItems.filter((m) => m.file.type.startsWith("image/")).length} photos — multi-photo post
                      </p>
                    )}
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center border-t border-[#E4E4E4]">
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[#65676B] text-xs font-semibold hover:bg-[#F2F2F2]">
                    👍 Like
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[#65676B] text-xs font-semibold hover:bg-[#F2F2F2]">
                    💬 Comment
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[#65676B] text-xs font-semibold hover:bg-[#F2F2F2]">
                    ↗ Share
                  </button>
                </div>
              </div>
            )}

            {/* ── Mastodon Preview ── */}
            {(selected.length === 1 ? selected.includes("mastodon") : previewTab === "mastodon" && selected.includes("mastodon")) && (
              <div className="border border-[#0A0A0A] bg-white overflow-hidden shadow-[2px_2px_0px_0px_#0A0A0A]">
                {/* Header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#E4E4E4]">
                  <div className="w-9 h-9 rounded-md bg-[#6364FF] flex items-center justify-center text-white text-xs font-black">
                    {(connected.find((c) => c.platform === "mastodon")?.platform_username ?? "@you")[1]?.toUpperCase() ?? "M"}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#0A0A0A]">
                      {connected.find((c) => c.platform === "mastodon")?.platform_username ?? "@you@instance.social"}
                    </div>
                    <div className="text-[10px] text-[#5C5C5A]">just now · Public</div>
                  </div>
                </div>
                {/* Text */}
                <div className="px-3 py-2">
                  <p className="text-[14px] text-[#17191f] whitespace-pre-wrap break-words leading-[1.4]">
                    {title}{description ? `\n\n${description}` : ""}
                  </p>
                  <p className="text-[10px] text-[#5C5C5A] mt-1">
                    {(`${title}${description ? "\n\n" + description : ""}`).length}/500 characters
                  </p>
                </div>
                {/* Media */}
                {currentPreview && (
                  <div className="px-3 pb-3">
                    {currentPreview.file.type.startsWith("video/") ? (
                      <video
                        src={currentPreview.preview}
                        className="w-full border border-[#E4E4E4] rounded-md"
                        style={{ aspectRatio: "16/9", objectFit: "cover" }}
                        muted
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentPreview.preview}
                        alt="Preview"
                        className="w-full border border-[#E4E4E4] rounded-md object-cover"
                        style={{ aspectRatio: "16/9", objectPosition: `${currentPreview.cropOffset.x * 100}% ${currentPreview.cropOffset.y * 100}%` }}
                      />
                    )}
                    {mediaItems.length > 1 && (
                      <p className="text-[10px] text-[#5C5C5A] mt-1">
                        {hasVideo
                          ? `Video only — images will be skipped (Mastodon can't mix)`
                          : `${Math.min(mediaItems.filter((m) => m.file.type.startsWith("image/")).length, 4)} of ${mediaItems.filter((m) => m.file.type.startsWith("image/")).length} images (Mastodon max: 4)`
                        }
                      </p>
                    )}
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-4 px-3 py-2 border-t border-[#E4E4E4] text-[#5C5C5A]">
                  <span className="text-xs">↩ Reply</span>
                  <span className="text-xs">🔁 Boost</span>
                  <span className="text-xs">⭐ Favourite</span>
                </div>
              </div>
            )}

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
