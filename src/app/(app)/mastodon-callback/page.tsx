"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { exchangeMastodonCode } from "./actions";

function MastodonCallbackInner() {
  const [status, setStatus] = useState("Connecting Mastodon...");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const state = searchParams.get("state") ?? "";
      if (error || !code || !state) {
        setStatus(`Mastodon authorization failed${error ? `: ${error}` : ""}.`);
        setTimeout(() => router.push("/dashboard?error=mastodon_auth_failed"), 2500);
        return;
      }

      const [stateUserId, instanceHost] = state.split("|");
      if (!stateUserId || !instanceHost) {
        setStatus("Invalid state from Mastodon.");
        setTimeout(() => router.push("/dashboard?error=mastodon_state"), 2500);
        return;
      }

      setStatus("Exchanging token...");
      const origin = window.location.origin;
      const result = await exchangeMastodonCode(code, instanceHost, origin);
      if (cancelled) return;

      if (!result.success) {
        setStatus(`Error: ${result.error}`);
        setTimeout(() => router.push("/dashboard?error=mastodon_failed"), 4000);
        return;
      }

      setStatus("Saving connection...");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== stateUserId) {
        setStatus("Session mismatch. Log in again.");
        setTimeout(() => router.push("/login"), 2500);
        return;
      }

      const host = result.instance.replace(/^https?:\/\//, "");
      const { error: dbError } = await supabase
        .from("connected_platforms")
        .upsert(
          {
            user_id: user.id,
            platform: "mastodon",
            platform_username: `@${result.account.username}@${host}`,
            platform_user_id: result.account.id,
            access_token: result.accessToken,
            refresh_token: result.instance,
            is_active: true,
          },
          { onConflict: "user_id,platform" }
        );

      if (dbError) {
        setStatus(`Database error: ${dbError.message}`);
        setTimeout(() => router.push("/dashboard?error=db_error"), 3000);
        return;
      }

      setStatus("Connected! Redirecting...");
      router.push("/dashboard?connected=mastodon");
    }

    run();
    return () => { cancelled = true; };
  }, [searchParams, router]);

  return <p className="text-sm font-bold text-[#0A0A0A]">{status}</p>;
}

export default function MastodonCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#0A0A0A] border-t-[#6364FF] animate-spin mx-auto" />
        <Suspense fallback={<p className="text-sm font-bold text-[#0A0A0A]">Loading...</p>}>
          <MastodonCallbackInner />
        </Suspense>
      </div>
    </div>
  );
}
