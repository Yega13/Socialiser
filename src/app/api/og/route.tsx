export const runtime = "edge";

export async function GET() {
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0A0A0A"/>
  <text x="60" y="480" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#C8FF00" letter-spacing="3" text-transform="uppercase">CROSS-POSTING MADE EFFORTLESS</text>
  <text x="60" y="540" font-family="system-ui,sans-serif" font-size="80" font-weight="900" fill="#F9F9F7">Socializer</text>
  <text x="60" y="590" font-family="system-ui,sans-serif" font-size="24" fill="#5C5C5A">Cross-post to every platform with one click.</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
