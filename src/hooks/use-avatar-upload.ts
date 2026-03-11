"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useAvatarUpload(userId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const path = `${userId}/avatar.webp`;

      // Convert to webp via canvas for consistent format
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const MAX = 400;
      const scale = Math.min(MAX / bitmap.width, MAX / bitmap.height, 1);
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((res) =>
        canvas.toBlob((b) => res(b!), "image/webp", 0.9)
      );

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, {
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Bust cache with timestamp
      return `${data.publicUrl}?t=${Date.now()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
