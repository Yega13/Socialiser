"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export function BackButton() {
  const pathname = usePathname();

  // Hide on dashboard (already home) and on landing/auth pages
  if (pathname === "/dashboard" || pathname === "/" || pathname === "/login" || pathname === "/register") {
    return null;
  }

  return (
    <Link
      href="/dashboard"
      className="flex items-center justify-center w-8 h-8 text-[#0A0A0A] hover:text-[#7C3AED] transition-colors"
      aria-label="Back to dashboard"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      </svg>
    </Link>
  );
}
