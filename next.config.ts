import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: ['**/*'], 
      };
    }
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // @ts-ignore
    allowedDevOrigins: ["192.168.1.11", "192.168.1.5", "192.168.1.102", "192.168.1.14"],
  },
};

export default nextConfig;
