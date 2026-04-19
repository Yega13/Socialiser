import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { CTA } from "@/components/marketing/cta";
import { FAQTeaser } from "@/components/marketing/faq-teaser";
import { SITE_CONFIG } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SITE_CONFIG.name} — Cross-post to every platform`,
  description: SITE_CONFIG.description,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_CONFIG.name,
  description: SITE_CONFIG.description,
  url: SITE_CONFIG.url,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <Features />
      <CTA />
      <FAQTeaser />
    </>
  );
}
