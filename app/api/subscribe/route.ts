import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate_limit'
import { consumeSolveToken } from '../../../lib/solve_token'
import { addSubscriber } from '../../../lib/subscribers'
import { verifyTurnstile } from '../../../lib/turnstile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Body = {
  email?: string
  website?: string // honeypot: real users never fill this
  turnstileToken?: string
  solveToken?: string // minted by the puzzle Durable Object on a real solve
}

const bad = (reason: string, status = 400) =>
  NextResponse.json({ ok: false, reason }, { status })

export const POST = async (req: NextRequest) => {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  if (!rateLimit(`subscribe:${ip}`, { limit: 5, windowMs: 60_000 }).ok) {
    return bad('rate_limited', 429)
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return bad('invalid_json')
  }

  // Honeypot: silently accept-looking but reject bots that fill the hidden field.
  if (body.website) return bad('rejected')

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL.test(email)) return bad('invalid_email')

  const turnstile = await verifyTurnstile(body.turnstileToken, ip)
  if (!turnstile.ok) return bad(`turnstile_${turnstile.reason}`)

  // Consume the solve token last so a failed Turnstile doesn't waste a real
  // solve. This both verifies the HMAC and burns the token against replay.
  const puzzle = consumeSolveToken(body.solveToken)
  if (!puzzle.ok) return bad(`puzzle_${puzzle.reason}`)

  try {
    const result = await addSubscriber(email, {
      source: 'agentic-engineering-101',
      userAgent: req.headers.get('user-agent') ?? undefined,
    })
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate ?? false,
      backend: result.backend,
      turnstile: turnstile.configured ? 'verified' : 'skipped',
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: 'storage_error', detail: String(err) },
      { status: 502 },
    )
  }
}
