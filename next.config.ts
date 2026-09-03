import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jjnmkhpqrmnnaqxhyfcy.supabase.co',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: 'sakilu-blog.s3.ap-northeast-1.amazonaws.com',
        pathname: '/s3Image/**',
      },
    ],
  },
};

export default nextConfig;
