import { PLATFORMS } from "@/lib/constants";
import { PlatformCard } from "./platform-card";
import { createClient } from "@/lib/supabase/server";

export async function PlatformsGrid() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const connectedPlatforms =
    user
      ? (
          await supabase
            .from("connected_platforms")
            .select("platform, platform_username")
            .eq("user_id", user.id)
            .eq("is_active", true)
        ).data ?? []
      : [];

  const connectedMap = new Map(
    connectedPlatforms.map((p) => [p.platform, p.platform_username])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {PLATFORMS.map((platform) => (
        <PlatformCard
          key={platform.id}
          platform={platform}
          connected={connectedMap.has(platform.id)}
          platformUsername={connectedMap.get(platform.id) ?? null}
        />
      ))}
    </div>
  );
}
