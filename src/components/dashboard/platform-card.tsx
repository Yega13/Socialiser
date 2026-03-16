"use client";

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
  const router = useRouter();

  async function handleDisconnect() {
    setIsLoading(true);
    await fetch("/api/platforms/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: platform.id }),
    });
    router.refresh();
    setIsLoading(false);
  }

  function handleConnect() {
    if (platform.id === "youtube") {
      const params = new URLSearchParams({
        client_id: "695113371811-i61qt8hbhs9gn3rd4b6ga99114tcimek.apps.googleusercontent.com",
        redirect_uri: `${window.location.origin}/api/auth/callback/youtube`,
        response_type: "code",
        scope: [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
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
            style={{ background: platform.color, color: "#F9F9F7" }}
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
    </div>
  );
}
