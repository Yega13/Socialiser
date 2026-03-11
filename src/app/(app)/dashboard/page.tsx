import { createClient } from "@/lib/supabase/server";
import { PlatformsGrid } from "@/components/dashboard/platforms-grid";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A]">
          Hey, {firstName} 👋
        </h1>
        <p className="text-[#5C5C5A] mt-1 text-sm sm:text-base">
          Connect your platforms to start cross-posting.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Your Platforms</h2>
          <span className="text-sm text-[#5C5C5A]">0 connected</span>
        </div>
        <PlatformsGrid />
      </section>
    </div>
  );
}
