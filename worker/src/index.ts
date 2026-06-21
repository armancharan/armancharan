// Cloudflare Worker + Durable Object backing the "shard of sky" puzzle.
//
// The browser is shown a fixed crop of the photo (a "shard") by INDEX only and
// must drag it to where it belongs by eye. The crop necessarily reveals its own
// region, but the index -> coordinate mapping lives only here, so the answer is
// never handed to the client as data. The DO also measures the drag itself
// (samples, path, duration) so behavioural checks are server-truth, and on a
// legitimate drop it mints an HMAC-signed token the Vercel API trusts.

import { hotJitter, type HotGateFloors } from '../../lib/puzzle/hot'
import {
  accrueMoveSamples,
  normaliseSamples,
  sessionExpired,
} from '../../lib/puzzle/session'
import { isOriginAllowed, parseAllowList } from '../../lib/origin'
import { logError } from './logging'
import {
  createMetrics,
  emitSession,
  type EndReason,
  type MetricsService,
} from './metrics'
import config from './targets.json'
import puzzleConfig from './puzzle.config.json'

export interface Env {
  PUZZLE_ROOM: DurableObjectNamespace
  PUZZLE_SECRET: string
  ALLOWED_ORIGINS?: string
  DB: D1Database
  TURNSTILE_SECRET?: string
  // Native Cloudflare Workers Rate Limiting bindings (durable, cross-isolate,
  // per-colo counters). Optional so dev/test without the binding fails open.
  // Limits/windows are configured in wrangler.toml ([ratelimits.simple]).
  PUZZLE_RATE_LIMITER?: RateLimit
  SUBSCRIBE_RATE_LIMITER?: RateLimit
  // Workers Analytics Engine dataset for server-truth session/abuse metrics.
  // Optional so local dev / tests without the binding fall back to a no-op.
  PUZZLE_ANALYTICS?: AnalyticsEngineDataset
}

const PROJECT = 'agentic-engineering-101'

const TARGETS = config.targets as Array<{ x: number; y: number }>
const PIECE_RADIUS = config.radius
const TOLERANCE = config.tolerance

// Loud (non-fatal) sanity check at load: a count mismatch means targets.json is
// stale or the EXAMPLE placeholder was copied over the real generated file. We
// log via the existing structured logger (surfaced by `wrangler tail`) rather
// than throw, so a misconfigured data file never takes the whole Worker down.
if (TARGETS.length !== puzzleConfig.count) {
  logError(
    'puzzle.config_mismatch',
    new Error('targets.json / puzzle.config.json count mismatch'),
    { targets: TARGETS.length, expected: puzzleConfig.count },
  )
}

// Behavioural floors — a human drag clears these trivially; a teleporting bot
// post does not.
const MIN_SOLVE_MS = 600
const MIN_SAMPLES = 10
const MIN_PATH = 0.12
const MAX_ATTEMPTS = 8

// Server-side session wall-clock guard. The client stops transmitting at 90s;
// we allow a few seconds of slack (clock skew / a final in-flight flush) before
// closing. This is the REAL cap — the client one is a courtesy.
const MAX_SESSION_MS = 95_000

// Ceiling on cumulative behavioural samples per session. A genuine 90s drag at
// ~60Hz produces ~5400 samples even before the client's delta-gate trims idle
// jitter, so this sits ~1.6x above any real human session while bounding a bot
// that blasts samples to inflate path/duration. Exceeding it closes the socket.
const MAX_MOVE_SAMPLES = 9_000

// Behavioural gate for the pre-win "hot" preview. Set to half the solve floors:
// enough accrued samples, path, and time that an instantaneous binary-search
// probe gets no signal, while a real human drag clears it well before reaching
// the target. (The authoritative solve still requires the FULL floors above.)
const HOT_GATE: HotGateFloors = {
  minSamples: Math.ceil(MIN_SAMPLES / 2),
  minPath: MIN_PATH / 2,
  minMs: MIN_SOLVE_MS / 2,
}

type Session = {
  index: number
  tx: number
  ty: number
  // Connection accept time (ms epoch) — anchor for the session wall-clock cap.
  startT: number
  // Captured at connect for metrics (request.cf / headers aren't available in
  // webSocketClose). `metricEmitted` latches the one-datapoint-per-session rule.
  ip: string
  country: string
  colo: string
  metricEmitted: boolean
  samples: number
  path: number
  firstT: number
  lastT: number
  lastX: number
  lastY: number
  attempts: number
  solved: boolean
  // Per-session multiplier (~[0.85, 1.15]) applied to the tolerance radius when
  // deciding the "hot" preview. Fixed for the life of the session so the jitter
  // can't be averaged away by probing; see lib/puzzle/hot.ts.
  hotJitter: number
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

// Empty allowlist = permissive (dev). Otherwise exact origins plus single-label
// subdomain wildcards (e.g. https://*.armancharan.com, https://*.vercel.app) so
// dev subdomains and Vercel preview deployments aren't silently 403'd.
const originAllowed = (req: Request, env: Env): boolean =>
  isOriginAllowed(req.headers.get('Origin'), parseAllowList(env.ALLOWED_ORIGINS))

export class PuzzleRoom {
  private state: DurableObjectState
  private env: Env
  private metrics: MetricsService

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.metrics = createMetrics(env.PUZZLE_ANALYTICS)
  }

  // Emit exactly one session datapoint per session (latched by metricEmitted),
  // then persist the latch so a later terminal path can't double-count.
  private endSession(ws: WebSocket, s: Session, endReason: EndReason): void {
    if (s.metricEmitted) return
    const dur = Date.now() - s.startT
    const hotGatePass =
      s.samples >= HOT_GATE.minSamples &&
      s.path >= HOT_GATE.minPath &&
      s.lastT - s.firstT >= HOT_GATE.minMs
    emitSession(this.metrics, s, {
      ip: s.ip,
      endReason,
      country: s.country,
      colo: s.colo,
      project: PROJECT,
      durationMs: dur,
      sampleCount: s.samples,
      attempts: s.attempts,
      pathLen: s.path,
      hotGatePass,
    })
    ws.serializeAttachment(s)
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
    // request.cf carries the colo/country and is only available here (not in
    // webSocketClose), so snapshot it onto the session at connect.
    const cf = req.cf as { country?: string; colo?: string } | undefined
    const session: Session = {
      index,
      tx: TARGETS[index].x,
      ty: TARGETS[index].y,
      startT: Date.now(),
      ip: req.headers.get('CF-Connecting-IP') || 'unknown',
      country: cf?.country || 'unknown',
      colo: cf?.colo || 'unknown',
      metricEmitted: false,
      samples: 0,
      path: 0,
      firstT: 0,
      lastT: 0,
      lastX: 0,
      lastY: 0,
      attempts: 0,
      solved: false,
      hotJitter: hotJitter(crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32),
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

    let msg: { type?: string; x?: number; y?: number; samples?: unknown }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    // Server-side session wall-clock guard. The real cap (the client stops at
    // 90s); any message past the slack window closes the socket.
    if (sessionExpired(Date.now(), s.startT, MAX_SESSION_MS)) {
      this.endSession(ws, s, 'session_expired')
      ws.close(1008, 'session_expired')
      return
    }

    // We keep receiving the pointer stream so behaviour (samples/path/duration)
    // is measured server-side, and we emit a per-move "hot" preview boolean so
    // the client can show the white-shard feedback before the first win (it has
    // no target to compute this locally). A naive "within tolerance" flag would
    // leak the answer — a script could sweep the board and binary-search the disc
    // to triangulate it — so the signal is hardened in lib/puzzle/hot.ts: it stays
    // false until the drag clears a behavioural gate (so an instantaneous probe
    // gets nothing), and the boundary is jittered per session (so the exact
    // tolerance radius can't be pinpointed). This is acceptable because the
    // authoritative on-target + behavioural check still happens only on release,
    // and Turnstile + single-use D1 solve tokens + rate limiting + the attempt cap
    // remain the real wall against abuse.
    if (msg.type === 'move') {
      // Accept the batched `samples: [...]` shape (and a single {x,y} for
      // backward-compat). Each sample is accrued exactly as one-per-message was:
      // +1 sample each, path between consecutive samples — so the human-motion
      // gate keeps counting per sample, not per batch. Hotness is decided once
      // off the last sample (at most one `hot` per message).
      const batch = normaliseSamples(msg)
      if (batch.length === 0) return
      const res = accrueMoveSamples({
        acc: s,
        samples: batch,
        now: Date.now(),
        tx: s.tx,
        ty: s.ty,
        tolerance: TOLERANCE,
        jitter: s.hotJitter,
        hotGate: HOT_GATE,
        solved: s.solved,
        maxSamples: MAX_MOVE_SAMPLES,
      })
      ws.serializeAttachment(s)
      // Bound runaway/abusive sample volume well above any real human session.
      if (res.capExceeded) {
        this.endSession(ws, s, 'too_many_samples')
        ws.close(1008, 'too_many_samples')
        return
      }
      // Don't drive hotness once solved — post-win the client knows the target
      // and computes the preview locally (res.hot is null then).
      if (res.hot !== null) ws.send(JSON.stringify({ type: 'hot', hot: res.hot }))
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
        // Terminal success — the client detaches the socket after this, so emit
        // the session datapoint now (a later disconnect won't double-count).
        this.endSession(ws, s, 'solved')
        return
      }

      ws.serializeAttachment(s)
      // A miss never carries coordinates. We distinguish an on-target-but-not-
      // human drop ('behavior') from a genuine miss ('far') only so the client
      // can word the hint, but the exact target is never revealed until an
      // authoritative solve — otherwise repeated near-misses would hand out the
      // answer for free. The client never snaps to a missed target.
      ws.send(
        JSON.stringify({ type: 'miss', reason: onTarget ? 'behavior' : 'far' }),
      )
      if (s.attempts >= MAX_ATTEMPTS) {
        this.endSession(ws, s, 'too_many_attempts')
        ws.close(1008, 'too_many_attempts')
      }
      return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Emit a session datapoint for connections that ended without hitting an
    // explicit terminal path (the player just closed the tab). Guarded by the
    // metricEmitted latch, so a solved/expired/capped session that already
    // emitted is never double-counted here.
    const s = ws.deserializeAttachment() as Session | null
    if (s) this.endSession(ws, s, 'disconnect')
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

// Durable, cross-isolate, per-IP throttle backed by the native Cloudflare
// Workers Rate Limiting binding. Counters live in Cloudflare's edge (per colo),
// so reconnecting or hopping isolates can't reset the budget — unlike the old
// per-isolate Map. Limits/windows are set in wrangler.toml ([ratelimits.simple]).
//
// Returns true when the request is OVER the limit (should be rejected). Fails
// open when the binding is absent (local dev / tests without the binding), which
// is acceptable: Turnstile and the single-use solve token remain the backstop.
const isRateLimited = async (
  limiter: RateLimit | undefined,
  key: string,
): Promise<boolean> => {
  if (!limiter) return false
  try {
    const { success } = await limiter.limit({ key })
    return !success
  } catch {
    // A limiter error must not take the endpoint down; fail open.
    return false
  }
}

const clientIp = (req: Request): string =>
  req.headers.get('CF-Connecting-IP') || 'unknown'

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

// Constant-time string comparison for the HMAC signature, mirroring the
// timingSafeEqual approach: XOR-accumulate over the full length so the time
// taken never depends on WHERE the first mismatching byte is. A length
// mismatch can short-circuit (the expected signature length is fixed/public).
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

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
  if (!timingSafeEqual(expected, sig)) return { ok: false, reason: 'bad_sig' }

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

  const ip = clientIp(req)
  if (await isRateLimited(env.SUBSCRIBE_RATE_LIMITER, ip)) {
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
    logError('subscribe.claim_token', err, { jti: tok.jti })
    return jsonResponse({ ok: false, reason: 'storage_error' }, 502, origin)
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
    logError('subscribe.insert_subscriber', err, { email })
    return jsonResponse({ ok: false, reason: 'storage_error' }, 502, origin)
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

    const metrics = createMetrics(env.PUZZLE_ANALYTICS)

    if (!originAllowed(req, env)) {
      metrics.recordReject({ ip: clientIp(req), reason: 'origin_rejected' })
      return new Response('forbidden origin', { status: 403 })
    }

    // Per-IP cap on socket upgrades. Without this, every reconnect spawns a
    // fresh Durable Object room with a fresh attempt budget, so the attempt cap
    // is trivially reset and room creation is unbounded per IP. The durable
    // counter survives reconnects and isolate hops.
    if (await isRateLimited(env.PUZZLE_RATE_LIMITER, clientIp(req))) {
      metrics.recordReject({ ip: clientIp(req), reason: 'rate_limited' })
      return new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': '60' },
      })
    }

    // Each connection is its own short-lived room holding one secret target.
    const id = env.PUZZLE_ROOM.newUniqueId()
    return env.PUZZLE_ROOM.get(id).fetch(req)
  },
}
