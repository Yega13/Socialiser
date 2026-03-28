import Link from "next/link";
import { SITE_CONFIG } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-[#0A0A0A] py-8 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="font-black text-[#0A0A0A] hover:text-[#7C3AED] transition-colors">
          {SITE_CONFIG.name}
        </Link>
        <p className="text-xs text-[#5C5C5A]">
          &copy; {new Date().getFullYear()} {SITE_CONFIG.name}. All rights reserved.
        </p>
        <nav className="flex gap-4 text-xs text-[#5C5C5A]">
          <Link href="/privacy" className="hover:text-[#0A0A0A] transition-colors">Privacy</Link>
          <Link href="/tos" className="hover:text-[#0A0A0A] transition-colors">Terms</Link>
          <Link href="/content-policy" className="hover:text-[#0A0A0A] transition-colors">Content Policy</Link>
          <Link href="/login" className="hover:text-[#0A0A0A] transition-colors">Login</Link>
          <Link href="/register" className="hover:text-[#0A0A0A] transition-colors">Sign up</Link>
        </nav>
      </div>
    </footer>
  );
}
