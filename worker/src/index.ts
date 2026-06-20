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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
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
