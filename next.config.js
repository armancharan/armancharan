// @ts-check

// Baseline Content-Security-Policy. Kept deliberately conservative but functional:
//   - 'unsafe-inline' on script-src/style-src is required because the Next App
//     Router emits inline bootstrap/streaming scripts and Tailwind/Next inject
//     inline styles, and no nonce pipeline is wired up. (A nonce + 'strict-dynamic'
//     setup via middleware would let us drop 'unsafe-inline' later.)
//   - va.vercel-scripts.com + 'self' (/_vercel/insights) cover Vercel Analytics.
//   - the puzzle Worker is allowed over wss/https in connect-src.
//   - Turnstile's api.js (script) and challenge iframe (frame) are allowed.
//   - images come from this origin (incl. the /_next/image optimizer, data: blur
//     placeholders) and the S3 bucket behind remotePatterns.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://s3.us-west-2.amazonaws.com",
  "font-src 'self' data:",
  "connect-src 'self' https://arman-puzzle.armancharan.workers.dev wss://arman-puzzle.armancharan.workers.dev https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "frame-src https://challenges.cloudflare.com",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's3.us-west-2.amazonaws.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

module.exports = nextConfig
