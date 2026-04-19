import { createClient } from "@/lib/supabase/server";
import { PlatformsGrid } from "@/components/dashboard/platforms-grid";
import { AnalyticsSection } from "@/components/dashboard/analytics-section";
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
          <div className="flex gap-2">
            <Link
              href="/scheduled"
              className="bg-[#7C3AED] text-[#F9F9F7] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
            >
              Scheduled
            </Link>
            <Link
              href="/compose"
              className="bg-[#C8FF00] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A] px-4 py-2 font-bold text-sm text-[#0A0A0A] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#0A0A0A] transition-all"
            >
              + New Post
            </Link>
          </div>
        )}
      </div>

      <section>
        <div className="flex items-end justify-between mb-5 border-b-2 border-[#0A0A0A] pb-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 bg-[#C8FF00] border border-[#0A0A0A] shadow-[3px_3px_0px_0px_#0A0A0A] text-lg">
              🔌
            </span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#5C5C5A]">
                Section 01
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] leading-none">
                Connected Platforms
              </h2>
            </div>
          </div>
          <span className="text-xs font-bold text-[#0A0A0A] bg-[#F9F9F7] border border-[#0A0A0A] px-2 py-1">
            {connectedCount} connected
          </span>
        </div>
        <PlatformsGrid />
      </section>

      <section>
        <div className="flex items-end justify-between mb-5 border-b-2 border-[#0A0A0A] pb-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 bg-[#7C3AED] border border-[#0A0A0A] shadow-[3px_3px_0px_0px_#0A0A0A] text-lg text-[#F9F9F7]">
              📊
            </span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#5C5C5A]">
                Section 02
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#0A0A0A] leading-none">
                Analytics &amp; Insights
              </h2>
            </div>
          </div>
          <span className="text-xs font-bold text-[#0A0A0A] bg-[#F9F9F7] border border-[#0A0A0A] px-2 py-1 hidden sm:inline-block">
            Live data
          </span>
        </div>
        <AnalyticsSection userId={user.id} />
      </section>
    </div>
  );
}
