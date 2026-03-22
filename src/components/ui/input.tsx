import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-semibold">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-10 w-full px-3 text-sm bg-[var(--color-base-white)]",
            "border border-[var(--color-base-black)] rounded-none outline-none",
            "placeholder:text-[var(--color-base-600)]",
            "focus:ring-2 focus:ring-[var(--color-brand-lime)] focus:ring-offset-0",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-[#FF4F4F] focus:ring-[#FF4F4F]",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-[#FF4F4F] font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
