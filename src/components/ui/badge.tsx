import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "lime" | "violet" | "coral" | "sky";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-[#EBEBEA] text-[#0A0A0A] border-[#D4D4D2]",
  lime: "bg-[#C8FF00] text-[#0A0A0A] border-[#0A0A0A]",
  violet: "bg-[#7C3AED] text-white border-[#0A0A0A]",
  coral: "bg-[#FF4F4F] text-white border-[#0A0A0A]",
  sky: "bg-[#00D4FF] text-[#0A0A0A] border-[#0A0A0A]",
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
