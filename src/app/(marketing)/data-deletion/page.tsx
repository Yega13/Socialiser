import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion — Socializer",
  description: "How to delete your Socializer account and all associated data.",
};

export default function DataDeletionPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0A0A0A]">Data Deletion</h1>
        <p className="text-[#5C5C5A] mt-2">
          How to delete your Socializer account and all data associated with it, including any data
          obtained through Facebook, Instagram, Threads, YouTube, or Bluesky integrations.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">Delete in-app (recommended)</h2>
        <ol className="space-y-3 text-sm text-[#5C5C5A] list-decimal pl-5">
          <li>
            Log in to <a href="/login" className="font-bold text-[#7C3AED] underline">Socializer</a>.
          </li>
          <li>
            Go to <strong>Settings</strong> &rarr; <strong>Connected Platforms</strong>.
          </li>
          <li>
            Click <strong>Disconnect</strong> next to each platform (Facebook, Instagram, Threads,
            YouTube, Bluesky). This immediately revokes Socializer&apos;s access tokens for that
            platform and deletes the stored token from our database.
          </li>
          <li>
            Go to <strong>Settings</strong> &rarr; <strong>Account</strong> &rarr;{" "}
            <strong>Delete Account</strong>. This permanently removes your user record, all
            scheduled posts, all uploaded media, and all platform connection records.
          </li>
        </ol>
      </section>

      <section className="space-y-4 border border-[#0A0A0A] p-5 shadow-[4px_4px_0px_0px_#0A0A0A]">
        <h2 className="text-xl font-black text-[#0A0A0A]">Email request</h2>
        <p className="text-sm text-[#5C5C5A]">
          If you cannot access your account or prefer to request deletion by email, contact us at
          {" "}<a href="mailto:support@socializer.app" className="font-bold text-[#7C3AED] underline">support@socializer.app</a>{" "}
          with the subject line <strong>&quot;Data Deletion Request&quot;</strong> and include the
          email address associated with your Socializer account. We will confirm receipt within 48
          hours and complete deletion within 30 days, as required by GDPR and CCPA.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">What gets deleted</h2>
        <ul className="space-y-2 text-sm text-[#5C5C5A] list-disc pl-5">
          <li>Your user account (email, password hash, profile data)</li>
          <li>All access tokens and refresh tokens for connected platforms</li>
          <li>All scheduled posts and post history records</li>
          <li>All uploaded media files (images, videos, thumbnails)</li>
          <li>All Facebook Page tokens and Page metadata Socializer cached</li>
          <li>All Instagram Business Account tokens and account IDs</li>
          <li>All Threads tokens and user IDs</li>
          <li>All YouTube refresh tokens and channel data</li>
          <li>All Bluesky session tokens and DIDs</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">What is NOT deleted</h2>
        <ul className="space-y-2 text-sm text-[#5C5C5A] list-disc pl-5">
          <li>
            Posts already published to Facebook, Instagram, Threads, YouTube, or Bluesky &mdash;
            these belong to your account on the destination platform. Delete them directly there.
          </li>
          <li>
            Anonymized aggregate analytics (e.g. &quot;total posts published&quot; without any
            personally identifiable information) may be retained for service-improvement purposes.
          </li>
          <li>
            Records we are legally required to retain (e.g. transaction logs for tax compliance, if
            applicable) for the period required by law, then deleted.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">Revoking access from Meta</h2>
        <p className="text-sm text-[#5C5C5A]">
          You can also revoke Socializer&apos;s access from Meta directly:
        </p>
        <ul className="space-y-2 text-sm text-[#5C5C5A] list-disc pl-5">
          <li>
            Facebook: <strong>Settings &amp; Privacy</strong> &rarr; <strong>Settings</strong> &rarr;{" "}
            <strong>Apps and Websites</strong> &rarr; remove <em>Socializer</em>.
          </li>
          <li>
            Instagram: <strong>Settings</strong> &rarr; <strong>Apps and Websites</strong> &rarr;
            revoke <em>Socializer</em>.
          </li>
          <li>
            Threads: <strong>Account</strong> &rarr; <strong>Other apps with access</strong> &rarr;
            revoke <em>Socializer</em>.
          </li>
        </ul>
        <p className="text-sm text-[#5C5C5A]">
          Revoking from Meta only invalidates the tokens; it does not delete data Socializer has
          already stored. To delete that data, also follow the in-app or email steps above.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-black text-[#0A0A0A]">Questions</h2>
        <p className="text-sm text-[#5C5C5A]">
          Email <a href="mailto:support@socializer.app" className="font-bold text-[#7C3AED] underline">support@socializer.app</a>.
        </p>
      </section>
    </div>
  );
}
