/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json" },
  serverExternalPackages: ["nodemailer"],
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.env*", "./.git/**/*", "./tests/**/*", "./docs/**/*", "./scripts/**/*"],
  },
  webpack(config) {
    if (process.env.DISABLE_BUILD_CACHE === "true") config.cache = false;
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
