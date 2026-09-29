import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      { source: "/coop", destination: "/jobs", permanent: false },
      { source: "/saved", destination: "/applications", permanent: false },
    ];
  },
};

export default nextConfig;
