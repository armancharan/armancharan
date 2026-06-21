// Pure origin-allowlist matching for the puzzle Worker.
//
// The Worker gates `/puzzle` (WebSocket) and `/subscribe` on the request Origin.
// Exact-match-only was a foot-gun: every new origin (a dev subdomain, a Vercel
// preview URL like `arman-charan-git-*.vercel.app`) silently 403s the socket,
// which the client can only surface as "could not reach the puzzle". This adds
// single-label subdomain wildcards (e.g. `https://*.armancharan.com`,
// `https://*.vercel.app`) so those origins work without redeploying per URL.
//
// Pure + dependency-free so it runs identically in the Worker and under vitest.

export const parseAllowList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A rule may contain `*`, each standing for exactly one DNS label ([a-z0-9-]+).
// Origins are `scheme://host[:port]` with no path/query, so anchoring the whole
// string is safe against `*` over-matching.
const ruleToRegExp = (rule: string): RegExp =>
  new RegExp(`^${rule.split('*').map(escapeRegExp).join('[a-z0-9-]+')}$`, 'i')

export const isOriginAllowed = (
  origin: string | null | undefined,
  allowList: readonly string[],
): boolean => {
  // Empty allowlist = permissive (dev / tunnel), preserving prior behaviour.
  if (allowList.length === 0) return true
  if (!origin) return false
  return allowList.some(
    rule =>
      rule === '*' ||
      rule === origin ||
      (rule.includes('*') && ruleToRegExp(rule).test(origin)),
  )
}
