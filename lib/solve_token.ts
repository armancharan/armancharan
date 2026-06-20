import { createHmac, timingSafeEqual } from 'crypto'

// Verifies the HMAC solve token minted by the puzzle Durable Object. The Worker
// signs `base64url(payload)` with PUZZLE_SECRET; we recompute and compare. The
// token only asserts "a puzzle was solved recently" — it carries no PII and is
// short-lived, so a leaked token is low value and expires fast.

const TTL_MS = 3 * 60 * 1000 // a solved puzzle is good for 3 minutes

const secret = () => process.env.PUZZLE_SECRET ?? 'dev-only-insecure-puzzle-secret'

export type SolveTokenResult = { ok: boolean; reason?: string }

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// Best-effort single-use guard. Like the rate limiter this is per-isolate, so it
// is a first line of defence (paired with Turnstile + rate limit), not a global
// guarantee — durable single-use moves to D1/KV at migration.
const usedJti = new Map<string, number>()
const markUsed = (jti: string, expiresAt: number) => {
  const now = Date.now()
  usedJti.forEach((exp, k) => {
    if (exp < now) usedJti.delete(k)
  })
  usedJti.set(jti, expiresAt)
}

// Verifies a solve token AND consumes it (rejecting replays). Call exactly once
// per submission.
export const consumeSolveToken = (token: string | undefined): SolveTokenResult => {
  if (!token) return { ok: false, reason: 'missing' }

  const [p, sig] = token.split('.')
  if (!p || !sig) return { ok: false, reason: 'malformed' }

  const expected = createHmac('sha256', secret()).update(p).digest('base64url')
  if (!safeEqual(sig, expected)) return { ok: false, reason: 'bad_sig' }

  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as {
      v?: number
      iat?: number
      jti?: string
    }
    if (payload.v !== 1) return { ok: false, reason: 'bad_version' }
    if (typeof payload.iat !== 'number') return { ok: false, reason: 'bad_iat' }
    if (typeof payload.jti !== 'string') return { ok: false, reason: 'bad_jti' }
    if (Date.now() - payload.iat > TTL_MS) return { ok: false, reason: 'expired' }
    if (usedJti.has(payload.jti)) return { ok: false, reason: 'replay' }
    markUsed(payload.jti, payload.iat + TTL_MS)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
}
