// The imperative half of the puzzle, consolidated. PuzzleController owns the
// store, the WebSocket, the rAF drag pump, and every piece of render-free drag
// state (position, offsets, drag flags) plus the DOM writes that place the
// shard. The React component holds none of this — it creates one controller,
// subscribes to its store, and forwards pointer events. All branching decisions
// are delegated to the pure (unit-tested) presenter/geometry functions.

import {
  decidePointerUp,
  effectivePieceRadius,
  inZone,
  START,
  TAP_SLOP,
} from './geometry'
import {
  createConsoleLogger,
  type LoggingService,
} from './logging'
import {
  humanError,
  interpretServerMessage,
  isRetryableReason,
} from './presenter'
import {
  browserTurnstileService,
  defaultPuzzleConfig,
  httpSubscribeService,
  vercelAnalytics,
  type AnalyticsService,
  type PuzzleConfig,
  type SubscribeService,
  type TurnstileService,
} from './services'
import { createPuzzleStore, type PuzzleStore } from './store'
import type { ClientMessage, Point } from './types'

// Structural subset of a (React or DOM) pointer event — keeps this file free of
// any framework dependency.
export interface PointerInput {
  clientX: number
  clientY: number
  pointerId: number
  currentTarget: Element
}

export interface PuzzleControllerDeps {
  aspect: number // board height / width
  getBoardEl: () => HTMLElement | null
  getPieceEl: () => HTMLElement | null
  config?: PuzzleConfig
  subscribe?: SubscribeService
  turnstile?: TurnstileService
  analytics?: AnalyticsService
  logger?: LoggingService
  project?: string // analytics tag
}

const SNAP_TRANSITION = 'transform .4s cubic-bezier(.34,1.4,.6,1), opacity .25s ease'

// Coalesce buffered pointer samples into ONE socket frame every BATCH_INTERVAL_MS
// instead of sending one frame per animation frame (~60/s). We keep SAMPLING at
// frame rate (buffering every pump) so the server still receives ~60Hz of
// behavioural samples — we just transmit them batched, cutting socket sends ~5x.
const BATCH_INTERVAL_MS = 75

// Drop a buffered sample that moved less than this many px (normalised by board
// width at use) from the last buffered one — sheds idle/aiming jitter that would
// otherwise inflate the sample/path stream. The release sample is never dropped.
const MIN_SAMPLE_DELTA_PX = 0.5

// Generous wall-clock cap on a single (pre-win) session, anchored at connect.
// Past this we stop transmitting and stop the drag-solve loop, surfacing the
// retryable error path; the server enforces its own (slightly longer) cap as the
// real guard. A human placement clears it many times over.
const SESSION_CAP_MS = 90_000

export class PuzzleController {
  readonly store: PuzzleStore = createPuzzleStore()

  private readonly deps: PuzzleControllerDeps
  private readonly config: PuzzleConfig
  private readonly subscribe: SubscribeService
  private readonly turnstile: TurnstileService
  private readonly analytics: AnalyticsService
  private readonly logger: LoggingService
  private readonly project: string
  private ws: WebSocket | null = null
  private teardown: (() => void) | null = null // disposer for the live socket
  private dims = { w: 0, h: 0 }
  private pos: Point = START
  private pending: Point | null = null
  // Latest raw pointer sample (viewport-relative). Kept so we can re-derive the
  // board-relative position against a fresh rect when the page scrolls without
  // emitting a pointermove (see onScroll).
  private lastClient: { clientX: number; clientY: number } | null = null
  private offset: Point = { x: 0, y: 0 } // shard-centre minus grab point
  private down: Point = { x: 0, y: 0 }
  // Grab point in viewport (client) px. Movement is measured against this in a
  // scroll-stable space: client coords reflect the finger's real screen travel,
  // so a page scroll mid-drag neither fakes movement nor masks it.
  private downClient: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 }
  private dragging = false
  private moved = false // synchronous mirror of dragMoved within a drag
  private raf: number | null = null
  private radius: number
  // Pointer samples buffered since the last flush, plus the last buffered point
  // (for the delta-gate) and the interval/timer handles for the batched
  // transmit and the session wall-clock cap.
  private sampleBuffer: Point[] = []
  private lastBuffered: Point | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private sessionTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: PuzzleControllerDeps) {
    this.deps = deps
    this.config = deps.config ?? defaultPuzzleConfig
    this.subscribe = deps.subscribe ?? httpSubscribeService
    this.turnstile = deps.turnstile ?? browserTurnstileService
    this.analytics = deps.analytics ?? vercelAnalytics
    this.logger = deps.logger ?? createConsoleLogger()
    this.project = deps.project ?? 'agentic-engineering-101'
    this.radius = 0.13
  }

  /** Current shard centre (normalised) — for rendering the solve burst. */
  get position(): Point {
    return this.pos
  }

  /** Site key for the Turnstile widget/script (undefined disables it). */
  get siteKey(): string | undefined {
    return this.config.siteKey
  }

  // --- lifecycle -----------------------------------------------------------

  /** Open the socket. Returns a disposer for React effect cleanup. */
  connect = (): (() => void) => {
    // Never run two sockets at once (retry/StrictMode-remount both re-enter here).
    this.teardown?.()
    this.teardown = null

    const url = this.config.wsUrl()
    if (!url) {
      this.store.dispatch({
        type: 'error',
        message: 'puzzle is offline right now',
        retry: true,
      })
      return () => {}
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      this.logger.logError('connect', err, { url })
      this.store.dispatch({
        type: 'error',
        message: 'failed to load puzzle',
        retry: true,
      })
      return () => {}
    }
    this.ws = ws
    // Anchor the session wall-clock cap at connection. Pre-win only — once won
    // the socket is detached and play is fully local, so the cap is moot.
    this.armSessionCap()
    // StrictMode mounts effects twice in dev; the first socket is closed by
    // cleanup before it connects, so ignore closes we initiate ourselves.
    let closedByUs = false

    ws.onmessage = ev => {
      const action = interpretServerMessage(ev.data)
      if (!action) return
      // The server's pre-win hotness preview arrives as a `prox` action. Once the
      // puzzle is won the target is cached and `onPointerMove` computes the preview
      // locally (and the socket is detached anyway), so a late/in-flight server
      // `hot` must never override that — drop it.
      if (action.type === 'prox' && this.store.getState().won) return
      this.store.dispatch(action)

      if (action.type === 'ready') {
        this.radius = action.radius
        requestAnimationFrame(() => this.applyPos(START.x, START.y, false))
        return
      }
      if (action.type === 'solved') {
        this.dragging = false
        this.removeScrollWatch()
        this.cancelRaf()
        // Win reached: the socket is about to be detached and all further play is
        // local, so the transmit batch and the session cap are no longer needed.
        this.stopFlush()
        this.clearSessionCap()
        // The server reveals the exact target only now: snap into place instantly.
        this.applyPos(action.target.x, action.target.y, false)
        this.analytics.track('puzzle_solved', { project: this.project })
        // We hold the signed, single-use token AND the revealed target now, both
        // cached in the store. The Durable Object / socket is no longer needed,
        // so detach to free it. From here, drag-out-to-unset and re-place are
        // computed locally against the cached target (see the pointer handlers)
        // — no more server round-trips, and the token is retained throughout.
        closedByUs = true
        ws.close()
        this.ws = null
        return
      }
      // A miss is handled entirely by the reducer (it clears the hot/preview
      // look). The piece is left where it was dropped — we never snap to the
      // target on a miss, as that would leak the answer and look "placed".
    }

    const failIfConnecting = (ev: Event) => {
      if (!closedByUs && this.store.getState().phase === 'connecting') {
        this.logger.logError('connect', ev, { url, type: ev.type })
        this.store.dispatch({
          type: 'error',
          message: 'failed to load puzzle',
          retry: true,
        })
      }
    }
    ws.onerror = failIfConnecting
    ws.onclose = failIfConnecting

    const dispose = () => {
      closedByUs = true
      this.cancelRaf()
      this.stopFlush()
      this.clearSessionCap()
      ws.close()
      if (this.ws === ws) this.ws = null
    }
    this.teardown = dispose
    return dispose
  }

  /** Dispose the live socket (React effect cleanup). */
  dispose = (): void => {
    this.removeScrollWatch()
    this.teardown?.()
    this.teardown = null
  }

  /** Reset to a fresh challenge and reconnect — the "give it another go" action.
   *  Used when the solve token expires (or a connection drops): a new socket
   *  yields a new puzzle and, on solve, a new single-use token. Capped: once the
   *  retry budget is spent we do NOT reconnect — the terminal error state stands
   *  (the view disables the CTA and asks the user to refresh). The budget refills
   *  on a successful reconnect (the `ready` action). */
  retry = (): void => {
    if (this.store.getState().retriesLeft <= 0) return
    // `reset` decrements the budget; reconnect for a fresh challenge.
    this.store.dispatch({ type: 'reset' })
    this.connect()
  }

  /** Re-measure the board from the DOM; keeps the shard pinned through resizes. */
  measure = (): void => {
    const w = this.deps.getBoardEl()?.clientWidth ?? 0
    this.setBoardWidth(w)
  }

  /** Set the board width (px), publish it to the store, and re-pin the shard. */
  setBoardWidth = (w: number): void => {
    this.dims = { w, h: w * this.deps.aspect }
    this.store.dispatch({ type: 'setBoardWidth', width: w })
    this.applyPos(this.pos.x, this.pos.y, false)
  }

  // --- form / signup -------------------------------------------------------

  setEmail = (email: string): void => {
    this.store.dispatch({ type: 'setEmail', email })
  }

  /** Flip the shard's scramble/clear-crop reveal — driven by clicking the shard. */
  toggleReveal = (): void => {
    this.store.dispatch({ type: 'toggleReveal' })
  }

  /** Flip background focus (dim the clouds) — driven by clicking the photo. */
  toggleBgFocus = (): void => {
    this.store.dispatch({ type: 'toggleBgFocus' })
  }

  /** Render the Turnstile widget into `el`; returns a disposer. */
  mountTurnstile = (el: HTMLElement): (() => void) => {
    const siteKey = this.config.siteKey
    if (!siteKey) return () => {}
    return this.turnstile.mount(el, {
      siteKey,
      action: 'turnstile-spin-v1',
      onToken: token => this.store.dispatch({ type: 'setTurnstileToken', token }),
    })
  }

  /** Submit the signup. Reads email/tokens from the store; honeypot from the view. */
  submit = async (honeypot: string): Promise<void> => {
    const s = this.store.getState()
    if (!s.token || s.submitting) return
    this.store.dispatch({ type: 'submitStart' })
    try {
      const res = await this.subscribe.submit({
        email: s.email,
        honeypot,
        turnstileToken: s.turnstileToken,
        solveToken: s.token,
      })
      if (!res.ok) {
        this.store.dispatch({
          type: 'error',
          message: humanError(res.reason),
          retry: isRetryableReason(res.reason),
        })
        return
      }
      this.analytics.track('subscribed', { project: this.project })
      this.store.dispatch({ type: 'submitted' })
    } catch (err) {
      this.logger.logError('submit', err, { project: this.project })
      this.store.dispatch({ type: 'error', message: 'something went wrong' })
    }
  }

  // --- pointer handlers ----------------------------------------------------

  onPointerDown = (e: PointerInput): void => {
    // Grabbable while playing AND once solved (so it can be pulled back out).
    const ph = this.store.getState().phase
    if (ph !== 'playing' && ph !== 'solved') return
    // Capture on the piece itself (stable across re-renders). Wrapped because
    // setPointerCapture can throw on some browsers; if it does we must still
    // arm the drag/tap so a single click reliably toggles.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture unsupported/failed — pointer events still fire on the element
    }
    this.lastClient = { clientX: e.clientX, clientY: e.clientY }
    this.downClient = { clientX: e.clientX, clientY: e.clientY }
    const p = this.toNorm(e)
    this.down = { x: p.x, y: p.y }
    // Grab immediately so click-and-hold feels instant.
    this.offset = { x: this.pos.x - p.x, y: this.pos.y - p.y }
    this.dragging = true
    this.moved = false
    this.store.dispatch({ type: 'dragStart' })
    this.pending = p
    // Fresh grab: the first sample should always buffer (no stale delta anchor),
    // and the batched-transmit loop runs for the life of the gesture.
    this.lastBuffered = null
    this.startFlush()
    // The page can scroll under an active drag (mobile rubber-band, a second
    // finger, momentum). A scroll moves the board without firing a pointermove,
    // so re-derive the board-relative position from the live pointer + a fresh
    // rect to keep the grab point pinned under the finger.
    this.addScrollWatch()
    const piece = this.deps.getPieceEl()
    if (piece) piece.style.opacity = '1'
    if (this.raf == null) this.raf = requestAnimationFrame(this.pump)
  }

  onPointerMove = (e: PointerInput): void => {
    if (!this.dragging) return
    this.lastClient = { clientX: e.clientX, clientY: e.clientY }
    const p = this.toNorm(e)
    this.pending = p
    // Only a real drag (travelled past the slop) hides the scramble; a
    // stationary press stays a click. Measured from the grab point in client
    // (viewport) px, normalised by board width — scroll-stable, and latched once
    // tripped so a round-trip drag back to the origin still counts as a drag.
    if (!this.moved) {
      const w = this.dims.w || 1
      const travelled = Math.hypot(
        e.clientX - this.downClient.clientX,
        e.clientY - this.downClient.clientY,
      )
      if (travelled / w > TAP_SLOP) {
        this.moved = true
        this.store.dispatch({ type: 'dragMoved' })
      }
    }
    // Before the first win, the server's `hot` message drives hotness (the client
    // has no target to judge against) — nothing to do here. Once won, the target
    // is cached, so we judge proximity locally (no socket): leaving the zone
    // live-unplaces (form de-activates); a won-but-unplaced shard previews "hot"
    // as it's dragged back in.
    const st = this.store.getState()
    if (!st.won || !st.target) return
    const centre = { x: p.x + this.offset.x, y: p.y + this.offset.y }
    const hot = inZone(centre, st.target, st.tolerance)
    if (st.phase === 'solved') {
      if (!hot) this.store.dispatch({ type: 'unsolve' })
    } else {
      this.store.dispatch({ type: 'prox', hot })
    }
  }

  onPointerUp = (e: PointerInput): void => {
    if (!this.dragging) return
    this.dragging = false
    this.removeScrollWatch()
    this.lastClient = null
    this.store.dispatch({ type: 'dragEnd' })
    this.cancelRaf()

    const st = this.store.getState()
    const up = this.toNorm(e)
    // Shard centre at the instant of release — the SAME formula the drag uses,
    // so the up decision can never disagree with the live hot/unsolve tracking.
    const centre = { x: up.x + this.offset.x, y: up.y + this.offset.y }

    // Flush the final position immediately so it isn't delayed by the batch
    // window, and never let the delta-gate drop the release sample (force=true)
    // — the server's human-motion gate must see where the drag actually ended.
    this.bufferSample(centre.x, centre.y, true)
    this.flushSamples()
    this.stopFlush()

    // One pure decision yields two INDEPENDENT outcomes: a reveal toggle (was it
    // a stationary click?) and a placement (pure geometry). Applying them
    // separately is what fixes the old bug where a sub-slop nudge was treated as
    // "just a click" and the shard's placement was never recomputed.
    const { reveal, placement } = decidePointerUp({
      won: st.won,
      solved: st.phase === 'solved',
      down: this.down,
      up,
      centre,
      target: st.target,
      tolerance: st.tolerance,
      // Path-aware: a long drag that returns to ~origin nets ~0 displacement but
      // must NOT be read as a tap. `moved` latches true the moment travel passes
      // the slop, so the round-trip is correctly classified as a drag.
      moved: this.moved,
    })

    if (reveal) this.store.dispatch({ type: 'toggleReveal' })

    switch (placement.kind) {
      case 'place':
        // In the zone (or still solved) — (re)light the win and snap home. The
        // `place` action is a no-op if already solved; the snap is not.
        this.store.dispatch({ type: 'place' })
        this.applyPos(placement.target.x, placement.target.y, false)
        return
      case 'dissolve':
        this.store.dispatch({ type: 'unsolve' }) // no-op unless it was solved
        this.dissolveToStart()
        return
      case 'leave':
        // Left on the board but out of zone — leave it where dropped, unplaced.
        return
      case 'ask':
        // Pre-win: the server performs the authoritative behavioural check.
        this.send({ type: 'release', x: centre.x, y: centre.y })
        return
    }
  }

  // --- internals -----------------------------------------------------------

  // One DOM write + one socket send per frame, fed by the latest pointer sample.
  private pump = (): void => {
    if (!this.dragging) {
      this.raf = null
      return
    }
    const p = this.pending
    if (p) {
      this.pending = null
      // Keep the grab point under the pointer (centre = pointer + offset).
      const x = p.x + this.offset.x
      const y = p.y + this.offset.y
      // Local drag render runs every frame for 60fps; the socket send is what we
      // batch. Buffer this frame's sample (delta-gated) for the next flush.
      this.applyPos(x, y, false)
      this.bufferSample(x, y, false)
    }
    this.raf = requestAnimationFrame(this.pump)
  }

  // Place the shard via transform only — dragging never triggers a React render.
  private applyPos = (x: number, y: number, animate: boolean): void => {
    const { w, h } = this.dims
    this.pos = { x, y }
    if (!w) return
    // Same effective radius the view uses to size the shard, so the element's
    // centre lands exactly on (x, y) — never drifting on compact boards.
    const r = effectivePieceRadius(this.radius, w) * w
    const piece = this.deps.getPieceEl()
    if (piece) {
      piece.style.transition = animate ? SNAP_TRANSITION : 'transform 0s'
      piece.style.transform = `translate3d(${x * w - r}px, ${y * h - r}px, 0)`
    }
  }

  // Dissolve over the edge, then fade back in at the start.
  private dissolveToStart = (): void => {
    const piece = this.deps.getPieceEl()
    if (piece) {
      piece.style.transition = 'opacity .2s ease'
      piece.style.opacity = '0'
    }
    window.setTimeout(() => {
      this.applyPos(START.x, START.y, false)
      requestAnimationFrame(() => {
        if (piece) {
          piece.style.transition = 'opacity .28s ease'
          piece.style.opacity = '1'
        }
      })
    }, 200)
  }

  private toNorm = (e: { clientX: number; clientY: number }): Point => {
    // getBoundingClientRect is viewport-relative and tracks scroll, so pairing a
    // FRESH rect with the viewport-relative clientX/clientY is scroll-safe.
    const rect = this.deps.getBoardEl()!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }

  // The page scrolled mid-drag. No pointermove fires for a pure scroll, so the
  // last sample's board-relative coords are now stale (the board moved under a
  // stationary finger). Re-derive from the live pointer + a fresh rect and let
  // the rAF pump reposition the shard, keeping the grab point under the finger.
  private onScroll = (): void => {
    if (!this.dragging || !this.lastClient) return
    this.pending = this.toNorm(this.lastClient)
    if (this.raf == null) this.raf = requestAnimationFrame(this.pump)
  }

  private addScrollWatch = (): void => {
    if (typeof window === 'undefined') return
    // Capture phase catches scrolls on any ancestor container, not just the
    // window; passive since we never call preventDefault here.
    window.addEventListener('scroll', this.onScroll, { capture: true, passive: true })
  }

  private removeScrollWatch = (): void => {
    if (typeof window === 'undefined') return
    window.removeEventListener('scroll', this.onScroll, { capture: true })
  }

  private send = (msg: ClientMessage): void => {
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  // Buffer a sample for the next batched flush. Sub-threshold moves are dropped
  // (delta-gate) to shed idle jitter; `force` bypasses the gate so the release
  // sample is always kept.
  private bufferSample = (x: number, y: number, force: boolean): void => {
    if (!force) {
      const w = this.dims.w || 1
      const threshold = MIN_SAMPLE_DELTA_PX / w
      const last = this.lastBuffered
      if (last && Math.hypot(x - last.x, y - last.y) < threshold) return
    }
    const sample = { x, y }
    this.sampleBuffer.push(sample)
    this.lastBuffered = sample
  }

  // Transmit (and clear) the buffered samples as one `move` frame.
  private flushSamples = (): void => {
    if (this.sampleBuffer.length === 0) return
    const samples = this.sampleBuffer
    this.sampleBuffer = []
    this.send({ type: 'move', samples })
  }

  private startFlush = (): void => {
    if (this.flushTimer != null || typeof setInterval === 'undefined') return
    this.flushTimer = setInterval(this.flushSamples, BATCH_INTERVAL_MS)
  }

  private stopFlush = (): void => {
    if (this.flushTimer != null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private armSessionCap = (): void => {
    this.clearSessionCap()
    if (typeof setTimeout === 'undefined') return
    const t = setTimeout(this.onSessionExpired, SESSION_CAP_MS)
    // In Node (tests) keep a pending cap from holding the event loop open.
    ;(t as { unref?: () => void }).unref?.()
    this.sessionTimer = t
  }

  private clearSessionCap = (): void => {
    if (this.sessionTimer != null) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
  }

  // The pre-win session outlived its cap: stop transmitting and stop the drag-
  // solve loop, then surface the retryable error path so the user can start a
  // fresh challenge. Once won there's nothing to cap (socket already detached).
  private onSessionExpired = (): void => {
    this.sessionTimer = null
    if (this.store.getState().won) return
    this.dragging = false
    this.removeScrollWatch()
    this.cancelRaf()
    this.stopFlush()
    this.sampleBuffer = []
    this.lastBuffered = null
    this.store.dispatch({
      type: 'error',
      message: 'puzzle timed out \u2014 give it another go',
      retry: true,
    })
    // Close the socket; the server enforces its own (slightly longer) cap too.
    this.teardown?.()
    this.teardown = null
  }

  private cancelRaf = (): void => {
    if (this.raf != null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
  }
}
