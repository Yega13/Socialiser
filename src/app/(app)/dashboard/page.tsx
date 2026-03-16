import { createClient } from "@/lib/supabase/server";
import { PlatformsGrid } from "@/components/dashboard/platforms-grid";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: connected }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("connected_platforms")
      .select("platform")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const connectedCount = connected?.length ?? 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A]">
            Hey, {firstName} 👋
          </h1>
          <p className="text-[#5C5C5A] mt-1 text-sm sm:text-base">
            Connect your platforms to start cross-posting.
          </p>
        </div>
        {connectedCount > 0 && (
          <Link
            href="/compose"
            className="bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
          >
            + New Post
          </Link>
        )}
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Your Platforms</h2>
          <span className="text-sm text-[#5C5C5A]">{connectedCount} connected</span>
        </div>
        <PlatformsGrid />
      </section>
    </div>
  );
}
