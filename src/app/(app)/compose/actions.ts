"use server";


export async function refreshYouTubeToken(
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

export async function refreshInstagramToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?` +
      new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: currentToken,
      }),
  );
  const data = await res.json();
  if (data.access_token) {
    return { access_token: data.access_token, expires_in: data.expires_in ?? 5184000 };
  }
  return null;
}

async function createIgContainer(
  accessToken: string,
  igUserId: string,
  params: Record<string, string>,
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
  try { data = JSON.parse(text); } catch {
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
  containerId: string,
): Promise<string | null> {
  let lastStatus = "UNKNOWN";
  let apiErrors = 0;
  // 450 iterations × 2s = 15 minutes (large videos can be very slow)
  for (let i = 0; i < 450; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(
        `https://graph.instagram.com/v21.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
      );
      if (!res.ok) {
        apiErrors++;
        // Back off on rate limits
        if (res.status === 429) await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const data = await res.json();
      if (data.error) {
        apiErrors++;
        continue;
      }
      lastStatus = data.status_code || "UNKNOWN";
      if (data.status_code === "FINISHED") return null;
      if (data.status_code === "ERROR") {
        return `Media processing failed${data.status ? `: ${data.status}` : ""}`;
      }
      if (data.status_code === "EXPIRED") return "Media container expired";
    } catch {
      apiErrors++;
    }
  }
  return `Media processing timed out (15min). Last status: ${lastStatus}, API errors: ${apiErrors}`;
}

// Single image or video post
export async function postToInstagramServer(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrl: string,
  isVideo: boolean,
  postType: "post" | "reel" | "story" = "reel"
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify the URL is accessible before sending to Instagram
    const urlCheck = await fetch(mediaUrl, { method: "HEAD" });
    if (!urlCheck.ok) {
      return {
        success: false,
        error: `Media URL not accessible (${urlCheck.status}). URL starts with: ${mediaUrl.slice(0, 80)}...`,
      };
    }

    const params: Record<string, string> = {};
    // Stories don't support captions via API
    if (postType !== "story") {
      params.caption = caption;
    }

    if (postType === "story") {
      params.media_type = "STORIES";
      if (isVideo) {
        params.video_url = mediaUrl;
      } else {
        params.image_url = mediaUrl;
      }
    } else if (isVideo) {
      params.media_type = postType === "reel" ? "REELS" : "VIDEO";
      params.video_url = mediaUrl;
    } else {
      params.image_url = mediaUrl;
    }

    const container = await createIgContainer(accessToken, igUserId, params);
    if (!container.id) {
      return {
        success: false,
        error: `${container.error} | URL type: ${mediaUrl.startsWith("http") ? (mediaUrl.includes("/object/sign/") ? "signed" : mediaUrl.includes("/object/public/") ? "public" : "other") : "path"} | URL length: ${mediaUrl.length}`,
      };
    }

    const waitErr = await waitForContainer(accessToken, container.id);
    if (waitErr) return { success: false, error: waitErr };

    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
      }
    );
    const publishData = await publishRes.json();

    if (!publishData.id) {
      return { success: false, error: publishData.error?.message ?? `Publish failed: ${JSON.stringify(publishData)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Carousel post (2-10 items, mix of images and videos)
export async function postCarouselToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  items: { url: string; isVideo: boolean }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (items.length < 2 || items.length > 10) {
      return { success: false, error: "Carousel requires 2-10 items" };
    }

    // Step 1: Create ALL child containers IN PARALLEL
    const containerResults = await Promise.all(
      items.map(async (item, i) => {
        const params: Record<string, string> = { is_carousel_item: "true" };
        if (item.isVideo) {
          params.media_type = "VIDEO";
          params.video_url = item.url;
        } else {
          params.image_url = item.url;
        }
        const container = await createIgContainer(accessToken, igUserId, params);
        return { id: container.id, error: container.error, index: i };
      })
    );
    const firstContainerError = containerResults.find((c) => !c.id);
    if (firstContainerError) return { success: false, error: `Item ${firstContainerError.index + 1}: ${firstContainerError.error}` };
    const containers = containerResults as { id: string; index: number }[];

    // Step 2: Wait for ALL containers IN PARALLEL (Instagram processes simultaneously)
    const waitResults = await Promise.all(
      containers.map(async (c) => ({
        index: c.index,
        error: await waitForContainer(accessToken, c.id),
      }))
    );
    const firstFailure = waitResults.find((r) => r.error);
    if (firstFailure) {
      return { success: false, error: `Item ${firstFailure.index + 1}: ${firstFailure.error}` };
    }

    // Step 3: Create carousel container
    const carouselContainer = await createIgContainer(accessToken, igUserId, {
      media_type: "CAROUSEL",
      caption,
      children: containers.map((c) => c.id).join(","),
    });
    if (!carouselContainer.id) return { success: false, error: carouselContainer.error };

    // Step 4: Wait for carousel container
    const carouselWait = await waitForContainer(accessToken, carouselContainer.id);
    if (carouselWait) return { success: false, error: `Carousel: ${carouselWait}` };

    // Step 5: Publish
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: carouselContainer.id, access_token: accessToken }),
      }
    );
    const publishData = await publishRes.json();

    if (!publishData.id) {
      return { success: false, error: publishData.error?.message ?? `Publish failed: ${JSON.stringify(publishData)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Bluesky (AT Protocol) ────────────────────────────────────────

const BSKY_API = "https://bsky.social/xrpc";

export async function refreshBlueskySession(
  refreshJwt: string
): Promise<{ accessJwt: string; refreshJwt: string } | null> {
  const res = await fetch(`${BSKY_API}/com.atproto.server.refreshSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${refreshJwt}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.accessJwt ? { accessJwt: data.accessJwt, refreshJwt: data.refreshJwt } : null;
}

async function bskyUploadBlob(
  accessJwt: string,
  fileBytes: ArrayBuffer,
  mimeType: string
): Promise<{ blob?: { $type: string; ref: { $link: string }; mimeType: string; size: number }; error?: string }> {
  const res = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": mimeType,
    },
    body: fileBytes,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err?.message || `Upload failed (${res.status})` };
  }
  const data = await res.json();
  return { blob: data.blob };
}

async function bskyUploadVideo(
  accessJwt: string,
  did: string,
  fileBytes: ArrayBuffer,
  fileName: string
): Promise<{ blob?: { $type: string; ref: { $link: string }; mimeType: string; size: number }; error?: string }> {
  // Step 1: Resolve user's PDS endpoint from DID document
  // getServiceAuth MUST be called on the user's actual PDS, not bsky.social
  let pdsEndpoint = "https://bsky.social";
  try {
    const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
    if (plcRes.ok) {
      const plcData = await plcRes.json();
      const pdsService = plcData.service?.find((s: { id: string; serviceEndpoint: string }) => s.id === "#atproto_pds");
      if (pdsService?.serviceEndpoint) {
        pdsEndpoint = pdsService.serviceEndpoint.replace(/\/$/, "");
      }
    }
  } catch { /* fallback to bsky.social */ }

  // Step 2: Get service auth token from user's PDS
  // aud = video service DID, lxm = the method we'll call on it
  const authRes = await fetch(
    `${pdsEndpoint}/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent("did:web:video.bsky.app")}&lxm=app.bsky.video.uploadVideo&exp=${Math.floor(Date.now() / 1000) + 1800}`,
    { headers: { Authorization: `Bearer ${accessJwt}` } }
  );
  if (!authRes.ok) {
    const authErr = await authRes.json().catch(() => ({}));
    return { error: `Video auth failed (${authRes.status}): ${authErr?.message || "unknown"} [PDS: ${pdsEndpoint}]` };
  }
  const { token: serviceToken } = await authRes.json();

  // Step 3: Upload to video service
  const uploadRes = await fetch(
    `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(did)}&name=${encodeURIComponent(fileName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "video/mp4",
      },
      body: fileBytes,
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    return { error: err?.message || `Video upload failed (${uploadRes.status})` };
  }
  const uploadData = await uploadRes.json();

  // Step 3: Poll for processing completion
  const jobId = uploadData.jobId;
  if (!jobId) return { blob: uploadData.blob };

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(
      `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
      { headers: { Authorization: `Bearer ${accessJwt}` } }
    );
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.jobStatus?.state === "JOB_STATE_COMPLETED") {
      return { blob: statusData.jobStatus.blob };
    }
    if (statusData.jobStatus?.state === "JOB_STATE_FAILED") {
      return { error: statusData.jobStatus?.error || "Video processing failed" };
    }
  }
  return { error: "Video processing timed out (4 min)" };
}

function detectFacets(text: string): { index: { byteStart: number; byteEnd: number }; features: Record<string, string>[] }[] {
  const encoder = new TextEncoder();
  const facets: { index: { byteStart: number; byteEnd: number }; features: Record<string, string>[] }[] = [];

  // Detect URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const before = encoder.encode(text.slice(0, match.index));
    const url = encoder.encode(match[0]);
    facets.push({
      index: { byteStart: before.length, byteEnd: before.length + url.length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: match[0] }],
    });
  }

  // Detect hashtags
  const tagRegex = /(?<=\s|^)#([a-zA-Z0-9_]+)/g;
  while ((match = tagRegex.exec(text)) !== null) {
    const before = encoder.encode(text.slice(0, match.index));
    const tag = encoder.encode(match[0]);
    facets.push({
      index: { byteStart: before.length, byteEnd: before.length + tag.length },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: match[1] }],
    });
  }

  return facets;
}

export async function postToBlueskyServer(
  accessJwt: string,
  did: string,
  text: string,
  images?: { base64: string; mimeType: string; name: string }[],
  video?: { base64: string; mimeType: string; name: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const facets = detectFacets(text);

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      ...(facets.length > 0 && { facets }),
    };

    // Embed images (up to 4) — upload in parallel
    if (images && images.length > 0) {
      const uploadResults = await Promise.all(
        images.slice(0, 4).map(async (img) => {
          const binary = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
          return bskyUploadBlob(accessJwt, binary.buffer, img.mimeType);
        })
      );
      const firstError = uploadResults.find((r) => r.error);
      if (firstError) return { success: false, error: `Image upload: ${firstError.error}` };
      record.embed = {
        $type: "app.bsky.embed.images",
        images: uploadResults.map((r) => ({ alt: "", image: r.blob })),
      };
    }

    // Embed video (1 max, overrides images)
    if (video) {
      const binary = Uint8Array.from(atob(video.base64), (c) => c.charCodeAt(0));
      const result = await bskyUploadVideo(accessJwt, did, binary.buffer, video.name);
      if (result.error) return { success: false, error: `Video upload: ${result.error}` };
      record.embed = {
        $type: "app.bsky.embed.video",
        video: result.blob,
        alt: "",
      };
    }

    const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.message || `Post failed (${res.status})` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
