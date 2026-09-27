import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OAuth discovery documents for the Claude connector live at fixed /.well-known/ addresses.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/authorization-server" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/authorization-server" },
    ];
  },
};

export default nextConfig;
