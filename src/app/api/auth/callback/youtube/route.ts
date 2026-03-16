import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const reqUrl = new URL(request.url);
  const baseUrl = reqUrl.origin;
  const code = reqUrl.searchParams.get("code");
  const error = reqUrl.searchParams.get("error");

  if (error || !code) {
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
      return NextResponse.redirect(`${baseUrl}/dashboard?error=no_token&details=${encodeURIComponent(JSON.stringify(tokens))}`);
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

    // Save to Supabase
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login`);
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: dbError } = await supabase.from("connected_platforms").upsert(
      {
        user_id: user.id,
        platform: "youtube",
        platform_username: channelTitle,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expires_at: expiresAt,
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    );

    if (dbError) {
      return NextResponse.redirect(`${baseUrl}/dashboard?error=db_error&details=${encodeURIComponent(dbError.message)}`);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=youtube`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(`${baseUrl}/dashboard?error=crash&details=${encodeURIComponent(msg)}`);
  }
}
