"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthCallbackInner() {
  const [status, setStatus] = useState("Signing you in...");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        router.push(`/login?error=${encodeURIComponent(errorDescription ?? error)}`);
        return;
      }

      if (!code) {
        router.push("/login?error=no_code");
        return;
      }

      const supabase = createClient();
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        setStatus(`Error: ${exchangeError.message}`);
        setTimeout(() => router.push(`/login?error=${encodeURIComponent(exchangeError.message)}`), 2000);
        return;
      }

      router.push("/dashboard");
    }

    handleCallback();
  }, [searchParams, router]);

  return <p className="text-sm font-bold text-[#F9F9F7]">{status}</p>;
}

export default function AuthCallbackPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0A0A0A]">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#F9F9F7] border-t-[#C8FF00] animate-spin mx-auto" />
        <Suspense fallback={<p className="text-sm font-bold text-[#F9F9F7]">Loading...</p>}>
          <AuthCallbackInner />
        </Suspense>
      </div>
    </div>
  );
}
