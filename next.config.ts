import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const securityHeaders = [...baseSecurityHeaders];
const meetingEmbedSecurityHeaders = [
  ...baseSecurityHeaders.filter(
    (header) =>
      header.key !== "Cross-Origin-Opener-Policy" &&
      header.key !== "Cross-Origin-Resource-Policy"
  ),
  { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
];
const staticImageCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000",
  },
];

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 7,
    qualities: [70, 75, 100],
  },
  outputFileTracingIncludes: {
    "/api/documents/file": ["./private/dokumenty/**/*"],
    "/api/documents/neon": ["./private/dokumenty/**/*"],
    "/api/admin/data-health": ["./firestore.rules"],
  },
  async headers() {
    return [
      {
        source: "/icons/:path*",
        headers: staticImageCacheHeaders,
      },
      {
        source: "/provize/:path*",
        headers: staticImageCacheHeaders,
      },
      {
        source: "/demos/:path*",
        headers: staticImageCacheHeaders,
      },
      {
        source: "/fonts/:path*",
        headers: staticImageCacheHeaders,
      },
      {
        source: "/ocr/:path*",
        headers: staticImageCacheHeaders,
      },
      {
        source: "/pwa/:path*",
        headers: staticImageCacheHeaders,
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/embed/schuzka/:path*",
        headers: meetingEmbedSecurityHeaders,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
