"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { exchangeYouTubeCode } from "./actions";

function YouTubeCallbackInner() {
  const [status, setStatus] = useState("Connecting YouTube...");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const userId = searchParams.get("state");

      if (error || !code || !userId) {
        setStatus("YouTube authorization failed.");
        setTimeout(() => router.push("/dashboard?error=youtube_auth_failed"), 2000);
        return;
      }

      try {
        // Step 1: Exchange code for tokens via Server Action (keeps client_secret server-side)
        setStatus("Exchanging token...");
        const redirectUri = `${window.location.origin}/youtube-callback`;
        const result = await exchangeYouTubeCode(code, redirectUri);

        if (!result.success) {
          setStatus(`Error: ${result.error}`);
          setTimeout(() => router.push("/dashboard?error=youtube_failed"), 3000);
          return;
        }

        // Step 2: Save to Supabase using the browser client (already authenticated)
        setStatus("Saving connection...");
        const supabase = createClient();

        const { error: dbError } = await supabase
          .from("connected_platforms")
          .upsert(
            {
              user_id: userId,
              platform: "youtube",
              platform_username: result.channel_title,
              access_token: result.access_token,
              refresh_token: result.refresh_token ?? null,
              token_expires_at: result.expires_in
                ? new Date(Date.now() + result.expires_in * 1000).toISOString()
                : null,
              is_active: true,
            },
            { onConflict: "user_id,platform" }
          );

        if (dbError) {
          setStatus(`Database error: ${dbError.message}`);
          setTimeout(() => router.push("/dashboard?error=db_error"), 3000);
          return;
        }

        setStatus("Connected! Redirecting...");
        router.push("/dashboard?connected=youtube");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Error: ${msg}`);
        setTimeout(() => router.push("/dashboard?error=crash"), 3000);
      }
    }

    handleCallback();
  }, [searchParams, router]);

  return <p className="text-sm font-bold text-[#0A0A0A]">{status}</p>;
}

export default function YouTubeCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#0A0A0A] border-t-[#C8FF00] animate-spin mx-auto" />
        <Suspense fallback={<p className="text-sm font-bold text-[#0A0A0A]">Loading...</p>}>
          <YouTubeCallbackInner />
        </Suspense>
      </div>
    </div>
  );
}
