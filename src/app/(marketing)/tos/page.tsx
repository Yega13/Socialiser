import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Socializer",
  description: "The terms and conditions governing your use of the Socializer platform.",
};

export default function TermsOfServicePage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0A0A0A]">Terms of Service</h1>
        <p className="text-sm text-[#5C5C5A] mt-2 leading-relaxed">
          Last updated: March 28, 2026. By creating an account or using Socializer in any way,
          you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). Please read them carefully
          before using the service. If you do not agree, do not use Socializer.
        </p>
      </div>

      {/* 1. Acceptance */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">1. Acceptance of Terms</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          These Terms constitute a legally binding agreement between you and Socializer
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By accessing or using Socializer, you confirm that:
        </p>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "You are at least 13 years old (or 16 in the European Union).",
            "You have the legal capacity to enter into a binding agreement.",
            "If acting on behalf of an organisation, you have authority to bind that organisation to these Terms.",
            "You have read and understood these Terms in full.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="font-bold text-[#0A0A0A] shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. About */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">2. About Socializer</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Socializer is a social media management tool that allows you to compose, schedule, and
          cross-post content to third-party platforms including YouTube and Instagram. We connect
          to these platforms via their official public APIs, using OAuth 2.0 — meaning you
          explicitly authorise us to act on your behalf each time you connect a platform.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Socializer is an independent service. We are not affiliated with, endorsed by, or
          sponsored by YouTube, Google, Instagram, Meta, or any other platform we integrate with.
          All third-party platform names and logos are the property of their respective owners.
        </p>
      </section>

      {/* 3. Account */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">3. Account Registration</h2>
        <ul className="space-y-3">
          {[
            {
              title: "Accurate information",
              desc: "You must provide truthful, current, and complete information when registering. Using false identities or providing misleading information is prohibited.",
            },
            {
              title: "Account security",
              desc: "You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. Use a strong, unique password.",
            },
            {
              title: "Unauthorised access",
              desc: "You must notify us immediately at support@socializer.app if you suspect your account has been compromised. We are not liable for losses caused by unauthorised access resulting from your failure to protect your credentials.",
            },
            {
              title: "One account per user",
              desc: "Creating multiple accounts to circumvent bans, limits, or restrictions is prohibited and will result in termination of all associated accounts.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#0A0A0A] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Connected Platforms */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">4. Connecting Third-Party Platforms</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          When you connect a platform (e.g. YouTube, Instagram), you authorise Socializer to
          access your account on that platform and act on your behalf as permitted by the scopes
          you grant. This includes uploading videos, creating posts, and reading any metadata
          required to complete those actions.
        </p>
        <ul className="space-y-3">
          {[
            {
              title: "Platform Terms Compliance",
              desc: "By connecting a platform, you confirm that your use of that platform complies with its own terms of service, community guidelines, and content policies. Socializer cannot be held responsible for platform policy violations caused by your content. You are solely responsible for what you publish.",
            },
            {
              title: "Platform API Changes",
              desc: "Third-party platforms may change, restrict, deprecate, or discontinue their APIs at any time without notice. We make reasonable efforts to adapt, but we cannot guarantee uninterrupted service when external APIs change. Planned posts may fail if a platform withdraws API access.",
            },
            {
              title: "Token Expiry",
              desc: "OAuth tokens issued by platforms expire. Socializer automatically refreshes tokens where possible (e.g. YouTube refresh tokens, Instagram long-lived tokens). If a token cannot be refreshed — for example because you revoked access externally — you will need to reconnect the platform.",
            },
            {
              title: "No Affiliation",
              desc: "Connecting a platform through Socializer does not create any affiliation, partnership, or endorsement between Socializer and that platform. We are an independent tool that uses publicly available APIs.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#0A0A0A] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Acceptable Use */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">5. Acceptable Use</h2>
        <p className="text-sm text-[#5C5C5A]">
          The following activities are strictly prohibited on Socializer:
        </p>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "Posting content that violates our Content Policy (socializer.app/content-policy).",
            "Using Socializer to circumvent platform-specific bans, shadow bans, or rate limits.",
            "Uploading malware, viruses, spyware, or any code designed to harm systems or users.",
            "Attempting to access, modify, or disrupt another user's account or our infrastructure.",
            "Reverse-engineering, decompiling, or extracting source code from the service.",
            "Reselling, sublicensing, or providing API-level access to third parties without written permission.",
            "Automating account creation, bulk sign-ups, or using bots to interact with the service.",
            "Using the service for any purpose that is illegal under applicable law.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="font-bold text-[#FF4F4F] shrink-0">✕</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Violation of these rules may result in immediate account termination without notice
          or refund.
        </p>
      </section>

      {/* 6. Content Ownership */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">6. Your Content & Ownership</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          You retain full ownership of all content you upload to Socializer — posts, captions,
          images, and videos. We make no claim of ownership over your content.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          By uploading content, you grant Socializer a limited, non-exclusive, royalty-free,
          worldwide licence to store, process, and transmit your content solely for the purpose
          of providing the service you requested (i.e. publishing it to the platforms you selected).
          This licence terminates automatically when you delete the content or your account.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          You represent and warrant that you own or have obtained all necessary rights, licences,
          and permissions for every piece of content you upload — and that uploading it does not
          infringe on any third party&apos;s intellectual property, privacy, or other legal rights.
          You are solely liable for content that violates third-party rights.
        </p>
      </section>

      {/* 7. Intellectual Property */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">7. Intellectual Property</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Socializer&apos;s name, logo, product design, user interface, and source code are our
          exclusive intellectual property, protected by applicable copyright, trademark, and trade
          secret laws. You may not copy, reproduce, modify, or distribute any part of the service
          without our prior written consent.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Providing feedback, bug reports, or feature suggestions does not grant you any rights
          over changes we make to the service based on that feedback.
        </p>
      </section>

      {/* 8. Service Availability */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">8. Service Availability & Scheduling</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We aim to keep Socializer available at all times, but we do not provide a Service Level
          Agreement (SLA). The service may be unavailable due to planned maintenance, unexpected
          outages, or events outside our control (e.g. platform API downtime, infrastructure
          failures).
        </p>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "Scheduled posts are executed on a best-effort basis. Exact publish timing may vary by a few minutes due to cron execution cycles.",
            "If a platform API is unavailable at the scheduled time, your post will be marked as failed. You can retry from the Scheduled Posts page.",
            "We are not liable for missed posting windows caused by platform API failures, token expiry, or infrastructure outages.",
            "We reserve the right to modify, limit, suspend, or discontinue any feature of the service at any time, with reasonable notice where practical.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="font-bold text-[#0A0A0A] shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 9. Termination */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">9. Termination</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          <strong className="text-[#0A0A0A]">By you:</strong> You may delete your account at
          any time from the Settings page. Upon deletion, all your data — content, OAuth tokens,
          scheduled posts, and post history — will be permanently removed from our systems within
          30 days. Pending scheduled posts will not be executed after account deletion.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          <strong className="text-[#0A0A0A]">By us:</strong> We may suspend or permanently
          terminate your account without prior notice if you violate these Terms, engage in
          fraudulent or abusive behaviour, or if your account poses a risk to the service or
          other users. Where legally required and practically possible, we will notify you
          by email. Upon termination, your right to use the service ceases immediately.
        </p>
      </section>

      {/* 10. Disclaimers */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">10. Disclaimers</h2>
        <div className="border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]">
          <p className="text-xs text-[#5C5C5A] leading-relaxed">
            <strong className="text-[#0A0A0A]">Socializer is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>
            {" "}without warranties of any kind, whether express or implied, including but not
            limited to implied warranties of merchantability, fitness for a particular purpose,
            title, or non-infringement. We do not warrant that the service will be error-free,
            uninterrupted, secure, or that posts will be published at the exact time scheduled.
            Use of the service is at your own risk.
          </p>
        </div>
      </section>

      {/* 11. Limitation of Liability */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">11. Limitation of Liability</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          To the fullest extent permitted by applicable law, Socializer and its operators,
          employees, and contractors shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages, including but not limited to:
        </p>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "Failed, delayed, or incorrectly timed post publications.",
            "Loss of data, content, reach, followers, or revenue due to platform API failures or changes.",
            "Suspension or termination of your connected platform accounts by those platforms.",
            "Business interruption or reputational damage arising from use of or inability to use the service.",
            "Unauthorised access to your data resulting from third-party breaches outside our control.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="font-bold text-[#0A0A0A] shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Our total cumulative liability to you for any claims arising under these Terms shall
          not exceed the greater of (a) the total amount you paid to Socializer in the 12 months
          preceding the claim, or (b) £50 GBP.
        </p>
      </section>

      {/* 12. Indemnification */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">12. Indemnification</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          You agree to indemnify, defend, and hold harmless Socializer and its operators from
          and against any claims, liabilities, damages, losses, and expenses (including reasonable
          legal fees) arising from: (a) your use of the service, (b) content you publish through
          the service, (c) your violation of these Terms, or (d) your violation of any third-party
          rights including intellectual property or privacy rights.
        </p>
      </section>

      {/* 13. Governing Law */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">13. Governing Law & Disputes</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          These Terms are governed by and construed in accordance with applicable law. We encourage
          resolving any disputes informally first — contact us at{" "}
          <span className="font-bold text-[#0A0A0A]">support@socializer.app</span> and we will
          make every reasonable effort to resolve your concern within 30 days.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          If informal resolution fails, both parties agree to submit to the jurisdiction of the
          appropriate courts for final resolution.
        </p>
      </section>

      {/* 14. Changes */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">14. Changes to These Terms</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We may update these Terms as the service evolves. For material changes — those that
          meaningfully affect your rights or obligations — we will notify you by email and with
          a prominent in-app notice at least 14 days before the change takes effect.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Your continued use of Socializer after the effective date of a change constitutes
          your acceptance of the revised Terms. If you disagree with the updated Terms, you
          may delete your account before the effective date.
        </p>
      </section>

      {/* 15. Contact */}
      <div className="border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]">
        <p className="font-bold text-sm text-[#0A0A0A] mb-1">15. Contact Us</p>
        <p className="text-xs text-[#5C5C5A] leading-relaxed">
          For questions about these Terms, to report a violation, or to exercise any legal rights,
          contact us at{" "}
          <span className="font-bold text-[#0A0A0A]">support@socializer.app</span>.
          We aim to respond within 2 business days.
        </p>
      </div>

    </div>
  );
}
