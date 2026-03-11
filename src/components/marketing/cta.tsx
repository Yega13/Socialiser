import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-4xl sm:text-5xl font-black text-[#0A0A0A] mb-4">
          Ready to grow
          <br />
          <span className="text-[#7C3AED]">everywhere at once?</span>
        </h2>
        <p className="text-[#5C5C5A] text-lg mb-8">
          Join thousands of creators who cross-post with Socializer.
        </p>
        <Link href="/register">
          <Button size="lg" className="text-base px-10">
            Get started free →
          </Button>
        </Link>
      </div>
    </section>
  );
}
