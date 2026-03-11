import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="py-20 sm:py-32 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 border border-[#0A0A0A] px-3 py-1.5 mb-8 shadow-[2px_2px_0px_0px_#0A0A0A]">
          <span className="w-2 h-2 rounded-full bg-[#C8FF00] animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-widest text-[#0A0A0A]">
            Now in beta
          </span>
        </div>

        <h1
          className="font-black leading-none tracking-tight text-[#0A0A0A] mb-6"
          style={{ fontSize: "clamp(3rem, 8vw, 7rem)" }}
        >
          Post once.
          <br />
          <span className="text-[#7C3AED]">Everywhere.</span>
        </h1>

        <p className="text-lg sm:text-xl text-[#5C5C5A] max-w-2xl mb-10 leading-relaxed">
          Socializer cross-posts your content to X, LinkedIn, Instagram, Threads, Bluesky, and TikTok — simultaneously. One compose box to rule them all.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Link href="/register">
            <Button size="lg">
              Start for free →
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="lg">
              Sign in
            </Button>
          </Link>
        </div>

        <p className="text-xs text-[#5C5C5A] mt-6">
          No credit card required. Free forever on the starter plan.
        </p>
      </div>
    </section>
  );
}
