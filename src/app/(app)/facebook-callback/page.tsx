"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { exchangeFacebookCode, type FacebookPage } from "./actions";

function FacebookCallbackInner() {
  const [status, setStatus] = useState("Connecting Facebook...");
  const [pages, setPages] = useState<FacebookPage[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const stateUserId = searchParams.get("state");

      if (error || !code || !stateUserId) {
        setStatus(`Facebook authorization failed${error ? `: ${error}` : ""}.`);
        setTimeout(() => router.push("/dashboard?error=facebook_auth_failed"), 2500);
        return;
      }

      try {
        setStatus("Exchanging token...");
        const redirectUri = `${window.location.origin}/facebook-callback`;
        const result = await exchangeFacebookCode(code, redirectUri);

        if (!result.success || !result.pages) {
          setStatus(`Error: ${result.error}`);
          setTimeout(() => router.push("/dashboard?error=facebook_failed"), 4000);
          return;
        }

        setUserId(stateUserId);

        if (result.pages.length === 1) {
          await savePage(stateUserId, result.pages[0]);
        } else {
          setPages(result.pages);
          setStatus("Choose a Page to connect:");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Error: ${msg}`);
        setTimeout(() => router.push("/dashboard?error=crash"), 3000);
      }
    }

    handleCallback();
  }, [searchParams, router]);

  async function savePage(uid: string, page: FacebookPage) {
    setSaving(true);
    setStatus(`Connecting "${page.name}"...`);
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("connected_platforms")
      .upsert(
        {
          user_id: uid,
          platform: "facebook",
          platform_username: page.name,
          platform_user_id: page.id,
          access_token: page.access_token,
          refresh_token: null,
          token_expires_at: null,
          is_active: true,
        },
        { onConflict: "user_id,platform" }
      );

    if (dbError) {
      setStatus(`Database error: ${dbError.message}`);
      setSaving(false);
      setTimeout(() => router.push("/dashboard?error=db_error"), 3000);
      return;
    }

    setStatus("Connected! Redirecting...");
    router.push("/dashboard?connected=facebook");
  }

  if (pages && userId) {
    return (
      <div className="space-y-3 text-left max-w-sm">
        <p className="text-sm font-bold text-[#0A0A0A]">{status}</p>
        <div className="space-y-2">
          {pages.map((p) => (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => savePage(userId, p)}
              className="w-full text-left bg-[#F9F9F7] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#1877F2] px-4 py-3 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#1877F2] transition-all disabled:opacity-50"
            >
              <div className="font-bold text-sm text-[#0A0A0A]">{p.name}</div>
              {p.category && <div className="text-[10px] text-[#5C5C5A] mt-0.5">{p.category}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <p className="text-sm font-bold text-[#0A0A0A]">{status}</p>;
}

export default function FacebookCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#0A0A0A] border-t-[#1877F2] animate-spin mx-auto" />
        <Suspense fallback={<p className="text-sm font-bold text-[#0A0A0A]">Loading...</p>}>
          <FacebookCallbackInner />
        </Suspense>
      </div>
    </div>
  );
}
