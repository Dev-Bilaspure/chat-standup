import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@chat-notes/core"],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
