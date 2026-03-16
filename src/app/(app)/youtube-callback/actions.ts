"use server";

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
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

    // Save to Supabase via REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/connected_platforms`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: userId,
          platform: "youtube",
          platform_username: channelTitle,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_expires_at: expiresAt,
          is_active: true,
        }),
      }
    );

    if (!upsertRes.ok) {
      const errBody = await upsertRes.text();
      return { success: false, error: `DB error: ${errBody}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
