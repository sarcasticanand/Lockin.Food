import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Google Fonts in next/font
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
