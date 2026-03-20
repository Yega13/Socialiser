import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { ProfileForm } from "@/components/settings/profile-form";
import type { Profile } from "@/types";
import type { ProfileInput } from "@/lib/validations";

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

  async function saveProfile(data: ProfileInput) {
    "use server";
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { error } = await supabase.from("profiles").update({
      full_name: data.fullName,
      username: data.username || null,
      bio: data.bio || null,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    if (error) return { error: error.message };
    return {};
  }

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A]">Settings</h1>
        <p className="text-[#5C5C5A] mt-1 text-sm sm:text-base">Manage your profile and preferences.</p>
      </div>

      <section className="border border-[#0A0A0A] p-4 sm:p-6 shadow-[4px_4px_0px_0px_#0A0A0A]">
        <h2 className="text-lg font-bold mb-6">Profile</h2>

        <div className="space-y-6">
          <AvatarUploader
            userId={user.id}
            currentAvatarUrl={(profile as Profile | null)?.avatar_url}
            name={(profile as Profile | null)?.full_name}
            onUpload={() => {}}
          />

          <ProfileForm
            profile={profile as Profile | null}
            onSave={saveProfile}
          />
        </div>
      </section>

      <section className="border border-[#0A0A0A] p-4 sm:p-6 shadow-[4px_4px_0px_0px_#0A0A0A]">
        <h2 className="text-lg font-bold mb-2">Account</h2>
        <p className="text-sm text-[#5C5C5A]">{user.email}</p>
      </section>
    </div>
  );
}
