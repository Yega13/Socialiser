import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;

  if (params.error) {
    redirect(`/login?error=${encodeURIComponent(params.error_description ?? params.error)}`);
  }

  if (!params.code) {
    redirect("/login?error=no_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(params.code!);

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}
