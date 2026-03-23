"use client";

import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand-lime)] text-[#0A0A0A] border border-[var(--color-base-black)] shadow-[var(--shadow-hard)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--color-base-black)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-semibold transition-all",
  secondary:
    "bg-[var(--color-brand-violet)] text-white border border-[var(--color-base-black)] shadow-[var(--shadow-hard)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--color-base-black)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-semibold transition-all",
  outline:
    "bg-transparent border border-[var(--color-base-black)] shadow-[var(--shadow-hard)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--color-base-black)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-semibold transition-all",
  ghost:
    "bg-transparent border border-[var(--color-base-black)] hover:bg-[var(--color-base-100)] font-semibold transition-colors",
  danger:
    "bg-[var(--color-brand-coral)] text-white border border-[var(--color-base-black)] shadow-[var(--shadow-hard)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--color-base-black)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none font-semibold transition-all",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-none cursor-pointer select-none whitespace-nowrap",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
