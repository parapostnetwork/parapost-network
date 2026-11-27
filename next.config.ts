import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/creatorverse/*/posts/*/media/*/verify': [
      './vendor/creatorverse-video/ffmpeg',
      './vendor/creatorverse-video/ffprobe',
      './vendor/creatorverse-video/lib/**/*',
    ],
  },
  allowedDevOrigins: ["192.168.2.16"],
};

export default nextConfig;
