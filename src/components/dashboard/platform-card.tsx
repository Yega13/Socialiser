"use client"; // v2

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Platform } from "@/lib/constants";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface PlatformCardProps {
  platform: Platform;
  connected?: boolean;
  platformUsername?: string | null;
}

export function PlatformCard({
  platform,
  connected = false,
  platformUsername,
}: PlatformCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showBlueskyForm, setShowBlueskyForm] = useState(false);
  const [bskyHandle, setBskyHandle] = useState("");
  const [bskyAppPassword, setBskyAppPassword] = useState("");
  const [bskyError, setBskyError] = useState("");
  const router = useRouter();

  async function handleDisconnect() {
    setIsLoading(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase
      .from("connected_platforms")
      .delete()
      .eq("platform", platform.id);
    router.refresh();
    setIsLoading(false);
  }

  async function handleBlueskyConnect() {
    if (!bskyHandle.trim() || !bskyAppPassword.trim()) {
      setBskyError("Enter both handle and app password.");
      return;
    }
    setIsLoading(true);
    setBskyError("");

    try {
      // Authenticate with Bluesky
      const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: bskyHandle.trim(),
          password: bskyAppPassword.trim(),
        }),
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}));
        setBskyError(err?.message || "Invalid handle or app password.");
        setIsLoading(false);
        return;
      }

      const session = await sessionRes.json();

      // Save to database
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const { error: dbError } = await supabase
        .from("connected_platforms")
        .upsert(
          {
            user_id: user.id,
            platform: "bluesky",
            platform_username: session.handle,
            platform_user_id: session.did,
            access_token: session.accessJwt,
            refresh_token: session.refreshJwt,
            token_expires_at: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
            is_active: true,
          },
          { onConflict: "user_id,platform" }
        );

      if (dbError) {
        setBskyError(`Database error: ${dbError.message}`);
        setIsLoading(false);
        return;
      }

      setShowBlueskyForm(false);
      setBskyHandle("");
      setBskyAppPassword("");
      router.refresh();
    } catch (err) {
      setBskyError(err instanceof Error ? err.message : "Connection failed.");
    }
    setIsLoading(false);
  }

  async function handleConnect() {
    if (platform.id === "youtube") {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const params = new URLSearchParams({
        client_id: "695113371811-i61qt8hbhs9gn3rd4b6ga99114tcimek.apps.googleusercontent.com",
        redirect_uri: `${window.location.origin}/youtube-callback`,
        response_type: "code",
        scope: [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
        state: user.id,
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else if (platform.id === "instagram") {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const params = new URLSearchParams({
        client_id: "786960820704998",
        redirect_uri: `${window.location.origin}/instagram-callback`,
        response_type: "code",
        scope: "instagram_business_basic,instagram_business_content_publish",
        state: user.id,
      });
      window.location.href = `https://api.instagram.com/oauth/authorize?${params}`;
    } else if (platform.id === "threads") {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      const params = new URLSearchParams({
        client_id: "853019483864231",
        redirect_uri: `${window.location.origin}/threads-callback`,
        response_type: "code",
        scope: "threads_basic,threads_content_publish",
        state: user.id,
      });
      window.location.href = `https://threads.net/oauth/authorize?${params}`;
    } else if (platform.id === "bluesky") {
      setShowBlueskyForm(true);
      setBskyError("");
    } else {
      window.location.href = `/api/auth/${platform.id}`;
    }
  }

  return (
    <div
      className={cn(
        "bg-[#F9F9F7] border border-[#0A0A0A] p-5 flex flex-col gap-4",
        "shadow-[4px_4px_0px_0px_#0A0A0A] transition-all duration-150",
        connected && "border-[#7C3AED] shadow-[4px_4px_0px_0px_#7C3AED]"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center border border-[#0A0A0A] font-black text-sm shrink-0"
            style={{ background: platform.color, color: platform.textColor }}
          >
            {platform.icon}
          </div>
          <div>
            <div className="font-bold text-sm text-[#0A0A0A]">{platform.name}</div>
            <div className="text-xs text-[#5C5C5A]">
              {platformUsername ?? platform.description}
            </div>
          </div>
        </div>
        {platform.comingSoon && (
          <Badge variant="default" className="shrink-0 ml-2">Soon</Badge>
        )}
        {connected && !platform.comingSoon && (
          <Badge variant="lime" className="shrink-0 ml-2">Live</Badge>
        )}
      </div>

      {showBlueskyForm && !connected && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Handle (e.g. alice.bsky.social)"
            value={bskyHandle}
            onChange={(e) => setBskyHandle(e.target.value)}
            className="w-full border border-[#0A0A0A] p-2 text-xs bg-[#F9F9F7] outline-none focus:shadow-[2px_2px_0px_0px_#0085FF]"
          />
          <input
            type="password"
            placeholder="App Password"
            value={bskyAppPassword}
            onChange={(e) => setBskyAppPassword(e.target.value)}
            className="w-full border border-[#0A0A0A] p-2 text-xs bg-[#F9F9F7] outline-none focus:shadow-[2px_2px_0px_0px_#0085FF]"
          />
          {bskyError && (
            <p className="text-xs font-bold text-[#FF4F4F]">{bskyError}</p>
          )}
          <p className="text-[10px] text-[#5C5C5A]">
            Go to Bluesky → Settings → App Passwords → Add App Password
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={isLoading}
              onClick={handleBlueskyConnect}
              className="flex-1"
            >
              {isLoading ? "..." : "Connect"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowBlueskyForm(false); setBskyError(""); }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showBlueskyForm && (
        <Button
          variant={connected ? "outline" : "primary"}
          size="sm"
          disabled={platform.comingSoon || isLoading}
          onClick={connected ? handleDisconnect : handleConnect}
          className="w-full"
        >
          {platform.comingSoon
            ? "Coming Soon"
            : isLoading
            ? "..."
            : connected
            ? "Disconnect"
            : "Connect"}
        </Button>
      )}
    </div>
  );
}
