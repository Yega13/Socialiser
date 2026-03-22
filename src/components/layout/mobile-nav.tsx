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
          className={`block h-0.5 w-5 bg-[var(--color-base-black)] transition-all duration-200 ${open ? "rotate-45 translate-y-2" : ""}`}
        />
        <span
          className={`block h-0.5 w-5 bg-[var(--color-base-black)] transition-all duration-200 ${open ? "opacity-0" : ""}`}
        />
        <span
          className={`block h-0.5 w-5 bg-[var(--color-base-black)] transition-all duration-200 ${open ? "-rotate-45 -translate-y-2" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-14 left-0 right-0 bg-[var(--color-base-white)] border-b border-[var(--color-base-black)] z-50 shadow-[var(--shadow-hard)]">
          {user ? (
            <div className="flex flex-col">
              {profile && (
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-base-200)]">
                  <Avatar src={profile.avatar_url} name={profile.full_name} size={32} />
                  <span className="text-sm font-semibold">
                    {profile.full_name ?? "My Account"}
                  </span>
                </div>
              )}
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-medium hover:bg-[var(--color-base-100)] border-b border-[var(--color-base-200)]"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-medium hover:bg-[var(--color-base-100)] border-b border-[var(--color-base-200)]"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-3 text-sm font-medium text-[var(--color-brand-coral)] hover:bg-[var(--color-base-100)] text-left"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-medium hover:bg-[var(--color-base-100)] border-b border-[var(--color-base-200)]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-sm font-bold hover:bg-[var(--color-brand-lime)]"
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
