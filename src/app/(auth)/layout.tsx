import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_CONFIG } from "@/lib/constants";

export const metadata: Metadata = {
  robots: { index: false },
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      <header className="p-4 sm:p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <span className="text-[#C8FF00] font-black text-xl tracking-tight">
            {SITE_CONFIG.name}
          </span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <footer className="p-4 sm:p-6 text-center text-xs text-[#5C5C5A]">
        &copy; {new Date().getFullYear()} {SITE_CONFIG.name}
      </footer>
    </div>
  );
}
