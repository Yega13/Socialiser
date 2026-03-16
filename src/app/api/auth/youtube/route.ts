import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const baseUrl = new URL(request.url).origin;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", baseUrl));
    }

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: `${baseUrl}/api/auth/callback/youtube`,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
    });

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    );
  } catch (err) {
    console.error("YouTube auth error:", err);
    return NextResponse.redirect(
      new URL("/dashboard?error=youtube_connect_failed", request.url)
    );
  }
}
