import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: [
    "tesseract.js",
    "@tesseract.js-data/eng",
    "@tesseract.js-data/rus",
  ],
};

export default nextConfig;
