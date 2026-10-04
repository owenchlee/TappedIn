import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Lets the app also be opened at 127.0.0.1; without it, Next 16 blocks dev scripts from that origin.
  allowedDevOrigins: ["127.0.0.1"],
  // No floating "N" badge in the corner while developing.
  devIndicators: false,
  async redirects() {
    return [
      { source: "/coop", destination: "/jobs", permanent: false },
      { source: "/saved", destination: "/applications", permanent: false },
    ];
  },
};

export default nextConfig;
