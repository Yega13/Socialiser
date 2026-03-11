import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@node-rs/**/*.node"],
  },
};

export default nextConfig;
