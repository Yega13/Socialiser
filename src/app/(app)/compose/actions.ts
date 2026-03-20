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

export async function postToInstagramServer(
  accessToken: string,
  igUserId: string,
  caption: string,
  mediaUrl: string,
  isVideo: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    // Debug: verify token, user, and permissions
    const debugRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,account_type&access_token=${accessToken}`
    );
    const debugData = await debugRes.json();
    if (debugData.error) {
      return { success: false, error: `Token invalid: ${debugData.error.message}` };
    }
    // Check if the user ID matches
    if (debugData.id !== igUserId) {
      return { success: false, error: `User ID mismatch: token is for ${debugData.id} (${debugData.username}) but DB has ${igUserId}. Reconnect Instagram.` };
    }

    // Step 1: Create media container
    const containerParams: Record<string, string> = {
      caption,
      access_token: accessToken,
    };
    if (isVideo) {
      containerParams.media_type = "REELS";
      containerParams.video_url = mediaUrl;
    } else {
      containerParams.image_url = mediaUrl;
    }

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(containerParams),
      }
    );
    const containerText = await containerRes.text();
    let containerData;
    try {
      containerData = JSON.parse(containerText);
    } catch {
      return { success: false, error: `API returned non-JSON (${containerRes.status}): ${containerText.slice(0, 200)}` };
    }

    if (!containerData.id) {
      const errDetail = containerData.error
        ? `[${containerData.error.code}] ${containerData.error.type}: ${containerData.error.message} (fbtrace: ${containerData.error.fbtrace_id})`
        : JSON.stringify(containerData);
      return { success: false, error: `Container failed (${containerRes.status}): ${errDetail}` };
    }

    const containerId = containerData.id;

    // Step 2: For videos, poll until container is ready
    if (isVideo) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await fetch(
          `https://graph.instagram.com/v21.0/${containerId}?fields=status_code&access_token=${accessToken}`
        );
        const statusData = await statusRes.json();
        if (statusData.status_code === "FINISHED") break;
        if (statusData.status_code === "ERROR") {
          return { success: false, error: "Instagram video processing failed" };
        }
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );
    const publishData = await publishRes.json();

    if (!publishData.id) {
      return {
        success: false,
        error: publishData.error?.message
          ?? `Publish failed (${publishRes.status}): ${JSON.stringify(publishData)}`,
      };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
