import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // browsers must not MIME-sniff API JSON into executable content
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // mic is needed by voice capture; camera is not used today
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), payment=(), microphone=(self)",
          },
          // NOTE: no X-Frame-Options / frame-ancestors — the preview embeds
          // the app in a cross-site iframe and must stay embeddable.
        ],
      },
    ];
  },
};

export default nextConfig;
