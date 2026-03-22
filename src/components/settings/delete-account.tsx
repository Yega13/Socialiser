"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    const supabase = createClient();
    // Sign out — actual account deletion requires admin/edge function
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)} className="w-full sm:w-auto">
        Delete my account
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-brand-coral)] font-medium">
        Are you sure? This action cannot be undone.
      </p>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={handleDelete} loading={loading}>
          Yes, delete everything
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
