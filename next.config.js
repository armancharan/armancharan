// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
 const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['s3.us-west-2.amazonaws.com'],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
  },
  webpack: (config, { dev }) => {
    // The on-disk webpack cache keeps corrupting in this dev setup
    // ("invalid stored block lengths" / malformed manifest -> 500s). Use the
    // in-memory cache in dev to avoid it; production builds are unaffected.
    if (dev) config.cache = { type: 'memory' }
    return config
  },
}

module.exports = nextConfig
