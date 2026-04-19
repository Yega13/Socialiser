import Link from "next/link";

const TEASER_QUESTIONS = [
  "How much does Socializer cost?",
  "Which platforms does Socializer support?",
  "Can I schedule posts and have them go live automatically?",
  "Is my data secure? Do you store my passwords?",
  "Can I cross-post videos to TikTok and YouTube?",
  "How is Socializer different from Buffer, Later or Metricool?",
];

export function FAQTeaser() {
  return (
    <section className="py-20 px-4 bg-[#F9F9F7] border-t border-[#0A0A0A]">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 lg:gap-16 items-start">
          {/* Left — pitch */}
          <div>
            <div className="inline-flex items-center gap-2 border border-[#0A0A0A] px-3 py-1.5 mb-6 shadow-[2px_2px_0px_0px_#0A0A0A] bg-[#F9F9F7]">
              <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />
              <span className="text-xs font-black uppercase tracking-widest text-[#0A0A0A]">
                FAQ
              </span>
            </div>
            <h2
              className="font-black leading-[0.95] tracking-tight text-[#0A0A0A] mb-5"
              style={{ fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)" }}
            >
              Got a question
              <br />
              before you sign up?
            </h2>
            <p className="text-[#5C5C5A] text-base sm:text-lg leading-relaxed mb-8 max-w-md">
              We answered the ones creators ask us most — pricing, privacy,
              scheduling, TikTok uploads, and how Socializer stacks up against
              the old-school schedulers.
            </p>
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#0A0A0A] text-[#F9F9F7] border border-[#0A0A0A] font-bold text-sm shadow-[4px_4px_0px_0px_#C8FF00] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#C8FF00] transition-all"
            >
              Read the FAQ →
            </Link>
          </div>

          {/* Right — clickable question chips */}
          <div className="space-y-3">
            {TEASER_QUESTIONS.map((q, i) => (
              <Link
                key={q}
                href="/faq"
                className="group flex items-center justify-between gap-4 border border-[#0A0A0A] bg-[#F9F9F7] px-4 py-3.5 shadow-[3px_3px_0px_0px_#0A0A0A] hover:shadow-[1px_1px_0px_0px_#7C3AED] hover:border-[#7C3AED] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                <span className="flex items-center gap-3 text-sm sm:text-base font-bold text-[#0A0A0A]">
                  <span className="text-[10px] font-black text-[#5C5C5A] tabular-nums w-6">
                    0{i + 1}
                  </span>
                  <span>{q}</span>
                </span>
                <span className="shrink-0 w-7 h-7 flex items-center justify-center border border-[#0A0A0A] text-sm font-black bg-[#F9F9F7] group-hover:bg-[#7C3AED] group-hover:text-[#F9F9F7] transition-colors">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
