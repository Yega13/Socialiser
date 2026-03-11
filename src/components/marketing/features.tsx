const features = [
  {
    icon: "⚡",
    title: "One-click cross-posting",
    description: "Write once and publish to all your connected platforms instantly.",
  },
  {
    icon: "🎯",
    title: "Platform-native formatting",
    description: "Auto-adapts your content for each platform's character limits and formats.",
  },
  {
    icon: "📊",
    title: "Unified analytics",
    description: "Track engagement across all platforms in a single dashboard.",
  },
  {
    icon: "🗓",
    title: "Smart scheduling",
    description: "Queue posts to go live at the best time for each audience.",
  },
  {
    icon: "🤖",
    title: "AI rewriting",
    description: "Let AI adapt your post tone for LinkedIn vs Twitter vs Instagram.",
  },
  {
    icon: "🔒",
    title: "Secure OAuth",
    description: "We never store passwords. Platforms are linked via secure OAuth tokens.",
  },
];

export function Features() {
  return (
    <section className="py-20 px-4 bg-[#0A0A0A]">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-black text-[#F9F9F7] mb-12">
          Everything you need to
          <br />
          <span className="text-[#C8FF00]">dominate every feed.</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-5 border border-[#2A2A28] bg-[#0A0A0A] hover:border-[#C8FF00] transition-colors group"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-[#F9F9F7] mb-1 group-hover:text-[#C8FF00] transition-colors">
                {f.title}
              </h3>
              <p className="text-sm text-[#5C5C5A] leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
