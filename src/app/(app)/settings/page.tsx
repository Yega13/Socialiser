import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { ProfileForm } from "@/components/settings/profile-form";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { LogoutButton } from "@/components/settings/logout-button";
import { ConnectedPlatforms } from "@/components/settings/connected-platforms";
import { DeleteAccount } from "@/components/settings/delete-account";
import { saveProfile } from "./actions";
import type { Profile, ConnectedPlatform } from "@/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: platforms } = await supabase
    .from("connected_platforms")
    .select("*")
    .eq("user_id", user.id);

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black">Settings</h1>
        <p className="text-[var(--color-base-600)] mt-1 text-sm sm:text-base">
          Manage your profile and preferences.
        </p>
      </div>

      {/* Profile */}
      <section className="border border-[var(--color-base-black)] p-4 sm:p-6 shadow-[var(--shadow-hard)]">
        <h2 className="text-lg font-bold mb-6">Profile</h2>
        <div className="space-y-6">
          <AvatarUploader
            userId={user.id}
            currentAvatarUrl={(profile as Profile | null)?.avatar_url}
            name={(profile as Profile | null)?.full_name}
          />
          <ProfileForm
            profile={profile as Profile | null}
            onSave={saveProfile}
          />
        </div>
      </section>

      {/* Connected Platforms */}
      <section className="border border-[var(--color-base-black)] p-4 sm:p-6 shadow-[var(--shadow-hard)]">
        <h2 className="text-lg font-bold mb-1">Connected Platforms</h2>
        <p className="text-xs text-[var(--color-base-600)] mb-4">
          Manage connections from the Compose page.
        </p>
        <ConnectedPlatforms platforms={(platforms as ConnectedPlatform[]) ?? []} />
      </section>

      {/* Appearance */}
      <section className="border border-[var(--color-base-black)] p-4 sm:p-6 shadow-[var(--shadow-hard)]">
        <h2 className="text-lg font-bold mb-1">Appearance</h2>
        <p className="text-xs text-[var(--color-base-600)] mb-4">Switch between light and dark theme.</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Dark mode</span>
          <ThemeToggle />
        </div>
      </section>

      {/* Account */}
      <section className="border border-[var(--color-base-black)] p-4 sm:p-6 shadow-[var(--shadow-hard)]">
        <h2 className="text-lg font-bold mb-4">Account</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-[var(--color-base-600)]">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Session</p>
              <p className="text-xs text-[var(--color-base-600)]">Sign out of your account on this device.</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="border border-[var(--color-brand-coral)] p-4 sm:p-6">
        <h2 className="text-lg font-bold text-[var(--color-brand-coral)] mb-1">Danger Zone</h2>
        <p className="text-xs text-[var(--color-base-600)] mb-4">
          Permanently delete your account and all associated data.
        </p>
        <DeleteAccount />
      </section>
    </div>
  );
}
