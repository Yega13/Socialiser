import type { Metadata } from "next";
import Link from "next/link";
import { SITE_CONFIG } from "@/lib/constants";

export const metadata: Metadata = {
  title: `FAQ — ${SITE_CONFIG.name}`,
  description:
    "Answers to the most common questions about Socializer — cross-posting, scheduling, TikTok uploads, analytics, pricing, and security.",
  alternates: { canonical: `${SITE_CONFIG.url}/faq` },
  openGraph: {
    title: `FAQ — ${SITE_CONFIG.name}`,
    description:
      "Everything you need to know about cross-posting, scheduling, and analytics with Socializer.",
    url: `${SITE_CONFIG.url}/faq`,
    type: "website",
  },
};

type FAQ = { q: string; a: string; category: string };

const FAQS: FAQ[] = [
  // ── Getting started ──
  {
    category: "Getting started",
    q: "What is Socializer?",
    a: "Socializer is a free social media cross-posting tool. Write a post once, pick the platforms, and publish to YouTube, Instagram, Threads, Facebook, Bluesky, TikTok, and Mastodon simultaneously — with a single click or on a schedule.",
  },
  {
    category: "Getting started",
    q: "How much does Socializer cost?",
    a: "Socializer is free to use while in beta. No credit card, no trial timer, and no hidden limits on connected platforms. Paid plans for teams and higher volume will be introduced after the beta, but the starter plan will stay free forever.",
  },
  {
    category: "Getting started",
    q: "Do I need a business account on each platform?",
    a: "YouTube, Bluesky, Mastodon and TikTok work with personal accounts. Instagram and Facebook require a Business or Creator account linked to a Facebook Page — this is a platform limitation, not a Socializer one. Threads works with any Instagram login.",
  },
  {
    category: "Getting started",
    q: "How do I connect a platform?",
    a: "Go to your Dashboard, click Connect on the platform card, and authorize Socializer through the platform's official OAuth screen. We never see or store your password — only a revocable access token that you can invalidate at any time from the platform's settings.",
  },

  // ── Cross-posting ──
  {
    category: "Cross-posting",
    q: "Which social media platforms does Socializer support?",
    a: "YouTube (videos, Shorts, thumbnails), Instagram (feed posts, Reels, Stories, carousels), Threads (text, images, carousels), Facebook Pages (posts, photos, videos), Bluesky (images, video, facets), TikTok (video), and Mastodon (text, images, video). More platforms are being added regularly.",
  },
  {
    category: "Cross-posting",
    q: "Can I post different content to different platforms?",
    a: "Yes. Socializer lets you tweak the caption per platform before publishing and automatically adapts character limits, aspect ratios, and formats (for example, Instagram Reels vs YouTube Shorts vs TikTok video) so the same upload looks native on every feed.",
  },
  {
    category: "Cross-posting",
    q: "Can I schedule posts in advance?",
    a: "Yes. Every post can be sent immediately or scheduled for a future date and time. Our scheduler runs server-side, so your posts go live on time even if you close the browser — you do not need to leave Socializer open.",
  },
  {
    category: "Cross-posting",
    q: "Can I cross-post videos to TikTok?",
    a: "Yes. Socializer uploads MP4/MOV/WEBM videos up to 4 GB through TikTok's official Content Posting API. While our TikTok app is in the audit queue, videos are uploaded privately (Only Me) and users confirm the public caption inside the TikTok app — a constraint TikTok enforces for every unaudited app.",
  },

  // ── Analytics ──
  {
    category: "Analytics",
    q: "What analytics does Socializer show?",
    a: "A unified dashboard with views, likes, shares, comments, reach, followers and monetization where each platform exposes it — plus a posts-per-day chart and the ability to filter by day, week, month, 3 months, 6 months, year or all-time.",
  },
  {
    category: "Analytics",
    q: "Why are some metrics marked N/A?",
    a: "Some platforms don't expose every metric through their public APIs. For example, YouTube doesn't publish share counts, Bluesky and Mastodon don't track per-post impressions, and Instagram reach requires Meta Business Verification. Socializer shows exactly what is available and tells you why anything is missing.",
  },

  // ── Privacy & security ──
  {
    category: "Privacy & security",
    q: "Is Socializer secure? Do you store my passwords?",
    a: "No. Socializer never sees or stores your passwords. Every platform is connected through its own official OAuth flow, which gives us a short-lived, scoped access token that you can revoke from each platform's settings at any time. All tokens are encrypted at rest.",
  },
  {
    category: "Privacy & security",
    q: "Where is my data stored?",
    a: "Your account and posts are stored in Supabase (PostgreSQL) with row-level security, so each user can only read their own records. Media files are served from Supabase Storage through short-lived signed URLs. The app itself runs on Cloudflare's edge network.",
  },
  {
    category: "Privacy & security",
    q: "Can I delete my account and data?",
    a: "Yes. You can disconnect any platform instantly from the dashboard, and request full account deletion via our data-deletion page. Deletion wipes your profile, scheduled posts, analytics cache, and all stored media.",
  },

  // ── Comparisons ──
  {
    category: "Comparisons",
    q: "How is Socializer different from Buffer, Later, Hootsuite, Publer, or Metricool?",
    a: "Socializer is built by creators for creators: a free starter plan with no cap on connected platforms, neo-brutalist UI that actually feels fun to use, native video uploads to TikTok and YouTube (no manual re-upload), and a single compose box that auto-adapts to each platform's format. Legacy schedulers were built for brands and price that way; Socializer stays lightweight and fast.",
  },
  {
    category: "Comparisons",
    q: "Can Socializer replace my current scheduler?",
    a: "For most creators, yes — especially if your workflow is: film once, publish everywhere. If you depend on deep team workflows (approvals, client billing, multi-seat inboxes) those are on our roadmap but aren't the focus yet.",
  },

  // ── Troubleshooting ──
  {
    category: "Troubleshooting",
    q: "Why did one platform fail while the others succeeded?",
    a: "Socializer posts to each platform in parallel, so a failure on one never blocks the rest. The dashboard shows the exact error returned by the failing platform (token expired, content flagged, video still processing, etc.) so you can reconnect or retry just that one.",
  },
  {
    category: "Troubleshooting",
    q: "A platform says my token expired. What do I do?",
    a: "Open the Dashboard, click Disconnect on that platform, then Connect again. OAuth tokens expire periodically (Facebook and Instagram rotate every 60 days, TikTok every 24 hours), and reconnecting takes about ten seconds.",
  },
];

export default function FAQPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const categories = Array.from(new Set(FAQS.map((f) => f.category)));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 border border-[#0A0A0A] px-3 py-1.5 mb-6 shadow-[2px_2px_0px_0px_#0A0A0A] bg-[#C8FF00]">
            <span className="w-2 h-2 rounded-full bg-[#0A0A0A]" />
            <span className="text-xs font-black uppercase tracking-widest text-[#0A0A0A]">
              Frequently asked
            </span>
          </div>

          <h1
            className="font-black leading-none tracking-tight text-[#0A0A0A] mb-6"
            style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)" }}
          >
            Questions,
            <br />
            <span className="text-[#7C3AED]">answered.</span>
          </h1>

          <p className="text-lg text-[#5C5C5A] max-w-2xl mb-12">
            Everything you wanted to know about Socializer — from connecting
            platforms and scheduling posts to what we do with your data.
          </p>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mb-10">
            {categories.map((c) => (
              <a
                key={c}
                href={`#${c.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                className="px-3 py-1.5 text-xs font-bold border border-[#0A0A0A] bg-[#F9F9F7] shadow-[2px_2px_0px_0px_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#0A0A0A] transition-all text-[#0A0A0A]"
              >
                {c}
              </a>
            ))}
          </div>

          {/* FAQ groups */}
          <div className="space-y-12">
            {categories.map((cat) => (
              <div
                key={cat}
                id={cat.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}
                className="scroll-mt-24"
              >
                <h2 className="text-[10px] font-black uppercase tracking-widest text-[#5C5C5A] mb-4 border-b-2 border-[#0A0A0A] pb-2">
                  {cat}
                </h2>
                <div className="space-y-3">
                  {FAQS.filter((f) => f.category === cat).map((f) => (
                    <details
                      key={f.q}
                      className="group border border-[#0A0A0A] bg-[#F9F9F7] shadow-[4px_4px_0px_0px_#0A0A0A] transition-all open:shadow-[2px_2px_0px_0px_#7C3AED] open:border-[#7C3AED]"
                    >
                      <summary className="cursor-pointer px-4 py-4 flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-[#0A0A0A] list-none">
                        <span className="flex-1">{f.q}</span>
                        <span className="shrink-0 w-6 h-6 flex items-center justify-center border border-[#0A0A0A] text-sm font-black bg-[#F9F9F7] group-open:bg-[#7C3AED] group-open:text-[#F9F9F7] group-open:rotate-45 transition-all">
                          +
                        </span>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-[#5C5C5A] leading-relaxed border-t border-[#0A0A0A]/10 pt-3">
                        {f.a}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Still curious CTA */}
          <div className="mt-20 border-2 border-[#0A0A0A] bg-[#0A0A0A] text-[#F9F9F7] p-8 shadow-[6px_6px_0px_0px_#C8FF00]">
            <h2 className="text-2xl sm:text-3xl font-black mb-2">
              Still have a question?
            </h2>
            <p className="text-[#A0A0A0] mb-6 text-sm">
              The fastest way to get an answer is to try Socializer yourself —
              the product is free and takes less than a minute to connect your
              first platform.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/register"
                className="inline-flex items-center px-5 py-2.5 bg-[#C8FF00] border border-[#C8FF00] text-[#0A0A0A] font-bold text-sm shadow-[3px_3px_0px_0px_#F9F9F7] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#F9F9F7] transition-all"
              >
                Try it free →
              </Link>
              <Link
                href="/"
                className="inline-flex items-center px-5 py-2.5 border border-[#F9F9F7] text-[#F9F9F7] font-bold text-sm hover:bg-[#F9F9F7] hover:text-[#0A0A0A] transition-all"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
