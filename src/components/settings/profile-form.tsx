"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema, type ProfileInput } from "@/lib/validations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/types";

interface ProfileFormProps {
  profile: Profile | null;
  onSave: (data: ProfileInput) => Promise<{ error?: string }>;
}

export function ProfileForm({ profile, onSave }: ProfileFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: profile?.full_name ?? "",
      username: profile?.username ?? "",
      bio: profile?.bio ?? "",
    },
  });

  async function onSubmit(data: ProfileInput) {
    await onSave(data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 w-full max-w-md">
      <Input
        id="fullName"
        label="Full name"
        placeholder="Jane Smith"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Input
        id="username"
        label="Username"
        placeholder="janesmith"
        error={errors.username?.message}
        {...register("username")}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-semibold text-[#0A0A0A]">
          Bio
        </label>
        <textarea
          id="bio"
          rows={3}
          placeholder="Tell the world about yourself…"
          className="w-full px-3 py-2 text-sm bg-[#F9F9F7] text-[#0A0A0A] border border-[#0A0A0A] rounded-none outline-none placeholder:text-[#5C5C5A] focus:ring-2 focus:ring-[#C8FF00] resize-none"
          {...register("bio")}
        />
        {errors.bio && (
          <p className="text-xs text-[#FF4F4F] font-medium">{errors.bio.message}</p>
        )}
      </div>

      <Button
        type="submit"
        loading={isSubmitting}
        disabled={!isDirty}
        className="w-full"
      >
        Save changes
      </Button>
    </form>
  );
}
