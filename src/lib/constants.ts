export const SITE_CONFIG = {
  name: "Socializer",
  description: "Cross-post to every platform with one click. Grow your audience everywhere, effortlessly.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ogImage: "/og.png",
  keywords: ["social media", "cross-posting", "content creator", "social media management", "Twitter", "LinkedIn", "Instagram"],
};

export const PLATFORMS = [
  {
    id: "twitter",
    name: "X / Twitter",
    description: "Post threads & updates",
    icon: "𝕏",
    color: "#000000",
    comingSoon: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Share professional content",
    icon: "in",
    color: "#0A66C2",
    comingSoon: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Publish photos & reels",
    icon: "IG",
    color: "#E1306C",
    comingSoon: true,
  },
  {
    id: "threads",
    name: "Threads",
    description: "Join the conversation",
    icon: "@",
    color: "#000000",
    comingSoon: true,
  },
  {
    id: "bluesky",
    name: "Bluesky",
    description: "Decentralized social",
    icon: "🦋",
    color: "#0085FF",
    comingSoon: true,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Short-form video",
    icon: "TK",
    color: "#010101",
    comingSoon: true,
  },
] as const;

export type Platform = (typeof PLATFORMS)[number];
