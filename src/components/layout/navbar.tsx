import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProfileDropdown } from "@/components/layout/profile-dropdown";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { SITE_CONFIG } from "@/lib/constants";
import type { Profile } from "@/types";

export async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <nav className="sticky top-0 z-40 bg-[#F9F9F7] border-b border-[#0A0A0A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo — always links to home */}
        <Link
          href="/"
          className="font-black text-lg tracking-tight text-[#0A0A0A] hover:text-[#7C3AED] transition-colors"
        >
          {SITE_CONFIG.name}
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-3">
          {user ? (
            <ProfileDropdown profile={profile} />
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden">
          <MobileNav user={!!user} profile={profile} />
        </div>
      </div>
    </nav>
  );
}
