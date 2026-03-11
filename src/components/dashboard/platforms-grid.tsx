import { PLATFORMS } from "@/lib/constants";
import { PlatformCard } from "./platform-card";

export function PlatformsGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {PLATFORMS.map((platform) => (
        <PlatformCard key={platform.id} platform={platform} />
      ))}
    </div>
  );
}
