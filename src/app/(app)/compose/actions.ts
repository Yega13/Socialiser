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
    `${THREADS_API}/${userId}/threads`,
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
      `${THREADS_API}/${userId}/threads_publish`,
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

    // Step 4: Publish
    const publishRes = await fetch(
      `${THREADS_API}/${userId}/threads_publish`,
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
  imageBlobs?: { $type: string; ref: { $link: string }; mimeType: string; size: number }[],
  videoBlob?: { $type: string; ref: { $link: string }; mimeType: string; size: number } | null
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
