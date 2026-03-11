"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface DropdownItem {
  label?: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  separator?: boolean;
}

interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
}

export function DropdownMenu({ trigger, items, align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center focus:outline-none"
      >
        {trigger}
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full mt-2 z-50 min-w-44 bg-[#F9F9F7] border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A]",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="h-px bg-[#D4D4D2] my-1" />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm font-medium hover:bg-[#EBEBEA] transition-colors",
                  item.danger ? "text-[#FF4F4F]" : "text-[#0A0A0A]"
                )}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
