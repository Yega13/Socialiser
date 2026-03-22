import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "brand";
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[var(--color-base-white)] border border-[var(--color-base-black)] p-6",
        variant === "brand" && "shadow-[var(--shadow-brand)]",
        variant === "default" && "shadow-[var(--shadow-hard)]",
        className
      )}
      {...props}
    />
  );
}
