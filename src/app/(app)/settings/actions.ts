"use server";

import { createClient } from "@/lib/supabase/server";
import type { ProfileInput } from "@/lib/validations";

export async function saveProfile(data: ProfileInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.fullName,
      username: data.username || null,
      bio: data.bio || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return {};
}
