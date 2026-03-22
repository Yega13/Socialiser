import { cn } from "@/lib/utils";
import Image from "next/image";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 36, className }: AvatarProps) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden border border-[var(--color-base-black)] bg-[var(--color-brand-lime)] shrink-0",
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "Avatar"}
          fill
          className="object-cover"
          sizes={`${size}px`}
        />
      ) : (
        <span
          className="font-black text-[#0A0A0A] select-none"
          style={{ fontSize: size * 0.38 }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
