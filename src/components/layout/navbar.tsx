import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProfileDropdown } from "@/components/layout/profile-dropdown";
import { MobileNav } from "@/components/layout/mobile-nav";
import { BackButton } from "@/components/layout/back-button";
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
    <nav className="sticky top-0 z-40 bg-[var(--color-base-white)] border-b border-[var(--color-base-black)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Back + Logo */}
        <div className="flex items-center gap-1">
          {user && <BackButton />}
          <Link
            href="/"
            className="font-black text-lg tracking-tight hover:text-[var(--color-brand-violet)] transition-colors"
          >
            {SITE_CONFIG.name}
          </Link>
        </div>

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
