"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ActiveSessionsProps {
  lastSignInAt: string | null;
  email: string | undefined;
}

export function ActiveSessions({ lastSignInAt, email }: ActiveSessionsProps) {
  const router = useRouter();
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingOthers, setLoadingOthers] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function handleSignOutLocal() {
    setLoadingLocal(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    router.push("/");
    router.refresh();
  }

  async function handleSignOutOthers() {
    setLoadingOthers(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setLoadingOthers(false);
    if (error) {
      setMessage({ text: "Failed to sign out other sessions.", error: true });
    } else {
      setMessage({ text: "All other sessions have been signed out." });
    }
  }

  async function handleSignOutAll() {
    setLoadingAll(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 border border-[var(--color-base-200)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center border border-[var(--color-base-black)] bg-[var(--color-brand-lime)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="square">
              <rect x="2" y="3" width="20" height="14" rx="0" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold">Current session</p>
            <p className="text-xs text-[var(--color-base-600)]">
              {email} &middot; {lastSignInAt
                ? `Signed in ${new Date(lastSignInAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : "Active now"}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 border border-[var(--color-base-black)] bg-[var(--color-brand-lime)] text-[#0A0A0A]">
          ACTIVE
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="outline" size="sm" onClick={handleSignOutLocal} loading={loadingLocal} className="flex-1">
          Sign out this device
        </Button>
        <Button variant="outline" size="sm" onClick={handleSignOutOthers} loading={loadingOthers} className="flex-1">
          Sign out other devices
        </Button>
        <Button variant="danger" size="sm" onClick={handleSignOutAll} loading={loadingAll} className="flex-1">
          Sign out everywhere
        </Button>
      </div>

      {message && (
        <p className={`text-xs font-medium ${message.error ? "text-[var(--color-brand-coral)]" : "text-[var(--color-base-600)]"}`}>
          {message.error ? "" : ""}  {message.text}
        </p>
      )}
    </div>
  );
}
