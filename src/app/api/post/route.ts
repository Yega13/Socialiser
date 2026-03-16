import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

async function refreshToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token ?? null;
}

async function postToYouTube(
  accessToken: string,
  title: string,
  description: string,
  videoFile: File
): Promise<{ success: boolean; error?: string }> {
  const metadata = {
    snippet: {
      title: title || "New Video",
      description: description || "",
      categoryId: "22",
    },
    status: { privacyStatus: "public" },
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("video", videoFile);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      success: false,
      error: err?.error?.message ?? `YouTube error ${res.status}`,
    };
  }

  return { success: true };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const title = (formData.get("title") as string) ?? "";
  const description = (formData.get("description") as string) ?? "";
  const platforms = JSON.parse(
    (formData.get("platforms") as string) ?? "[]"
  ) as string[];
  const videoFile = formData.get("video") as File | null;

  const results: Record<string, { success: boolean; error?: string }> = {};

  for (const platform of platforms) {
    const { data: conn } = await supabase
      .from("connected_platforms")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .eq("is_active", true)
      .single();

    if (!conn) {
      results[platform] = { success: false, error: "Not connected" };
      continue;
    }

    let accessToken = conn.access_token;

    // Refresh token if expired
    if (
      conn.token_expires_at &&
      new Date(conn.token_expires_at) <= new Date() &&
      conn.refresh_token
    ) {
      const newToken = await refreshToken(conn.refresh_token);
      if (newToken) {
        accessToken = newToken;
        await supabase
          .from("connected_platforms")
          .update({
            access_token: newToken,
            token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          })
          .eq("id", conn.id);
      }
    }

    if (platform === "youtube") {
      if (!videoFile || videoFile.size === 0) {
        results[platform] = {
          success: false,
          error: "YouTube requires a video file",
        };
      } else {
        results[platform] = await postToYouTube(
          accessToken,
          title,
          description,
          videoFile
        );
      }
    }
  }

  return NextResponse.json({ results });
}
