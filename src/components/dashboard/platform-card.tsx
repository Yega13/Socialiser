import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Platform } from "@/lib/constants";

interface PlatformCardProps {
  platform: Platform;
  connected?: boolean;
}

export function PlatformCard({ platform, connected = false }: PlatformCardProps) {
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
            <div className="text-xs text-[#5C5C5A]">{platform.description}</div>
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
        variant="outline"
        size="sm"
        disabled={platform.comingSoon}
        className="w-full"
      >
        {platform.comingSoon
          ? "Coming Soon"
          : connected
          ? "Disconnect"
          : "Connect"}
      </Button>
    </div>
  );
}
