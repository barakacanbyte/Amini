import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Keep AWS SDK on Node’s resolver (avoids rare webpack middleware issues on the server). */
  serverExternalPackages: ["@aws-sdk/client-s3"],
  reactStrictMode: true,
  /**
   * Next 16 forwards browser console.warn/error to the terminal by default. CDP embedded wallet
   * and React dev overlays can emit very large serialized stacks — disable forwarding for a quiet dev shell.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/logging
   */
  logging: {
    browserToTerminal: false,
  },
  /** Reduces dev-only UI that may POST diagnostics (can conflict with strict fetch header rules). */
  devIndicators: false,
  transpilePackages: ["@amini/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      /* Profile/org avatars and campaign art from Filebase IPFS (next/image requires allow-list). */
      {
        protocol: "https",
        hostname: "ipfs.filebase.io",
        pathname: "/ipfs/**",
      },
      {
        protocol: "https",
        hostname: "**.myfilebase.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
