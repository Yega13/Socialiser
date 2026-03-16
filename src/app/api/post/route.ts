import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

async function refreshYouTubeToken(rt: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: rt,
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
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Verify user via Supabase Auth REST API
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!userRes.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await userRes.json();

  const formData = await request.formData();
  const title = (formData.get("title") as string) ?? "";
  const description = (formData.get("description") as string) ?? "";
  const platforms = JSON.parse(
    (formData.get("platforms") as string) ?? "[]"
  ) as string[];
  const videoFile = formData.get("video") as File | null;

  const results: Record<string, { success: boolean; error?: string }> = {};

  for (const platform of platforms) {
    // Fetch connected platform via REST API
    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/connected_platforms?user_id=eq.${user.id}&platform=eq.${encodeURIComponent(platform)}&is_active=eq.true&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
        },
      }
    );

    const connData = await connRes.json();
    const conn = connData?.[0];

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
      const newToken = await refreshYouTubeToken(conn.refresh_token);
      if (newToken) {
        accessToken = newToken;
        // Update token via REST API
        await fetch(
          `${supabaseUrl}/rest/v1/connected_platforms?id=eq.${conn.id}`,
          {
            method: "PATCH",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              access_token: newToken,
              token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            }),
          }
        );
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
