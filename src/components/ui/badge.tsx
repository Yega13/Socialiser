import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "lime" | "violet" | "coral" | "sky";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-base-100)] border-[var(--color-base-200)]",
  lime: "bg-[#C8FF00] text-[#0A0A0A] border-[var(--color-base-black)]",
  violet: "bg-[#7C3AED] text-white border-[var(--color-base-black)]",
  coral: "bg-[#FF4F4F] text-white border-[var(--color-base-black)]",
  sky: "bg-[#00D4FF] text-[#0A0A0A] border-[var(--color-base-black)]",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-semibold border uppercase tracking-wide",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
