import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dinego/shared"],
  async redirects() {
    return [
      // Security settings moved onto the profile page.
      {
        source: "/account/security",
        destination: "/account/profile#password",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
