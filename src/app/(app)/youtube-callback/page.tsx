"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeYouTubeCode } from "./actions";

export default function YouTubeCallbackPage() {
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
        setStatus("Exchanging token...");
        const redirectUri = `${window.location.origin}/youtube-callback`;
        const result = await exchangeYouTubeCode(code, redirectUri, userId);

        if (!result.success) {
          setStatus(`Error: ${result.error}`);
          setTimeout(() => router.push(`/dashboard?error=youtube_failed`), 3000);
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

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#0A0A0A] border-t-[#C8FF00] animate-spin mx-auto" />
        <p className="text-sm font-bold text-[#0A0A0A]">{status}</p>
      </div>
    </div>
  );
}
