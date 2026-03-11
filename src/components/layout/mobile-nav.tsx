"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";
import type { Profile } from "@/types";

interface MobileNavProps {
  user: boolean;
  profile: Profile | null;
}

export function MobileNav({ user, profile }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col gap-1.5 p-2 focus:outline-none"
        aria-label="Toggle menu"
      >
        <span
          className={`block h-0.5 w-5 bg-[#0A0A0A] transition-all duration-200 ${open ? "rotate-45 translate-y-2" : ""}`}
        />
        <span
          className={`block h-0.5 w-5 bg-[#0A0A0A] transition-all duration-200 ${open ? "opacity-0" : ""}`}
        />
        <span
          className={`block h-0.5 w-5 bg-[#0A0A0A] transition-all duration-200 ${open ? "-rotate-45 -translate-y-2" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-14 left-0 right-0 bg-[#F9F9F7] border-b border-[#0A0A0A] z-50 shadow-[0_4px_0px_0px_#0A0A0A]">
          {user ? (
            <div className="flex flex-col">
              {profile && (
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#EBEBEA]">
                  <Avatar src={profile.avatar_url} name={profile.full_name} size={32} />
                  <span className="text-sm font-semibold text-[#0A0A0A]">
                    {profile.full_name ?? "My Account"}
                  </span>
                </div>
              )}
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-medium text-[#0A0A0A] hover:bg-[#EBEBEA] border-b border-[#EBEBEA]"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-medium text-[#0A0A0A] hover:bg-[#EBEBEA] border-b border-[#EBEBEA]"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-3 text-sm font-medium text-[#FF4F4F] hover:bg-[#EBEBEA] text-left"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-medium text-[#0A0A0A] hover:bg-[#EBEBEA] border-b border-[#EBEBEA]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-bold text-[#0A0A0A] hover:bg-[#C8FF00]"
              >
                Get started →
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
