import Image from "next/image";
import Link from "next/link";
import { SITE_CONFIG } from "@/lib/constants";

export function Footer({ authenticated = false }: { authenticated?: boolean } = {}) {
  return (
    <footer className="border-t border-[#0A0A0A] py-8 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-black text-[#0A0A0A] hover:text-[#7C3AED] transition-colors">
          <Image
            src="/socializer-logo.jpg"
            alt="Socializer logo"
            width={24}
            height={24}
            className="mix-blend-multiply dark:mix-blend-screen"
          />
          {SITE_CONFIG.name}
        </Link>
        <p className="text-xs text-[#5C5C5A]">
          &copy; {new Date().getFullYear()} {SITE_CONFIG.name}. All rights reserved.
        </p>
        <nav className="flex gap-4 text-xs text-[#5C5C5A] flex-wrap justify-center">
          <Link href="/faq" className="hover:text-[#0A0A0A] transition-colors">FAQ</Link>
          <Link href="/privacy" className="hover:text-[#0A0A0A] transition-colors">Privacy</Link>
          <Link href="/tos" className="hover:text-[#0A0A0A] transition-colors">Terms</Link>
          <Link href="/content-policy" className="hover:text-[#0A0A0A] transition-colors">Content Policy</Link>
          {authenticated ? (
            <>
              <Link href="/dashboard" className="hover:text-[#0A0A0A] transition-colors">Dashboard</Link>
              <Link href="/settings" className="hover:text-[#0A0A0A] transition-colors">Settings</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-[#0A0A0A] transition-colors">Login</Link>
              <Link href="/register" className="hover:text-[#0A0A0A] transition-colors">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
