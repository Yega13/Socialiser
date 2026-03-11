"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import type { Profile } from "@/types";

interface ProfileDropdownProps {
  profile: Profile | null;
}

export function ProfileDropdown({ profile }: ProfileDropdownProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu
      trigger={
        <Avatar
          src={profile?.avatar_url}
          name={profile?.full_name}
          size={36}
          className="cursor-pointer hover:ring-2 hover:ring-[#C8FF00] hover:ring-offset-1 transition-all"
        />
      }
      items={[
        {
          label: profile?.full_name ?? "My Account",
          onClick: () => router.push("/settings"),
        },
        { separator: true },
        { label: "Settings", onClick: () => router.push("/settings") },
        { label: "Dashboard", onClick: () => router.push("/dashboard") },
        { separator: true },
        { label: "Sign out", onClick: handleSignOut, danger: true },
      ]}
    />
  );
}
