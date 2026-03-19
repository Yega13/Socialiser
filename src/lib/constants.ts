export const SITE_CONFIG = {
  name: "Socializer",
  description: "Cross-post to every platform with one click. Grow your audience everywhere, effortlessly.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ogImage: "/og.png",
  keywords: ["social media", "cross-posting", "content creator", "social media management", "Twitter", "LinkedIn", "Instagram"],
};

export const PLATFORMS = [
  {
    id: "youtube",
    name: "YouTube",
    description: "Upload videos",
    icon: "▶",
    color: "#FF0000",
    comingSoon: false,
  },
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
    comingSoon: false,
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
    id: "tiktok",
    name: "TikTok",
    description: "Short-form video",
    icon: "TK",
    color: "#010101",
    comingSoon: true,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Share posts & stories",
    icon: "fb",
    color: "#1877F2",
    comingSoon: true,
  },
  {
    id: "vk",
    name: "VKontakte",
    description: "Post to VK communities",
    icon: "VK",
    color: "#0077FF",
    comingSoon: true,
  },
] as const;

export type Platform = (typeof PLATFORMS)[number];
