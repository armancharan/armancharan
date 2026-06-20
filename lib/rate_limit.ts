// Minimal in-memory sliding-window rate limiter. Note: serverless instances are
// per-isolate, so this is a best-effort first line of defence, not a global
// guarantee. Durable limits move to Cloudflare (KV/Durable Objects) at migration.

type Hit = number[]
const buckets = new Map<string, Hit>()

export const rateLimit = (
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { ok: boolean; remaining: number } => {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return { ok: false, remaining: 0 }
  }
  hits.push(now)
  buckets.set(key, hits)
  return { ok: true, remaining: limit - hits.length }
}
