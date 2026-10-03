import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Open the app at 127.0.0.1, because localhost:3000 has another project's service worker. Without
  // this, Next 16 blocks dev scripts from that origin and pages load without any client JS.
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      { source: "/coop", destination: "/jobs", permanent: false },
      { source: "/saved", destination: "/applications", permanent: false },
    ];
  },
};

export default nextConfig;
