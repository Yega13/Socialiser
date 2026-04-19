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
  // 900 iterations × 1s = 15 minutes (large videos can be very slow)
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 1000));
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

// ── Threads ──────────────────────────────────────────────────────

const THREADS_API = "https://graph.threads.net/v1.0";

export async function refreshThreadsToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch(
    `https://graph.threads.net/refresh_access_token?` +
      new URLSearchParams({
        grant_type: "th_refresh_token",
        access_token: currentToken,
      }),
  );
  const data = await res.json();
  if (data.access_token) {
    return { access_token: data.access_token, expires_in: data.expires_in ?? 5184000 };
  }
  return null;
}

async function createThreadsContainer(
  accessToken: string,
  userId: string,
  params: Record<string, string>,
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(
    `${THREADS_API}/${userId}/threads?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    }
  );
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    return { error: `Container: non-JSON (${res.status}): ${text.slice(0, 200)}` };
  }
  if (!data.id) {
    const detail = data.error
      ? `[${data.error.code}] ${data.error.message} (type: ${data.error.type})`
      : JSON.stringify(data).slice(0, 300);
    return { error: `Container (${res.status}): ${detail}` };
  }
  return { id: data.id };
}

async function waitForThreadsContainer(
  accessToken: string,
  containerId: string,
): Promise<string | null> {
  let lastStatus = "UNKNOWN";
  // 300 iterations × 1s = 5 minutes
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(
        `${THREADS_API}/${containerId}?fields=status&access_token=${accessToken}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      lastStatus = data.status || "UNKNOWN";
      if (data.status === "FINISHED") return null;
      if (data.status === "ERROR") return "Media processing failed on Threads";
      if (data.status === "EXPIRED") return "Media container expired";
    } catch { /* retry */ }
  }
  return `Threads processing timed out (5min). Last status: ${lastStatus}`;
}

// Single text, image, or video post
export async function postToThreadsServer(
  accessToken: string,
  userId: string,
  text: string,
  mediaUrl?: string,
  isVideo?: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const params: Record<string, string> = { text };

    if (mediaUrl && isVideo) {
      params.media_type = "VIDEO";
      params.video_url = mediaUrl;
    } else if (mediaUrl) {
      params.media_type = "IMAGE";
      params.image_url = mediaUrl;
    } else {
      params.media_type = "TEXT";
    }

    const container = await createThreadsContainer(accessToken, userId, params);
    if (!container.id) return { success: false, error: container.error };

    // Wait for container to be ready (images/videos need processing)
    if (mediaUrl) {
      const waitErr = await waitForThreadsContainer(accessToken, container.id);
      if (waitErr) return { success: false, error: waitErr };
    }

    // Publish
    const publishRes = await fetch(
      `${THREADS_API}/${userId}/threads_publish?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: container.id }),
      }
    );
    const publishText = await publishRes.text();
    let publishData;
    try { publishData = JSON.parse(publishText); } catch {
      return { success: false, error: `Publish: non-JSON (${publishRes.status}): ${publishText.slice(0, 200)}` };
    }

    if (!publishData.id) {
      const detail = publishData.error
        ? `[${publishData.error.code}] ${publishData.error.message} (type: ${publishData.error.type})`
        : JSON.stringify(publishData).slice(0, 300);
      return { success: false, error: `Publish (${publishRes.status}): ${detail}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Carousel post (2-20 items, images and/or videos)
export async function postCarouselToThreads(
  accessToken: string,
  userId: string,
  text: string,
  items: { url: string; isVideo: boolean }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (items.length < 2 || items.length > 20) {
      return { success: false, error: "Threads carousel requires 2-20 items" };
    }

    // Step 1: Create child containers in parallel
    const containerResults = await Promise.all(
      items.map(async (item, i) => {
        const params: Record<string, string> = { is_carousel_item: "true" };
        if (item.isVideo) {
          params.media_type = "VIDEO";
          params.video_url = item.url;
        } else {
          params.media_type = "IMAGE";
          params.image_url = item.url;
        }
        const container = await createThreadsContainer(accessToken, userId, params);
        return { id: container.id, error: container.error, index: i };
      })
    );
    const firstContainerError = containerResults.find((c) => !c.id);
    if (firstContainerError) return { success: false, error: `Item ${firstContainerError.index + 1}: ${firstContainerError.error}` };
    const containers = containerResults as { id: string; index: number }[];

    // Step 2: Wait for all containers in parallel
    const waitResults = await Promise.all(
      containers.map(async (c) => ({
        index: c.index,
        error: await waitForThreadsContainer(accessToken, c.id),
      }))
    );
    const firstFailure = waitResults.find((r) => r.error);
    if (firstFailure) {
      return { success: false, error: `Item ${firstFailure.index + 1}: ${firstFailure.error}` };
    }

    // Step 3: Create carousel container
    const carouselContainer = await createThreadsContainer(accessToken, userId, {
      media_type: "CAROUSEL",
      children: containers.map((c) => c.id).join(","),
      text,
    });
    if (!carouselContainer.id) return { success: false, error: carouselContainer.error };

    // Step 3b: Wait for carousel container to be ready
    const carouselWaitErr = await waitForThreadsContainer(accessToken, carouselContainer.id);
    if (carouselWaitErr) return { success: false, error: `Carousel: ${carouselWaitErr}` };

    // Step 4: Publish
    const publishRes = await fetch(
      `${THREADS_API}/${userId}/threads_publish?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: carouselContainer.id }),
      }
    );
    const publishText = await publishRes.text();
    let publishData;
    try { publishData = JSON.parse(publishText); } catch {
      return { success: false, error: `Publish: non-JSON (${publishRes.status}): ${publishText.slice(0, 200)}` };
    }

    if (!publishData.id) {
      const detail = publishData.error
        ? `[${publishData.error.code}] ${publishData.error.message} (type: ${publishData.error.type})`
        : JSON.stringify(publishData).slice(0, 300);
      return { success: false, error: `Publish (${publishRes.status}): ${detail}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Facebook Pages ───────────────────────────────────────────────

const FB_API = "https://graph.facebook.com/v23.0";

// Single text or photo or video post to a Facebook Page.
// Page tokens never expire, so no refresh function needed.
export async function postToFacebookServer(
  pageAccessToken: string,
  pageId: string,
  text: string,
  mediaUrl?: string,
  isVideo?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    let endpoint: string;
    const params: Record<string, string> = { access_token: pageAccessToken };

    if (mediaUrl && isVideo) {
      endpoint = `${FB_API}/${pageId}/videos`;
      params.file_url = mediaUrl;
      if (text) params.description = text;
    } else if (mediaUrl) {
      endpoint = `${FB_API}/${pageId}/photos`;
      params.url = mediaUrl;
      if (text) params.caption = text;
    } else {
      endpoint = `${FB_API}/${pageId}/feed`;
      params.message = text;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const e = data.error;
      const detail = e
        ? `[${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""}] ${e.message} (type: ${e.type})`
        : `HTTP ${res.status}`;
      return { success: false, error: detail };
    }
    if (!data.id && !data.post_id) {
      return { success: false, error: `Unexpected response: ${JSON.stringify(data).slice(0, 200)}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Multi-photo post (Facebook's equivalent of a carousel — single feed post with N attached photos).
// Step 1: upload each photo with published=false → get media_fbid
// Step 2: POST /feed with message + attached_media[i]={"media_fbid":"..."}
export async function postCarouselToFacebook(
  pageAccessToken: string,
  pageId: string,
  text: string,
  items: { url: string; isVideo: boolean }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const photos = items.filter((i) => !i.isVideo);
    if (photos.length < 2) {
      return { success: false, error: "Facebook multi-photo post requires 2+ images" };
    }
    if (photos.length !== items.length) {
      return { success: false, error: "Facebook multi-photo posts cannot mix images and videos" };
    }

    // Step 1: upload all photos in parallel as unpublished
    const uploadResults = await Promise.all(
      photos.map(async (item, i) => {
        const res = await fetch(`${FB_API}/${pageId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            access_token: pageAccessToken,
            url: item.url,
            published: "false",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error || !data.id) {
          const e = data.error;
          const detail = e ? `[${e.code}] ${e.message}` : `HTTP ${res.status}`;
          return { id: null, error: `Photo ${i + 1}: ${detail}` };
        }
        return { id: data.id as string, error: null };
      })
    );
    const failed = uploadResults.find((r) => !r.id);
    if (failed) return { success: false, error: failed.error ?? "Photo upload failed" };

    // Step 2: publish feed post with all attached media
    const feedParams: Record<string, string> = {
      access_token: pageAccessToken,
      message: text,
    };
    uploadResults.forEach((r, i) => {
      feedParams[`attached_media[${i}]`] = JSON.stringify({ media_fbid: r.id });
    });

    const feedRes = await fetch(`${FB_API}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(feedParams),
    });
    const feedData = await feedRes.json().catch(() => ({}));
    if (!feedRes.ok || feedData.error) {
      const e = feedData.error;
      const detail = e ? `[${e.code}] ${e.message}` : `HTTP ${feedRes.status}`;
      return { success: false, error: `Publish: ${detail}` };
    }
    if (!feedData.id) return { success: false, error: `Unexpected feed response: ${JSON.stringify(feedData).slice(0, 200)}` };

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

// ── Mastodon ────────────────────────────────────────────────────────
// Auth: personal access token generated by the user on their instance
// (Settings → Development → New application with write:statuses + write:media).
// `instance` must be the full base URL (e.g. "https://mastodon.social").

export async function uploadMastodonMedia(
  instance: string,
  token: string,
  fileUrl: string,
  mimeType: string
): Promise<{ id: string; processing: boolean } | { error: string }> {
  try {
    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) });
    if (!fileRes.ok) return { error: `Fetch media failed (${fileRes.status})` };
    const buf = await fileRes.arrayBuffer();

    const form = new FormData();
    form.append("file", new Blob([buf], { type: mimeType || "application/octet-stream" }), fileUrl.split("/").pop() || "media");

    const res = await fetch(`${instance}/api/v2/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok && res.status !== 202) {
      const err = await res.text().catch(() => "");
      return { error: `Upload failed (${res.status}): ${err.slice(0, 200)}` };
    }
    const data = await res.json();
    if (!data?.id) return { error: "No media id returned" };
    return { id: String(data.id), processing: res.status === 202 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkMastodonMedia(
  instance: string,
  token: string,
  mediaId: string
): Promise<"ready" | "processing" | "error"> {
  try {
    const res = await fetch(`${instance}/api/v1/media/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) return "ready";
    if (res.status === 206) return "processing";
    return "error";
  } catch {
    return "error";
  }
}

export async function postToMastodonServer(
  instance: string,
  token: string,
  text: string,
  mediaIds: string[] = []
): Promise<{ success: boolean; error?: string }> {
  try {
    const body: Record<string, unknown> = { status: text, visibility: "public" };
    if (mediaIds.length > 0) body.media_ids = mediaIds;
    const res = await fetch(`${instance}/api/v1/statuses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { success: false, error: `Post failed (${res.status}): ${err.slice(0, 200)}` };
    }
    const data = await res.json();
    if (!data?.id) return { success: false, error: "No status id returned" };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function postToBlueskyServer(
  accessJwt: string,
  did: string,
  text: string,
  imageBlobs?: { $type: string; ref: { $link: string }; mimeType: string; size: number }[],
  videoBlob?: { $type: string; ref: { $link: string }; mimeType: string; size: number } | null,
  pdsEndpoint?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const facets = detectFacets(text);

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      ...(facets.length > 0 && { facets }),
    };

    if (imageBlobs && imageBlobs.length > 0) {
      record.embed = {
        $type: "app.bsky.embed.images",
        images: imageBlobs.map((blob) => ({ alt: "", image: blob })),
      };
    }

    if (videoBlob) {
      record.embed = {
        $type: "app.bsky.embed.video",
        video: videoBlob,
        alt: "",
      };
    }

    // Use the user's actual PDS (same one uploadBlob targeted). Fall back to bsky.social.
    const host = pdsEndpoint?.replace(/\/$/, "") || BSKY_API.replace(/\/xrpc$/, "");
    const createRecordUrl = `${host}/xrpc/com.atproto.repo.createRecord`;

    const body = JSON.stringify({
      repo: did,
      collection: "app.bsky.feed.post",
      record,
    });
    const headers = {
      Authorization: `Bearer ${accessJwt}`,
      "Content-Type": "application/json",
    };

    // Up to 2 attempts — "Could not find blob" is often replication lag on the PDS
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(createRecordUrl, { method: "POST", headers, body });
      if (res.ok) return { success: true };
      const err = await res.json().catch(() => ({}));
      lastErr = err?.message || `Post failed (${res.status})`;
      if (!/could not find blob|BlobNotFound/i.test(lastErr)) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
    }
    return { success: false, error: lastErr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── TikTok ──────────────────────────────────────────────────────────
// Content Posting API v2. Videos are uploaded via FILE_UPLOAD (pre-signed PUT
// URL returned by /post/publish/video/init/), then status is polled.

const TIKTOK_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_VIDEO_INIT = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIKTOK_STATUS = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

export async function refreshTikTokToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY ?? "";
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET ?? "";
    if (!clientKey || !clientSecret) return null;

    const res = await fetch(TIKTOK_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return null;
    return {
      access_token: data.access_token as string,
      refresh_token: (data.refresh_token as string) ?? refreshToken,
      expires_in: (data.expires_in as number) ?? 86400,
    };
  } catch {
    return null;
  }
}

export async function postToTikTokServer(
  accessToken: string,
  videoUrl: string,
  title: string,
  privacyLevel: TikTokPrivacy = "SELF_ONLY"
): Promise<{ success: boolean; publish_id?: string; error?: string }> {
  try {
    // 1. Download video from Supabase
    const fileRes = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
    if (!fileRes.ok) return { success: false, error: `Fetch video failed (${fileRes.status})` };
    const videoBuffer = await fileRes.arrayBuffer();
    const videoSize = videoBuffer.byteLength;
    if (videoSize === 0) return { success: false, error: "Video is empty" };
    if (videoSize > 4 * 1024 * 1024 * 1024)
      return { success: false, error: "Video exceeds 4GB TikTok limit" };

    // 2. Init video post — TikTok returns upload_url + publish_id
    const chunkSize = videoSize; // single chunk
    const initRes = await fetch(TIKTOK_VIDEO_INIT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: title.slice(0, 2200),
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: 1,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok || initData?.error?.code !== "ok") {
      const detail =
        initData?.error?.message || initData?.error?.code || `HTTP ${initRes.status}`;
      return { success: false, error: `Init failed: ${detail}` };
    }
    const publishId = initData?.data?.publish_id as string | undefined;
    const uploadUrl = initData?.data?.upload_url as string | undefined;
    if (!publishId || !uploadUrl)
      return { success: false, error: "Init response missing publish_id or upload_url" };

    // 3. PUT video bytes to the pre-signed upload URL
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(videoSize),
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: videoBuffer,
      signal: AbortSignal.timeout(180000),
    });
    if (!putRes.ok && putRes.status !== 201) {
      const err = await putRes.text().catch(() => "");
      return { success: false, error: `Upload failed (${putRes.status}): ${err.slice(0, 200)}` };
    }

    return { success: true, publish_id: publishId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkTikTokPublishStatus(
  accessToken: string,
  publishId: string
): Promise<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }> {
  try {
    const res = await fetch(TIKTOK_STATUS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error?.code !== "ok") {
      return { status: "FAILED", fail_reason: data?.error?.message || `HTTP ${res.status}` };
    }
    return {
      status: (data?.data?.status as string) ?? "UNKNOWN",
      fail_reason: data?.data?.fail_reason,
      publicaly_available_post_id: data?.data?.publicaly_available_post_id,
    };
  } catch (err) {
    return { status: "FAILED", fail_reason: err instanceof Error ? err.message : String(err) };
  }
}
