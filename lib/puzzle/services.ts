// Service layer: the puzzle's outward-facing side effects, behind small
// interfaces. The controller (presenter) depends only on these abstractions, so
// the component never touches `fetch`, `window.turnstile`, or analytics directly
// — and tests can inject fakes.

import { track } from '@vercel/analytics'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          action?: string
          callback?: (token: string) => void
          'error-callback'?: () => void
        },
      ) => string
      remove: (id: string) => void
    }
  }
}

// --- subscribe -------------------------------------------------------------

export interface SubscribeRequest {
  email: string
  honeypot: string
  turnstileToken: string | null
  solveToken: string
}

export interface SubscribeResult {
  ok: boolean
  reason?: string
  duplicate?: boolean
}

export interface SubscribeService {
  submit: (req: SubscribeRequest) => Promise<SubscribeResult>
}

// Talks to the Next API route. The route re-checks rate limit, honeypot,
// Turnstile, and the (single-use) solve token server-side.
export const httpSubscribeService: SubscribeService = {
  submit: async req => {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: req.email,
        website: req.honeypot,
        turnstileToken: req.turnstileToken,
        solveToken: req.solveToken,
      }),
    })
    const data = (await res.json()) as SubscribeResult
    return data
  },
}

// --- turnstile -------------------------------------------------------------

export interface TurnstileMountOptions {
  siteKey: string
  action?: string
  onToken: (token: string | null) => void
}

export interface TurnstileService {
  // Render the widget into `el`; returns a disposer. The widget script loads
  // async, so we poll briefly for it before rendering.
  mount: (el: HTMLElement, opts: TurnstileMountOptions) => () => void
}

export const browserTurnstileService: TurnstileService = {
  mount: (el, opts) => {
    let widgetId: string | undefined
    const poll = window.setInterval(() => {
      if (!window.turnstile) return
      window.clearInterval(poll)
      widgetId = window.turnstile.render(el, {
        sitekey: opts.siteKey,
        action: opts.action,
        callback: opts.onToken,
        'error-callback': () => opts.onToken(null),
      })
    }, 200)
    return () => {
      window.clearInterval(poll)
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  },
}

// --- analytics -------------------------------------------------------------

export interface AnalyticsService {
  track: (event: string, props?: Record<string, string>) => void
}

export const vercelAnalytics: AnalyticsService = {
  track: (event, props) => track(event, props),
}

// --- client config ---------------------------------------------------------

export interface PuzzleConfig {
  wsUrl: () => string
  siteKey: string | undefined
}

// The secret target never reaches the browser: we connect to the puzzle Durable
// Object, which sends a shard by INDEX only and, on a legitimate drop, a signed
// token. The index -> coordinate mapping lives only on the server.
export const defaultPuzzleConfig: PuzzleConfig = {
  wsUrl: () => {
    const env = process.env.NEXT_PUBLIC_PUZZLE_WS_URL
    if (env) return env
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'ws://localhost:8799/puzzle'
    }
    return ''
  },
  siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
}
