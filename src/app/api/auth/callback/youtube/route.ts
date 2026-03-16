import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const reqUrl = new URL(request.url);
  const baseUrl = reqUrl.origin;
  const code = reqUrl.searchParams.get("code");
  const error = reqUrl.searchParams.get("error");
  const userId = reqUrl.searchParams.get("state");

  if (error || !code || !userId) {
    return NextResponse.redirect(`${baseUrl}/dashboard?error=youtube_auth_failed`);
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${baseUrl}/api/auth/callback/youtube`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=no_token&details=${encodeURIComponent(JSON.stringify(tokens))}`
      );
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

    // Save to Supabase via REST API — no SDK needed, avoids module-level crashes
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
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=db_error&details=${encodeURIComponent(errBody)}`
      );
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=youtube`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=crash&details=${encodeURIComponent(msg)}`
    );
  }
}
