import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Content Policy — Socializer",
  description: "What you can and cannot post using Socializer.",
};

export default function ContentPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0A0A0A]">Content Policy</h1>
        <p className="text-[#5C5C5A] mt-2">
          Last updated: March 2026. By using Socializer you agree to follow these rules.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">Prohibited Content</h2>
        <p className="text-sm text-[#5C5C5A]">
          You may not use Socializer to create, store, or distribute any of the following:
        </p>
        <ul className="space-y-3">
          {[
            {
              title: "Violence & Terrorism",
              desc: "Content that promotes, glorifies, or incites violence, terrorist acts, or violent extremism. This includes threats of physical harm, graphic depictions of violence intended to shock, and recruitment material for violent organizations.",
            },
            {
              title: "Sexual & Explicit Material",
              desc: "Pornography, sexually explicit imagery, non-consensual intimate content, or sexual exploitation of minors (CSAM). Any content sexualizing minors will be reported to the relevant authorities.",
            },
            {
              title: "Hate Speech & Discrimination",
              desc: "Content that attacks, demeans, or incites hatred against individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or national origin.",
            },
            {
              title: "Harassment & Bullying",
              desc: "Targeted harassment, doxxing (sharing private information), threats, intimidation, or content designed to humiliate or harm specific individuals.",
            },
            {
              title: "Self-Harm & Dangerous Activities",
              desc: "Content that promotes, encourages, or provides instructions for self-harm, suicide, eating disorders, or dangerous challenges that could lead to physical injury.",
            },
            {
              title: "Illegal Activities",
              desc: "Content promoting illegal drug sales, weapons trafficking, fraud, scams, money laundering, or any other illegal activities under applicable law.",
            },
            {
              title: "Spam & Misleading Content",
              desc: "Artificially generated engagement, misleading clickbait, deceptive practices, impersonation, or coordinated inauthentic behavior. This includes spreading deliberate misinformation about health, elections, or emergencies.",
            },
            {
              title: "Intellectual Property Violations",
              desc: "Content that infringes on copyrights, trademarks, or other intellectual property rights of third parties without proper authorization or fair use justification.",
            },
            {
              title: "Privacy Violations",
              desc: "Sharing personal, confidential, or sensitive information of others without their consent, including but not limited to financial data, medical records, or private communications.",
            },
          ].map((item) => (
            <li key={item.title} className="border-l-4 border-[#FF4F4F] pl-4">
              <div className="font-bold text-sm text-[#0A0A0A]">{item.title}</div>
              <p className="text-xs text-[#5C5C5A] mt-0.5 leading-relaxed">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">Your Responsibilities</h2>
        <ul className="space-y-2 text-sm text-[#5C5C5A]">
          <li className="flex gap-2"><span className="text-[#C8FF00] font-bold shrink-0">+</span> You are solely responsible for the content you publish through Socializer.</li>
          <li className="flex gap-2"><span className="text-[#C8FF00] font-bold shrink-0">+</span> You must comply with each platform&apos;s own community guidelines in addition to this policy.</li>
          <li className="flex gap-2"><span className="text-[#C8FF00] font-bold shrink-0">+</span> You must have the rights or permissions to post any content you upload.</li>
          <li className="flex gap-2"><span className="text-[#C8FF00] font-bold shrink-0">+</span> You must not use Socializer to circumvent platform-specific bans or restrictions.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#0A0A0A]">Enforcement</h2>
        <div className="text-sm text-[#5C5C5A] space-y-2">
          <p>
            Violations of this policy may result in:
          </p>
          <ul className="space-y-1 ml-4">
            <li className="flex gap-2"><span className="text-[#FF4F4F] font-bold">1.</span> Content removal</li>
            <li className="flex gap-2"><span className="text-[#FF4F4F] font-bold">2.</span> Temporary account suspension</li>
            <li className="flex gap-2"><span className="text-[#FF4F4F] font-bold">3.</span> Permanent account termination</li>
            <li className="flex gap-2"><span className="text-[#FF4F4F] font-bold">4.</span> Reporting to law enforcement where required by law</li>
          </ul>
        </div>
      </section>

      <div className="border border-[#0A0A0A] p-4 shadow-[4px_4px_0px_0px_#0A0A0A]">
        <p className="text-xs text-[#5C5C5A]">
          If you encounter content that violates this policy, contact us at{" "}
          <span className="font-bold text-[#0A0A0A]">support@socializer.app</span>.
          We review reports and take action as quickly as possible.
        </p>
      </div>
    </div>
  );
}
