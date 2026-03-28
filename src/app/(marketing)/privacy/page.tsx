import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Socializer",
  description: "How Socializer collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0A0A0A]">Privacy Policy</h1>
        <p className="text-sm text-[#5C5C5A] mt-2 leading-relaxed">
          Last updated: March 28, 2026. This policy explains how Socializer (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
          collects, uses, and protects your personal data when you use our service. We believe
          privacy should be simple and honest — so this document is written in plain language.
        </p>
      </div>

      {/* 1. What We Collect */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">1. Information We Collect</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We collect only what is strictly necessary to provide the Socializer service.
        </p>
        <ul className="space-y-3">
          {[
            {
              title: "Account Data",
              desc: "Your email address and an encrypted hash of your password, provided when you register. We use Supabase for authentication — your password is hashed with bcrypt and never stored in plain text. We never see your raw password.",
            },
            {
              title: "Connected Platform Credentials",
              desc: "When you connect YouTube, Instagram, or another platform, we store the OAuth access token (and refresh token where applicable) issued by that platform. These credentials authorise us to post on your behalf. We never store your social media password — only the API tokens you explicitly grant us.",
            },
            {
              title: "Your Content",
              desc: "Post titles, captions, descriptions, images, and videos you upload to schedule or publish. Media files are stored in Supabase Storage, associated exclusively with your account, and are never shared with other users or third parties.",
            },
            {
              title: "Scheduled Post Data",
              desc: "The platforms you select, the scheduled time, post settings (aspect ratio, filters, post type), and the result of each post (success or failure). This forms your post history.",
            },
            {
              title: "Usage & Technical Data",
              desc: "Basic usage signals such as which platforms you have connected and when posts are published. We also receive standard server logs (IP address, browser type, device type) through Cloudflare Workers, our infrastructure provider.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#7C3AED] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. How We Use Data */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">2. How We Use Your Information</h2>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "To authenticate you and maintain your session securely.",
            "To connect to YouTube, Instagram, and other platforms using the credentials you authorize, and to post content on your behalf.",
            "To store, schedule, and publish your content to the platforms you select, at the time you choose.",
            "To send transactional emails you need (e.g. email verification, password reset). We never send marketing emails without your explicit consent.",
            "To detect and respond to errors, service failures, and security incidents.",
            "To improve the reliability and performance of the scheduling system.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[#7C3AED] font-bold shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]">
          <p className="text-xs font-bold text-[#0A0A0A] mb-1">What we never do</p>
          <p className="text-xs text-[#5C5C5A] leading-relaxed">
            We do not sell your personal data. We do not use your data for advertising.
            We do not build profiles about you for third-party commercial purposes.
            We do not share your content with any third party beyond what is required to
            deliver the service (i.e. transmitting your content to YouTube or Instagram when you publish).
          </p>
        </div>
      </section>

      {/* 3. Google API / YouTube */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">3. Google API Services & YouTube Data</h2>

        <div className="border border-[#7C3AED] p-4 shadow-[4px_4px_0px_0px_#7C3AED]">
          <p className="text-xs font-bold text-[#0A0A0A] mb-1">Limited Use Disclosure</p>
          <p className="text-xs text-[#5C5C5A] leading-relaxed">
            Socializer&apos;s use and transfer to any other app of information received from Google APIs
            will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[#7C3AED] font-medium"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>

        <ul className="space-y-3">
          {[
            {
              title: "What Google data we access",
              desc: "When you connect YouTube, we request the youtube.upload OAuth scope, which allows Socializer to upload videos to your YouTube channel on your behalf. We do not access your YouTube watch history, subscriptions, comments, playlists, or any other data. Our access is strictly limited to the upload permission you grant.",
            },
            {
              title: "How we store Google credentials",
              desc: "We store your Google OAuth refresh token in our database (hosted by Supabase) to maintain access between sessions without requiring you to re-authenticate every hour. Access tokens are short-lived (1 hour) and are refreshed automatically when needed. Refresh tokens are stored with row-level security — only accessible to your account.",
            },
            {
              title: "How Google data is used",
              desc: "Google user data (OAuth tokens and any YouTube API responses) is used exclusively to upload the videos you submit through Socializer to your YouTube channel. It is not used for any secondary purpose, not used for advertising, and not shared with any third party.",
            },
            {
              title: "Revoking access",
              desc: "You can disconnect YouTube at any time from the Settings page inside Socializer — this immediately deletes your stored Google tokens from our database. You can also revoke access directly from your Google account at myaccount.google.com/permissions. Both methods immediately prevent Socializer from accessing your YouTube account.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#7C3AED] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Instagram */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">4. Instagram & Meta API Data</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          When you connect Instagram, we request permissions to publish content on your behalf
          via the Instagram Graph API. We store your Instagram long-lived access token to enable
          scheduling and posting across sessions. We access only the permissions required to
          create and publish posts, reels, carousels, and stories — we do not read your direct
          messages, follower list, or any other account data.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Instagram access tokens expire after approximately 60 days. Socializer automatically
          refreshes them before expiry. You can disconnect Instagram at any time from the Settings
          page, which immediately deletes your stored token.
        </p>
      </section>

      {/* 5. Third Parties */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">5. Third-Party Services We Use</h2>
        <p className="text-sm text-[#5C5C5A]">
          To operate Socializer, we rely on the following third-party services. Each has its own
          privacy policy governing how they handle data:
        </p>
        <ul className="space-y-3">
          {[
            {
              title: "Supabase",
              desc: "Provides our database (PostgreSQL), user authentication, and file storage. Your account data, OAuth tokens, scheduled posts, and uploaded media files are stored on Supabase infrastructure. Supabase is SOC 2 Type II compliant and uses encryption at rest and in transit.",
            },
            {
              title: "Cloudflare Workers",
              desc: "Hosts and runs our application at the edge globally. Cloudflare handles all HTTP requests and processes basic request metadata (IP address, geolocation, device type). Cloudflare does not have access to your account data or content.",
            },
            {
              title: "Google / YouTube",
              desc: "Used when you connect your YouTube account. Your use of the YouTube connection is also subject to Google's Privacy Policy and YouTube's Terms of Service.",
            },
            {
              title: "Meta / Instagram",
              desc: "Used when you connect your Instagram account. Your use of the Instagram connection is also subject to Meta's Privacy Policy and Instagram's Terms of Use.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#7C3AED] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 6. Security */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">6. Data Storage & Security</h2>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "All data is transmitted over HTTPS. We do not serve any content over unencrypted HTTP.",
            "Passwords are hashed with bcrypt and are never stored or transmitted in plain text.",
            "OAuth tokens are stored in a PostgreSQL database with row-level security (RLS) policies — only you can access your own tokens, even at the database level.",
            "We never store your social media passwords — only the API tokens issued by each platform after you grant permission.",
            "Uploaded media files are stored in private Supabase Storage buckets. Files are not publicly accessible by URL without a signed, time-limited token.",
            "Access to our production infrastructure is restricted to authorised personnel only.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[#7C3AED] font-bold shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          While we take security seriously and follow industry best practices, no system is
          completely immune to breaches. In the event of a security incident affecting your
          personal data, we will notify you as required by applicable law.
        </p>
      </section>

      {/* 7. Retention */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">7. Data Retention</h2>
        <ul className="space-y-3">
          {[
            {
              title: "Account data",
              desc: "Retained for as long as your account exists. Permanently deleted within 30 days of account deletion.",
            },
            {
              title: "OAuth tokens",
              desc: "Retained until you disconnect the platform, delete your account, or the token is revoked by the platform. Revocation is immediate on disconnect.",
            },
            {
              title: "Uploaded media files",
              desc: "Retained as long as the associated scheduled post exists. You can delete media and posts at any time from the dashboard. Deleted files are removed from storage within 30 days.",
            },
            {
              title: "Post history",
              desc: "Records of published posts (title, platforms, result, timestamp) are retained until you delete them or your account. They are never shared or sold externally.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#7C3AED] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 8. Your Rights */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">8. Your Rights</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Depending on your location, you may have legal rights regarding your personal data.
          We honour the following rights for all users regardless of jurisdiction:
        </p>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          {[
            "Access — request a copy of the personal data we hold about you.",
            "Rectification — correct inaccurate data we hold about you.",
            "Erasure — request deletion of your account and all associated personal data.",
            "Portability — receive your post history and account data in a structured, machine-readable format.",
            "Objection — object to certain types of processing.",
            "Withdraw consent — disconnect any connected platform at any time, which immediately stops all related processing.",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-[#7C3AED] font-bold shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          To exercise any of these rights, email us at{" "}
          <span className="font-bold text-[#0A0A0A]">support@socializer.app</span>.
          We will respond within 30 days. If you are in the EU/EEA and believe we have not
          addressed your concern, you have the right to lodge a complaint with your local
          data protection authority.
        </p>
      </section>

      {/* 9. Cookies */}
      <section className="space-y-3">
        <h2 className="text-xl font-black text-[#0A0A0A]">9. Cookies & Local Storage</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We use <strong className="text-[#0A0A0A]">essential session cookies</strong> to keep
          you authenticated. These are strictly necessary for the service to function and cannot
          be disabled without logging out.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We use browser <strong className="text-[#0A0A0A]">localStorage</strong> to remember
          your theme preference (light or dark mode). This data never leaves your device and is
          not transmitted to our servers.
        </p>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We do <strong className="text-[#0A0A0A]">not</strong> use advertising cookies,
          third-party tracking pixels, analytics cookies, or any cookie that shares your data
          with advertisers.
        </p>
      </section>

      {/* 10. Children */}
      <section className="space-y-2">
        <h2 className="text-xl font-black text-[#0A0A0A]">10. Children&apos;s Privacy</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          Socializer is not directed to children under the age of 13 (or 16 in the European Union).
          We do not knowingly collect personal data from children. If we discover that a child has
          created an account or submitted personal data, we will delete it immediately.
          If you believe a child is using our service, please contact us at{" "}
          <span className="font-bold text-[#0A0A0A]">support@socializer.app</span>.
        </p>
      </section>

      {/* 11. Changes */}
      <section className="space-y-2">
        <h2 className="text-xl font-black text-[#0A0A0A]">11. Changes to This Policy</h2>
        <p className="text-sm text-[#5C5C5A] leading-relaxed">
          We may update this Privacy Policy as the service evolves. For significant changes —
          such as collecting new categories of data or changing how we use existing data — we
          will notify you by email and with a prominent in-app notice at least 7 days before
          the change takes effect. Minor changes (typos, clarifications) will be updated without
          notice. The &ldquo;Last updated&rdquo; date at the top reflects the most recent revision.
        </p>
      </section>

      {/* 12. Contact */}
      <div className="border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]">
        <p className="font-bold text-sm text-[#0A0A0A] mb-1">12. Contact Us</p>
        <p className="text-xs text-[#5C5C5A] leading-relaxed">
          For any privacy-related questions, data requests, or to report a concern, contact us
          at{" "}
          <span className="font-bold text-[#0A0A0A]">support@socializer.app</span>.
          We aim to respond within 2 business days.
        </p>
      </div>

    </div>
  );
}
