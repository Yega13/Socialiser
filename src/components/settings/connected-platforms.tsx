"use client";

import { PLATFORMS } from "@/lib/constants";
import type { ConnectedPlatform } from "@/types";

interface ConnectedPlatformsProps {
  platforms: ConnectedPlatform[];
}

export function ConnectedPlatforms({ platforms }: ConnectedPlatformsProps) {
  const active = PLATFORMS.filter((p) => !p.comingSoon);

  return (
    <div className="space-y-3">
      {active.map((platform) => {
        const conn = platforms.find((c) => c.platform === platform.id && c.is_active);
        return (
          <div
            key={platform.id}
            className="flex items-center justify-between p-3 border border-[var(--color-base-black)]"
          >
            <div className="flex items-center gap-3">
              <span
                className="w-9 h-9 flex items-center justify-center text-sm font-black border border-[var(--color-base-black)] shrink-0"
                style={{ background: platform.color, color: platform.textColor }}
              >
                {platform.icon}
              </span>
              <div>
                <p className="text-sm font-bold">{platform.name}</p>
                <p className="text-xs text-[var(--color-base-600)]">
                  {conn
                    ? conn.platform_username
                      ? `Connected as ${conn.platform_username}`
                      : "Connected"
                    : "Not connected"}
                </p>
              </div>
            </div>
            <span
              className={`text-xs font-bold px-2 py-1 border border-[var(--color-base-black)] ${
                conn
                  ? "bg-[var(--color-brand-lime)] text-[#0A0A0A]"
                  : "bg-[var(--color-base-100)] text-[var(--color-base-600)]"
              }`}
            >
              {conn ? "Active" : "Inactive"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
