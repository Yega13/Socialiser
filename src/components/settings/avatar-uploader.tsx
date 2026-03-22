"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { createClient } from "@/lib/supabase/client";

interface AvatarUploaderProps {
  userId: string;
  currentAvatarUrl?: string | null;
  name?: string | null;
  onUpload?: (url: string) => void;
}

export function AvatarUploader({ userId, currentAvatarUrl, name, onUpload }: AvatarUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error } = useAvatarUpload(userId);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const publicUrl = await upload(file);
    if (publicUrl) {
      // Update profile in DB
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", userId);

      onUpload?.(publicUrl);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative focus:outline-none"
        disabled={uploading}
      >
        <Avatar
          src={preview ?? currentAvatarUrl}
          name={name}
          size={80}
          className="group-hover:opacity-70 transition-opacity"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs font-bold text-[#0A0A0A] bg-[var(--color-brand-lime)] px-1.5 py-0.5 border border-[var(--color-base-black)]">
            {uploading ? "..." : "Edit"}
          </span>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-xs text-[var(--color-base-600)]">
        {uploading ? "Uploading…" : "Click to upload. Max 5 MB."}
      </p>
      {error && <p className="text-xs text-[var(--color-brand-coral)] font-medium">{error}</p>}
    </div>
  );
}
