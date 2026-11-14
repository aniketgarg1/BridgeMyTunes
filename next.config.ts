import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify only accepts loopback IPs (not "localhost") as dev redirect URIs,
  // so local dev runs on http://127.0.0.1:3000. Allow that origin for dev assets.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["mongodb", "pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "*.mzstatic.com" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
      { protocol: "https", hostname: "image-cdn-ak.spotifycdn.com" },
      { protocol: "https", hostname: "image-cdn-fa.spotifycdn.com" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
