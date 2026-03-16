import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// YouTube OAuth callback handler — triggered when `state` param is present
async function handleYouTubeCallback(request: NextRequest) {
  const url = new URL(request.url);
  const baseUrl = url.origin;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const userId = url.searchParams.get("state");

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
        redirect_uri: `${baseUrl}/auth/callback`,
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

    // Save to Supabase via REST API — no SDK needed
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

export async function GET(request: NextRequest) {
  try {
  const url = new URL(request.url);

  // YouTube callback — Google sends `state` param with user ID
  // Also check for `scope` to distinguish from Supabase callbacks that may also have state
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope");
  if (state && scope && scope.includes("youtube")) {
    return await handleYouTubeCallback(request);
  }

  // Supabase OAuth callback (Google login, etc.)
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  const errorParam = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (errorParam) {
    console.error("[auth/callback] Supabase error:", errorParam, errorDescription);
    return NextResponse.redirect(
      `${url.origin}/login?error=${encodeURIComponent(errorDescription ?? errorParam)}`
    );
  }

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }

    console.error("[auth/callback] exchange error:", error);
    return NextResponse.redirect(`${url.origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${url.origin}/login?error=no_code`);
  } catch (e) {
    // Last resort — return plain text error so we can see what's crashing
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    return new Response(`CALLBACK ERROR:\n${msg}\n\nURL: ${request.url}`, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
}
