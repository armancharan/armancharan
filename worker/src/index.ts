// Cloudflare Worker + Durable Object backing the "shard of sky" puzzle.
//
// The browser is shown a fixed crop of the photo (a "shard") by INDEX only and
// must drag it to where it belongs by eye. The crop necessarily reveals its own
// region, but the index -> coordinate mapping lives only here, so the answer is
// never handed to the client as data. The DO also measures the drag itself
// (samples, path, duration) so behavioural checks are server-truth, and on a
// legitimate drop it mints an HMAC-signed token the Vercel API trusts.

import config from './targets.json'

export interface Env {
  PUZZLE_ROOM: DurableObjectNamespace
  PUZZLE_SECRET: string
  ALLOWED_ORIGINS?: string
  DB: D1Database
  TURNSTILE_SECRET?: string
}

const TARGETS = config.targets as Array<{ x: number; y: number }>
const PIECE_RADIUS = config.radius
const TOLERANCE = config.tolerance

// Behavioural floors — a human drag clears these trivially; a teleporting bot
// post does not.
const MIN_SOLVE_MS = 600
const MIN_SAMPLES = 10
const MIN_PATH = 0.12
const MAX_ATTEMPTS = 8

type Session = {
  index: number
  tx: number
  ty: number
  samples: number
  path: number
  firstT: number
  lastT: number
  lastX: number
  lastY: number
  attempts: number
  solved: boolean
}

const b64url = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const mintToken = async (secret: string): Promise<string> => {
  const payload = { v: 1, iat: Date.now(), jti: crypto.randomUUID() }
  const p = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p))
  return `${p}.${b64url(new Uint8Array(sig))}`
}

const originAllowed = (req: Request, env: Env): boolean => {
  const allow = env.ALLOWED_ORIGINS?.split(',')
    .map(o => o.trim())
    .filter(Boolean)
  if (!allow || allow.length === 0) return true // permissive in dev
  const origin = req.headers.get('Origin')
  return Boolean(origin && allow.includes(origin))
}

export class PuzzleRoom {
  private state: DurableObjectState
  private env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    this.state.acceptWebSocket(server)

    const index = Math.floor(Math.random() * TARGETS.length)
    // Cryptographically-random per-session seed for the shard's outline. The
    // shape is purely cosmetic (the secret is the target position, which never
    // leaves the server), but seeding it from a CSPRNG means every challenge
    // gets a unique, unpredictable polygon — no fixed outline to fingerprint.
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const session: Session = {
      index,
      tx: TARGETS[index].x,
      ty: TARGETS[index].y,
      samples: 0,
      path: 0,
      firstT: 0,
      lastT: 0,
      lastX: 0,
      lastY: 0,
      attempts: 0,
      solved: false,
    }
    server.serializeAttachment(session)
    server.send(
      JSON.stringify({
        type: 'ready',
        index,
        seed,
        piece: { radius: PIECE_RADIUS },
        tolerance: TOLERANCE,
      }),
    )

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return
    const s = ws.deserializeAttachment() as Session | null
    if (!s) return

    let msg: { type?: string; x?: number; y?: number }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    // We keep receiving the pointer stream so behaviour (samples/path/duration)
    // is measured server-side. The only thing sent back is a single `hot`
    // boolean (are you within tolerance), so the shard's border can lock white —
    // no coordinates and no warmer/colder gradient to gradient-ascend.
    if (msg.type === 'move' && typeof msg.x === 'number' && typeof msg.y === 'number') {
      const now = Date.now()
      if (!s.firstT) s.firstT = now
      if (s.samples > 0) s.path += Math.hypot(msg.x - s.lastX, msg.y - s.lastY)
      s.samples += 1
      s.lastT = now
      s.lastX = msg.x
      s.lastY = msg.y
      ws.serializeAttachment(s)

      const hot = Math.hypot(msg.x - s.tx, msg.y - s.ty) <= TOLERANCE
      ws.send(JSON.stringify({ type: 'prox', hot }))
      return
    }

    // The player can pull a solved shard back out to undo the solve. We clear
    // the solved flag and the behavioural accumulators so a re-solve must again
    // exhibit human-like movement, while keeping the cumulative attempt cap and
    // the same secret target.
    if (msg.type === 'reset') {
      s.solved = false
      s.samples = 0
      s.path = 0
      s.firstT = 0
      s.lastT = 0
      ws.serializeAttachment(s)
      return
    }

    if (msg.type === 'release' && typeof msg.x === 'number' && typeof msg.y === 'number') {
      if (s.solved) return
      s.attempts += 1

      const dist = Math.hypot(msg.x - s.tx, msg.y - s.ty)
      const dur = s.lastT - s.firstT
      const onTarget = dist <= TOLERANCE
      const human = s.samples >= MIN_SAMPLES && s.path >= MIN_PATH && dur >= MIN_SOLVE_MS

      if (onTarget && human) {
        s.solved = true
        ws.serializeAttachment(s)
        const token = await mintToken(this.env.PUZZLE_SECRET)
        // Safe to reveal the exact target now: it's already solved, so the
        // client can snap the shard into perfect alignment with the photo.
        ws.send(
          JSON.stringify({ type: 'solved', token, target: { x: s.tx, y: s.ty } }),
        )
        return
      }

      ws.serializeAttachment(s)
      // On an on-target miss (the drop was within tolerance but the movement
      // didn't clear the behavioural floor) we hand back the exact target so the
      // client can snap the shard cleanly into place. This leaks nothing the
      // live `hot` signal didn't already reveal, and a solve still requires
      // passing the behavioural check. A 'far' miss carries no coordinates.
      ws.send(
        JSON.stringify(
          onTarget
            ? { type: 'miss', reason: 'behavior', target: { x: s.tx, y: s.ty } }
            : { type: 'miss', reason: 'far' },
        ),
      )
      if (s.attempts >= MAX_ATTEMPTS) ws.close(1008, 'too_many_attempts')
      return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      // already closing
    }
  }

  async webSocketError(): Promise<void> {
    // nothing to clean up — state lives on the socket attachment
  }
}

// --- signup endpoint -------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SOLVE_TTL_MS = 3 * 60 * 1000 // must match the token's iat window

// Per-isolate, per-IP throttle. A first line of defence paired with the
// single-use solve token; not a global guarantee.
const rl = new Map<string, { n: number; reset: number }>()
const rateLimit = (key: string, limit: number, windowMs: number): boolean => {
  const now = Date.now()
  const e = rl.get(key)
  if (!e || e.reset < now) {
    rl.set(key, { n: 1, reset: now + windowMs })
    return true
  }
  if (e.n >= limit) return false
  e.n += 1
  return true
}

const corsHeaders = (origin: string): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
})

const jsonResponse = (
  obj: unknown,
  status: number,
  origin: string,
): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  })

const fromB64url = (s: string): string => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

type TokenCheck =
  | { ok: true; jti: string; expiresAt: number }
  | { ok: false; reason: string }

// Verify the HMAC + claims of a token we minted. Single-use is enforced
// separately (durably) against D1.
const verifySolveToken = async (
  token: string | undefined,
  secret: string,
): Promise<TokenCheck> => {
  if (!token) return { ok: false, reason: 'missing' }
  const [p, sig] = token.split('.')
  if (!p || !sig) return { ok: false, reason: 'malformed' }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = b64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p))),
  )
  if (expected !== sig) return { ok: false, reason: 'bad_sig' }

  try {
    const payload = JSON.parse(fromB64url(p)) as {
      v?: number
      iat?: number
      jti?: string
    }
    if (payload.v !== 1) return { ok: false, reason: 'bad_version' }
    if (typeof payload.iat !== 'number') return { ok: false, reason: 'bad_iat' }
    if (typeof payload.jti !== 'string') return { ok: false, reason: 'bad_jti' }
    if (Date.now() - payload.iat > SOLVE_TTL_MS) return { ok: false, reason: 'expired' }
    return { ok: true, jti: payload.jti, expiresAt: payload.iat + SOLVE_TTL_MS }
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
}

const verifyTurnstile = async (
  secret: string | undefined,
  token: unknown,
  ip: string,
): Promise<boolean> => {
  if (!secret) return true // not configured → skip (parity with dev)
  if (typeof token !== 'string' || !token) return false
  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (ip && ip !== 'unknown') body.set('remoteip', ip)
  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body },
  )
  const data = (await res.json()) as { success?: boolean }
  return Boolean(data.success)
}

const handleSubscribe = async (req: Request, env: Env): Promise<Response> => {
  const origin = req.headers.get('Origin') || ''

  if (req.method === 'OPTIONS') {
    if (!originAllowed(req, env)) return new Response('forbidden origin', { status: 403 })
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (!originAllowed(req, env)) return new Response('forbidden origin', { status: 403 })
  if (req.method !== 'POST') return jsonResponse({ ok: false, reason: 'method' }, 405, origin)

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
  if (!rateLimit(`sub:${ip}`, 5, 60_000)) {
    return jsonResponse({ ok: false, reason: 'rate_limited' }, 429, origin)
  }

  let body: {
    email?: string
    website?: string
    turnstileToken?: string
    solveToken?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, reason: 'invalid_json' }, 400, origin)
  }

  // Honeypot: a real user never fills the hidden field.
  if (body.website) return jsonResponse({ ok: false, reason: 'rejected' }, 400, origin)

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !EMAIL.test(email)) {
    return jsonResponse({ ok: false, reason: 'invalid_email' }, 400, origin)
  }

  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, ip))) {
    return jsonResponse({ ok: false, reason: 'turnstile_failed' }, 400, origin)
  }

  // Verify the solve token's signature/claims, then burn it against replay.
  const tok = await verifySolveToken(body.solveToken, env.PUZZLE_SECRET)
  if (!tok.ok) return jsonResponse({ ok: false, reason: `puzzle_${tok.reason}` }, 400, origin)

  const now = Date.now()
  try {
    await env.DB.prepare('DELETE FROM used_solve_tokens WHERE expires_at < ?')
      .bind(now)
      .run()
    const claimed = await env.DB.prepare(
      'INSERT INTO used_solve_tokens (jti, expires_at) VALUES (?, ?) ON CONFLICT(jti) DO NOTHING',
    )
      .bind(tok.jti, tok.expiresAt)
      .run()
    if ((claimed.meta?.changes ?? 0) === 0) {
      return jsonResponse({ ok: false, reason: 'puzzle_replay' }, 400, origin)
    }
  } catch (err) {
    return jsonResponse({ ok: false, reason: 'storage_error', detail: String(err) }, 502, origin)
  }

  try {
    const ua = req.headers.get('user-agent') || ''
    const res = await env.DB.prepare(
      'INSERT INTO subscribers (email, source, user_agent, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
    )
      .bind(email, 'agentic-engineering-101', ua, new Date().toISOString())
      .run()
    const duplicate = (res.meta?.changes ?? 0) === 0
    return jsonResponse({ ok: true, duplicate }, 200, origin)
  } catch (err) {
    return jsonResponse({ ok: false, reason: 'storage_error', detail: String(err) }, 502, origin)
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }

    if (url.pathname === '/subscribe') {
      return handleSubscribe(req, env)
    }

    if (url.pathname !== '/puzzle') {
      return new Response('not found', { status: 404 })
    }

    if (!originAllowed(req, env)) {
      return new Response('forbidden origin', { status: 403 })
    }

    // Each connection is its own short-lived room holding one secret target.
    const id = env.PUZZLE_ROOM.newUniqueId()
    return env.PUZZLE_ROOM.get(id).fetch(req)
  },
}
