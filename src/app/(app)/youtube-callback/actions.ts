"use server";

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string
): Promise<{
  success: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  channel_title?: string | null;
}> {
  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return { success: false, error: `No token: ${JSON.stringify(tokens)}` };
    }

    // Get YouTube channel info
    let channelTitle: string | null = null;
    try {
      const channelRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const channelData = await channelRes.json();
      channelTitle = channelData.items?.[0]?.snippet?.title ?? null;
    } catch {}

    return {
      success: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_in: tokens.expires_in ?? null,
      channel_title: channelTitle,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
