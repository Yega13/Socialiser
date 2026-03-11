import { ImageResponse } from "next/og";
import { SITE_CONFIG } from "@/lib/constants";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "60px",
          background: "#0A0A0A",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#C8FF00",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            marginBottom: "16px",
          }}
        >
          Cross-posting made effortless
        </div>
        <div
          style={{
            fontSize: "80px",
            fontWeight: 900,
            color: "#F9F9F7",
            lineHeight: 1,
            marginBottom: "24px",
          }}
        >
          {SITE_CONFIG.name}
        </div>
        <div
          style={{
            fontSize: "24px",
            color: "#5C5C5A",
            maxWidth: "700px",
          }}
        >
          {SITE_CONFIG.description}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
