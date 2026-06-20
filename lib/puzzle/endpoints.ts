// Single source of truth for the puzzle backend's URLs.
//
// Both the WebSocket (`/puzzle`) and the signup POST (`/subscribe`) live on the
// same Cloudflare Worker, so they are derived from ONE resolved base — they can
// never drift apart, and the scheme (ws/wss, http/https) is chosen dynamically
// from that base rather than patched with string replaces in two places.
//
// The base is resolved at call time, in priority order:
//   1. NEXT_PUBLIC_PUZZLE_WS_URL — an explicit `ws(s)://host/puzzle` URL
//      (production on Vercel, or a tunnel pointed at the deployed worker).
//   2. localhost dev — the local `wrangler dev` worker on :8799.
//   3. same-origin — the current page's host, for deployments that route the
//      worker under the site's own domain (e.g. a Cloudflare route).

const LOCAL_DEV_HOST = 'localhost:8799'

export interface Backend {
  host: string // host[:port], no scheme
  secure: boolean // true → wss/https, false → ws/http
}

// Resolve the backend host + scheme, or null when it can't be determined yet
// (server-side render with no env configured — the client re-resolves on mount).
export const resolveBackend = (): Backend | null => {
  const env = process.env.NEXT_PUBLIC_PUZZLE_WS_URL?.trim()
  if (env) {
    try {
      const u = new URL(env)
      return { host: u.host, secure: u.protocol === 'wss:' }
    } catch {
      // malformed env → fall through to runtime resolution
    }
  }
  if (typeof window === 'undefined') return null
  const { hostname, host, protocol } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { host: LOCAL_DEV_HOST, secure: false }
  }
  return { host, secure: protocol === 'https:' }
}

// wss://host/puzzle (or ws:// in dev). Empty string when unresolved, which the
// controller surfaces as a connection error.
export const puzzleWsUrl = (): string => {
  const b = resolveBackend()
  if (!b) return ''
  return `${b.secure ? 'wss' : 'ws'}://${b.host}/puzzle`
}

// https://host/subscribe (or http:// in dev). Falls back to the same-origin Next
// route when unresolved (SSR / no env / no window).
export const subscribeUrl = (): string => {
  const b = resolveBackend()
  if (!b) return '/api/subscribe'
  return `${b.secure ? 'https' : 'http'}://${b.host}/subscribe`
}
