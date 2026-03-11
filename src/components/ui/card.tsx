import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "brand";
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-[#F9F9F7] border border-[#0A0A0A] p-6",
        variant === "brand" && "shadow-[4px_4px_0px_0px_#7C3AED]",
        variant === "default" && "shadow-[4px_4px_0px_0px_#0A0A0A]",
        className
      )}
      {...props}
    />
  );
}
