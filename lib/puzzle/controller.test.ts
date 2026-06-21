import { describe, expect, it, vi } from 'vitest'
import { PuzzleController } from './controller'
import type { LoggingService } from './logging'
import { selectViewModel } from './presenter'
import type {
  AnalyticsService,
  SubscribeRequest,
  SubscribeResult,
  SubscribeService,
} from './services'

// A controller wired to fakes — no socket, no DOM, no network. Exercises the
// presenter-side orchestration (submit flow) end to end through the real store.
const makeController = (opts: {
  result?: SubscribeResult
  throws?: boolean
}) => {
  const calls: SubscribeRequest[] = []
  const subscribe: SubscribeService = {
    submit: async req => {
      calls.push(req)
      if (opts.throws) throw new Error('network')
      return opts.result ?? { ok: true }
    },
  }
  const tracked: Array<[string, Record<string, string> | undefined]> = []
  const analytics: AnalyticsService = {
    track: (e, p) => {
      tracked.push([e, p])
    },
  }
  const logger: LoggingService = { logError: vi.fn() }
  const controller = new PuzzleController({
    aspect: 1,
    getBoardEl: () => null,
    getPieceEl: () => null,
    subscribe,
    analytics,
    logger,
    config: { wsUrl: () => '', siteKey: undefined },
  })
  return { controller, calls, tracked, logger }
}

const arriveAtSolved = (controller: PuzzleController, email = 'me@x.co') => {
  controller.store.dispatch({
    type: 'ready',
    index: 0,
    seed: 1,
    radius: 0.13,
    tolerance: 0.06,
  })
  controller.store.dispatch({
    type: 'solved',
    token: 'solve-tok',
    target: { x: 0.4, y: 0.5 },
  })
  controller.setEmail(email)
}

describe('PuzzleController.submit', () => {
  it('does nothing without a solve token', async () => {
    const { controller, calls } = makeController({})
    await controller.submit('')
    expect(calls).toHaveLength(0)
    expect(controller.store.getState().submitting).toBe(false)
  })

  it('sends the right payload, finishes, and tracks on success', async () => {
    const { controller, calls, tracked } = makeController({ result: { ok: true } })
    arriveAtSolved(controller)
    controller.store.dispatch({ type: 'setTurnstileToken', token: 'cf-tok' })

    await controller.submit('  ') // honeypot value from the view

    expect(calls[0]).toEqual({
      email: 'me@x.co',
      honeypot: '  ',
      turnstileToken: 'cf-tok',
      solveToken: 'solve-tok',
    })
    expect(controller.store.getState().phase).toBe('done')
    expect(controller.store.getState().submitting).toBe(false)
    expect(tracked).toContainEqual([
      'subscribed',
      { project: 'agentic-engineering-101' },
    ])
  })

  it('maps a rejection to friendly copy and stays solved (not done)', async () => {
    const { controller } = makeController({
      result: { ok: false, reason: 'invalid_email' },
    })
    arriveAtSolved(controller)
    await controller.submit('')
    const s = controller.store.getState()
    expect(s.phase).toBe('solved')
    expect(s.submitting).toBe(false)
    expect(s.error).toContain('email')
  })

  it('surfaces a network throw as a generic error', async () => {
    const { controller } = makeController({ throws: true })
    arriveAtSolved(controller)
    await controller.submit('')
    const s = controller.store.getState()
    expect(s.error).toBe('something went wrong')
    expect(s.submitting).toBe(false)
  })

  it('logs the underlying error when submit throws', async () => {
    const { controller, logger } = makeController({ throws: true })
    arriveAtSolved(controller)
    await controller.submit('')
    expect(logger.logError).toHaveBeenCalledWith(
      'submit',
      expect.any(Error),
      expect.objectContaining({ project: 'agentic-engineering-101' }),
    )
  })

  it('ignores a second submit while one is in flight', async () => {
    let resolve!: (r: SubscribeResult) => void
    const subscribe: SubscribeService = {
      submit: () => new Promise<SubscribeResult>(r => (resolve = r)),
    }
    const controller = new PuzzleController({
      aspect: 1,
      getBoardEl: () => null,
      getPieceEl: () => null,
      subscribe,
      analytics: { track: vi.fn() },
      config: { wsUrl: () => '', siteKey: undefined },
    })
    arriveAtSolved(controller)

    const first = controller.submit('')
    expect(controller.store.getState().submitting).toBe(true)
    await controller.submit('') // should early-return, not a second request
    resolve({ ok: true })
    await first
    expect(controller.store.getState().phase).toBe('done')
  })
})

describe('PuzzleController.connect error logging', () => {
  it('logs the cause when the WebSocket constructor throws', () => {
    const logger: LoggingService = { logError: vi.fn() }
    const g = globalThis as unknown as { WebSocket?: unknown }
    const prev = g.WebSocket
    g.WebSocket = class {
      constructor() {
        throw new Error('boom')
      }
    }
    try {
      const controller = new PuzzleController({
        aspect: 1,
        getBoardEl: () => null,
        getPieceEl: () => null,
        analytics: { track: () => {} },
        logger,
        config: { wsUrl: () => 'wss://example.test/puzzle', siteKey: undefined },
      })
      controller.connect()
    } finally {
      g.WebSocket = prev
    }
    expect(logger.logError).toHaveBeenCalledWith(
      'connect',
      expect.any(Error),
      expect.objectContaining({ url: 'wss://example.test/puzzle' }),
    )
  })
})

describe('PuzzleController.retry', () => {
  it('resets a solved-but-rejected session and reconnects for a new token', () => {
    const { controller } = makeController({})
    arriveAtSolved(controller)
    controller.store.dispatch({ type: 'setBoardWidth', width: 320 })
    // an expired-token rejection leaves a retryable error on a solved session
    controller.store.dispatch({
      type: 'error',
      message: 'puzzle check expired',
      retry: true,
    })
    expect(selectViewModel(controller.store.getState()).errorRetry).toBe(true)

    controller.retry()

    const s = controller.store.getState()
    expect(s.token).toBeNull() // stale token dropped
    expect(s.target).toBeNull()
    expect(s.won).toBe(false)
    expect(s.email).toBe('me@x.co') // preserved across the reset
    expect(s.boardW).toBe(320) // preserved across the reset
    expect(s.phase).toBe('connecting') // reconnecting for a fresh challenge
  })
})

// Faithful drag simulation: stub rAF (manual flush) + minimal DOM so the pointer
// handlers run exactly as in the browser. A 100x100 board means clientX/100 maps
// straight to normalised coords.
const makeDragController = () => {
  let rafCb: ((t: number) => void) | undefined
  const g = globalThis as unknown as {
    requestAnimationFrame: (cb: (t: number) => void) => number
    cancelAnimationFrame: (id: number) => void
  }
  g.requestAnimationFrame = cb => {
    rafCb = cb
    return 1
  }
  g.cancelAnimationFrame = () => {
    rafCb = undefined
  }
  const flush = () => {
    const cb = rafCb
    rafCb = undefined
    cb?.(0)
  }

  const piece = { style: {} as Record<string, string> }
  const board = {
    clientWidth: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  }
  const controller = new PuzzleController({
    aspect: 1,
    getBoardEl: () => board as unknown as HTMLElement,
    getPieceEl: () => piece as unknown as HTMLElement,
    config: { wsUrl: () => '', siteKey: undefined },
    analytics: { track: () => {} },
  })
  controller.setBoardWidth(100)

  const target = { x: 0.4, y: 0.5 }
  const evt = (x: number, y: number) =>
    ({
      clientX: x,
      clientY: y,
      pointerId: 1,
      currentTarget: { setPointerCapture: () => {} } as unknown as Element,
    }) as const

  // Drag the shard from its current centre to (x,y) in px, then release there.
  const drag = (toX: number, toY: number, fromX: number, fromY: number) => {
    controller.onPointerDown(evt(fromX, fromY))
    controller.onPointerMove(evt(toX, toY))
    flush() // pump applies the new position to controller.pos
    controller.onPointerUp(evt(toX, toY))
  }

  return { controller, target, drag, flush, evt }
}

describe('PuzzleController drag-to-unset (local, post-win)', () => {
  const reachSolvedOnTarget = (c: PuzzleController, target = { x: 0.4, y: 0.5 }) => {
    c.store.dispatch({ type: 'ready', index: 0, seed: 1, radius: 0.13, tolerance: 0.06 })
    c.store.dispatch({ type: 'solved', token: 'tok', target })
  }

  it('places onto the target when dropped in the zone', () => {
    const { controller, drag } = makeDragController()
    reachSolvedOnTarget(controller)
    controller.store.dispatch({ type: 'unsolve' }) // start unplaced (won)
    // grab at start (~50,75.6) and drop right on the target (40,50)
    drag(40, 50, 50, 75.6)
    expect(controller.store.getState().phase).toBe('solved')
  })

  it('un-sets when a placed shard is dragged out of the zone', () => {
    const { controller, drag } = makeDragController()
    reachSolvedOnTarget(controller)
    // first, place it cleanly on target so controller.pos === target
    controller.store.dispatch({ type: 'unsolve' })
    drag(40, 50, 50, 75.6)
    expect(controller.store.getState().phase).toBe('solved')

    // now grab on the target and drag far out of the zone, release out there
    drag(85, 50, 40, 50)
    const s = controller.store.getState()
    expect(s.phase).toBe('playing') // UNSET
    expect(s.hot).toBe(false)
    expect(s.token).toBe('tok') // win retained for local re-placement
    expect(s.won).toBe(true)
  })

  it('snaps back (stays solved) when nudged but never leaving the zone', () => {
    const { controller, drag } = makeDragController()
    reachSolvedOnTarget(controller)
    controller.store.dispatch({ type: 'unsolve' })
    drag(40, 50, 50, 75.6) // place
    // small nudge that stays inside tolerance (0.06): 40→44 px = 0.04 < 0.06
    drag(44, 50, 40, 50)
    expect(controller.store.getState().phase).toBe('solved')
  })

  it('snaps a still-solved shard home when released a hair off the zone edge', () => {
    const { controller, evt, flush } = makeDragController()
    reachSolvedOnTarget(controller)
    controller.store.dispatch({ type: 'unsolve' })
    // place it cleanly on the target first
    controller.onPointerDown(evt(50, 75.6))
    controller.onPointerMove(evt(40, 50))
    flush()
    controller.onPointerUp(evt(40, 50))
    expect(controller.store.getState().phase).toBe('solved')

    // grab on target; the move sample stays *inside* tolerance (0.05 < 0.06) so
    // the live tracker keeps it solved, but the release lands just *outside*
    // (0.07 > 0.06). Must still snap home — never strand it glowing-but-unsnapped.
    controller.onPointerDown(evt(40, 50))
    controller.onPointerMove(evt(45, 50))
    flush()
    expect(controller.store.getState().phase).toBe('solved')
    controller.onPointerUp(evt(47, 50))
    const s = controller.store.getState()
    expect(s.phase).toBe('solved')
    expect(s.hot).toBe(true)
    expect(selectViewModel(s).formActive).toBe(true)
  })

  it('keeps the shard under the pointer when the page scrolls mid-drag', () => {
    // Regression: a scroll moves the board (and the board-anchored shard) without
    // firing a pointermove. If we keep re-applying the pre-scroll sample, the
    // shard drifts away from the finger by the scroll delta. The controller must
    // re-derive its position from the live pointer + a fresh rect on scroll.
    let rafCb: ((t: number) => void) | undefined
    const g = globalThis as unknown as {
      requestAnimationFrame: (cb: (t: number) => void) => number
      cancelAnimationFrame: (id: number) => void
      window?: unknown
    }
    g.requestAnimationFrame = cb => {
      rafCb = cb
      return 1
    }
    g.cancelAnimationFrame = () => {
      rafCb = undefined
    }
    const flush = () => {
      const cb = rafCb
      rafCb = undefined
      cb?.(0)
    }

    // Fake window so the drag's scroll listener can be captured and fired.
    const scrollListeners: Array<() => void> = []
    const prevWindow = g.window
    g.window = {
      addEventListener: (type: string, cb: () => void) => {
        if (type === 'scroll') scrollListeners.push(cb)
      },
      removeEventListener: (type: string, cb: () => void) => {
        if (type === 'scroll') {
          const i = scrollListeners.indexOf(cb)
          if (i >= 0) scrollListeners.splice(i, 1)
        }
      },
    }

    // Mutable rect: top moves up by the scroll delta, mimicking a page scroll.
    const rectState = { left: 0, top: 0, width: 100, height: 100 }
    const piece = { style: {} as Record<string, string> }
    const board = {
      clientWidth: 100,
      getBoundingClientRect: () => ({ ...rectState }),
    }
    const controller = new PuzzleController({
      aspect: 1,
      getBoardEl: () => board as unknown as HTMLElement,
      getPieceEl: () => piece as unknown as HTMLElement,
      config: { wsUrl: () => '', siteKey: undefined },
      analytics: { track: () => {} },
    })
    controller.setBoardWidth(100)
    controller.store.dispatch({
      type: 'ready',
      index: 0,
      seed: 1,
      radius: 0.13,
      tolerance: 0.06,
    })

    const evt = (x: number, y: number) =>
      ({
        clientX: x,
        clientY: y,
        pointerId: 1,
        currentTarget: { setPointerCapture: () => {} } as unknown as Element,
      }) as const
    const translateY = () => {
      const m = /translate3d\([^,]+,\s*([-\d.]+)px/.exec(piece.style.transform)
      return m ? parseFloat(m[1]) : NaN
    }

    // Grab the shard at its resting centre (offset 0) and let the pump place it.
    controller.onPointerDown(evt(50, 75.6))
    flush()
    const before = translateY()
    expect(Number.isNaN(before)).toBe(false)
    // The drag must have armed a scroll watcher.
    expect(scrollListeners.length).toBeGreaterThan(0)

    // Page scrolls up by 20px (board top goes 0 → -20). Finger stays put; only a
    // scroll fires — no pointermove.
    rectState.top = -20
    scrollListeners.forEach(cb => cb())
    flush()

    // The shard must move DOWN in board coords by exactly the scroll delta so it
    // stays under the finger on screen. Old behaviour: translateY unchanged.
    expect(translateY()).toBeCloseTo(before + 20, 4)

    controller.onPointerUp(evt(50, 75.6))
    // Watcher torn down when the drag ends.
    expect(scrollListeners.length).toBe(0)

    g.window = prevWindow
  })

  it('re-locks when dragged out and brought back onto the target in one gesture', () => {
    const { controller, evt, flush } = makeDragController()
    reachSolvedOnTarget(controller)
    controller.store.dispatch({ type: 'unsolve' })
    // place it first
    controller.onPointerDown(evt(50, 75.6))
    controller.onPointerMove(evt(40, 50))
    flush()
    controller.onPointerUp(evt(40, 50))
    expect(controller.store.getState().phase).toBe('solved')

    // grab on target, fling out (unsets live), then drag back into the zone and
    // release. The release is offset enough from the grab to read as a real drag
    // (not a tap) yet lands inside tolerance (0.05 < 0.06) → must LOCK IN.
    controller.onPointerDown(evt(40, 50))
    controller.onPointerMove(evt(85, 50)) // out of zone → live unset
    flush()
    expect(controller.store.getState().phase).toBe('playing')
    controller.onPointerMove(evt(45, 50)) // back into the zone
    flush()
    controller.onPointerUp(evt(45, 50)) // released in zone → must LOCK IN
    const s = controller.store.getState()
    expect(s.phase).toBe('solved') // not stranded "in position but dead"
    expect(s.hot).toBe(true)
    expect(selectViewModel(s).formActive).toBe(true)
  })
})

// Pre-win, the client has no target, so the white "hot" preview is driven solely
// by the server's per-move `hot` message arriving on the socket. These exercise
// the controller's onmessage path (not a direct store dispatch) so the once-won
// guard is covered too.
describe('PuzzleController server-driven hot (pre-win)', () => {
  class FakeSocket {
    static OPEN = 1
    readyState = 1
    onmessage: ((ev: { data: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onclose: ((ev: unknown) => void) | null = null
    sent: string[] = []
    closed = false
    constructor(public url: string) {}
    send(data: string): void {
      this.sent.push(data)
    }
    close(): void {
      this.closed = true
    }
  }

  const connectWithFakeSocket = (): {
    controller: PuzzleController
    socket: FakeSocket
    restore: () => void
  } => {
    const g = globalThis as unknown as { WebSocket?: unknown }
    const prev = g.WebSocket
    let socket!: FakeSocket
    g.WebSocket = class extends FakeSocket {
      constructor(url: string) {
        super(url)
        socket = this
      }
    }
    const controller = new PuzzleController({
      aspect: 1,
      getBoardEl: () => null,
      getPieceEl: () => null,
      analytics: { track: () => {} },
      logger: { logError: vi.fn() },
      config: { wsUrl: () => 'wss://example.test/puzzle', siteKey: undefined },
    })
    controller.connect()
    return { controller, socket, restore: () => (g.WebSocket = prev) }
  }

  const fireHot = (socket: FakeSocket, hot: boolean) =>
    socket.onmessage?.({ data: JSON.stringify({ type: 'hot', hot }) })

  it('lights and clears the shard from server hot messages while playing', () => {
    const { controller, socket, restore } = connectWithFakeSocket()
    try {
      controller.store.dispatch({
        type: 'ready',
        index: 0,
        seed: 1,
        radius: 0.13,
        tolerance: 0.06,
      })
      expect(controller.store.getState().hot).toBe(false)

      fireHot(socket, true)
      expect(controller.store.getState().hot).toBe(true)

      fireHot(socket, false)
      expect(controller.store.getState().hot).toBe(false)
    } finally {
      restore()
    }
  })

  it('ignores a server hot message once the puzzle is won', () => {
    const { controller, socket, restore } = connectWithFakeSocket()
    try {
      controller.store.dispatch({
        type: 'ready',
        index: 0,
        seed: 1,
        radius: 0.13,
        tolerance: 0.06,
      })
      // Win, then locally un-place so phase is 'playing' again but won stays true.
      controller.store.dispatch({
        type: 'solved',
        token: 'tok',
        target: { x: 0.4, y: 0.5 },
      })
      controller.store.dispatch({ type: 'unsolve' })
      const s = controller.store.getState()
      expect(s.phase).toBe('playing')
      expect(s.won).toBe(true)
      expect(s.hot).toBe(false)

      // A late/in-flight server hot must NOT override local post-win tracking.
      fireHot(socket, true)
      expect(controller.store.getState().hot).toBe(false)
    } finally {
      restore()
    }
  })
})

// Batched transmit + delta-gate + session cap. Wires a fake socket so we can
// inspect what's actually sent, manual rAF (to drive the pump), and fake timers
// (to drive the 75ms flush interval and the 120s session cap). A 100px board
// means clientX/100 maps straight to normalised coords; the delta threshold is
// 0.5/100 = 0.005 norm (0.5px).
describe('PuzzleController batched transmit + caps', () => {
  class FakeSocket {
    static OPEN = 1
    readyState = 1
    onmessage: ((ev: { data: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onclose: ((ev: unknown) => void) | null = null
    closed = false
    constructor(public url: string) {}
    send(_d: string): void {}
    close(): void {
      this.closed = true
      this.readyState = 3
    }
  }

  const setup = () => {
    vi.useFakeTimers()
    const g = globalThis as unknown as {
      WebSocket?: unknown
      requestAnimationFrame: (cb: (t: number) => void) => number
      cancelAnimationFrame: (id: number) => void
    }
    const prevWS = g.WebSocket
    const prevRaf = g.requestAnimationFrame
    const prevCancel = g.cancelAnimationFrame

    const sent: string[] = []
    let socket!: FakeSocket
    g.WebSocket = class extends FakeSocket {
      constructor(url: string) {
        super(url)
        socket = this
      }
      send(d: string): void {
        sent.push(d)
      }
    }
    // Manual rAF (override AFTER fake timers so our stub wins).
    let rafCb: ((t: number) => void) | undefined
    g.requestAnimationFrame = cb => {
      rafCb = cb
      return 1
    }
    g.cancelAnimationFrame = () => {
      rafCb = undefined
    }
    const flushRaf = () => {
      const cb = rafCb
      rafCb = undefined
      cb?.(0)
    }

    const piece = { style: {} as Record<string, string> }
    const board = {
      clientWidth: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    }
    const controller = new PuzzleController({
      aspect: 1,
      getBoardEl: () => board as unknown as HTMLElement,
      getPieceEl: () => piece as unknown as HTMLElement,
      config: { wsUrl: () => 'wss://example.test/puzzle', siteKey: undefined },
      analytics: { track: () => {} },
      logger: { logError: vi.fn() },
    })
    controller.setBoardWidth(100)
    controller.connect()
    controller.store.dispatch({
      type: 'ready',
      index: 0,
      seed: 1,
      radius: 0.13,
      tolerance: 0.06,
    })

    const evt = (x: number, y: number) =>
      ({
        clientX: x,
        clientY: y,
        pointerId: 1,
        currentTarget: { setPointerCapture: () => {} } as unknown as Element,
      }) as const

    const moves = () =>
      sent
        .map(s => JSON.parse(s) as { type: string; samples?: unknown[] })
        .filter(m => m.type === 'move')

    const restore = () => {
      g.WebSocket = prevWS
      g.requestAnimationFrame = prevRaf
      g.cancelAnimationFrame = prevCancel
      vi.useRealTimers()
    }
    return { controller, socket, sent, moves, flushRaf, evt, restore }
  }

  it('buffers per-frame samples and flushes them as ONE batched move', () => {
    const { controller, moves, flushRaf, evt, restore } = setup()
    try {
      controller.onPointerDown(evt(50, 50))
      flushRaf() // buffer the grab sample
      controller.onPointerMove(evt(60, 50))
      flushRaf()
      controller.onPointerMove(evt(70, 50))
      flushRaf()
      controller.onPointerMove(evt(80, 50))
      flushRaf()

      // Nothing sent until the batch window elapses.
      expect(moves()).toHaveLength(0)

      vi.advanceTimersByTime(80) // > BATCH_INTERVAL_MS (75)

      const m = moves()
      expect(m).toHaveLength(1) // ONE frame, not one-per-sample
      expect(Array.isArray(m[0].samples)).toBe(true)
      expect(m[0].samples!.length).toBe(4) // all four frames coalesced
    } finally {
      restore()
    }
  })

  it('delta-gates sub-threshold jitter out of the buffer', () => {
    const { controller, moves, flushRaf, evt, restore } = setup()
    try {
      controller.onPointerDown(evt(50, 50))
      flushRaf() // grab sample buffered
      // Each move is < 0.5px from the grab sample → all dropped.
      controller.onPointerMove(evt(50.1, 50))
      flushRaf()
      controller.onPointerMove(evt(50.2, 50))
      flushRaf()
      controller.onPointerMove(evt(50.3, 50))
      flushRaf()

      vi.advanceTimersByTime(80)
      const m = moves()
      expect(m).toHaveLength(1)
      expect(m[0].samples!.length).toBe(1) // only the grab sample survived
    } finally {
      restore()
    }
  })

  it('flushes immediately on release (no waiting for the batch window)', () => {
    const { controller, moves, flushRaf, evt, restore } = setup()
    try {
      controller.onPointerDown(evt(50, 50))
      flushRaf()
      controller.onPointerMove(evt(70, 50))
      flushRaf()

      // Release BEFORE advancing the batch timer — the final position must be
      // flushed right away, not held for up to 75ms.
      controller.onPointerUp(evt(70, 50))
      expect(moves().length).toBeGreaterThanOrEqual(1)

      const before = moves().length
      vi.advanceTimersByTime(200) // interval stopped → no further move frames
      expect(moves().length).toBe(before)
    } finally {
      restore()
    }
  })

  it('stops the session and surfaces the retry path after the time cap', () => {
    const { controller, socket, restore } = setup()
    try {
      vi.advanceTimersByTime(90_000) // SESSION_CAP_MS

      const s = controller.store.getState()
      expect(s.error).toContain('timed out')
      expect(s.errorRetry).toBe(true)
      expect(socket.closed).toBe(true)
    } finally {
      restore()
    }
  })

  it('does NOT trip the time cap once the puzzle is won (local play)', () => {
    const { controller, restore } = setup()
    try {
      controller.store.dispatch({
        type: 'solved',
        token: 'tok',
        target: { x: 0.4, y: 0.5 },
      })
      vi.advanceTimersByTime(90_000)
      expect(controller.store.getState().error).toBeNull()
    } finally {
      restore()
    }
  })
})

// The retry budget: each "try again" consumes one reconnect; once spent, retry()
// must NOT open a new socket. A successful reconnect (reaching `ready`) refills
// it. We count WebSocket constructions to prove whether a reconnect happened.
describe('PuzzleController retry budget', () => {
  class FakeSocket {
    static OPEN = 1
    readyState = 1
    onmessage: ((ev: { data: string }) => void) | null = null
    onerror: ((ev: unknown) => void) | null = null
    onclose: ((ev: unknown) => void) | null = null
    sent: string[] = []
    closed = false
    constructor(public url: string) {}
    send(d: string): void {
      this.sent.push(d)
    }
    close(): void {
      this.closed = true
      this.readyState = 3
    }
  }

  const connect = () => {
    const g = globalThis as unknown as { WebSocket?: unknown }
    const prev = g.WebSocket
    let count = 0
    g.WebSocket = class extends FakeSocket {
      constructor(url: string) {
        super(url)
        count++
      }
    }
    const controller = new PuzzleController({
      aspect: 1,
      getBoardEl: () => null,
      getPieceEl: () => null,
      analytics: { track: () => {} },
      logger: { logError: vi.fn() },
      config: { wsUrl: () => 'wss://example.test/puzzle', siteKey: undefined },
    })
    controller.connect()
    return { controller, restore: () => (g.WebSocket = prev), getCount: () => count }
  }

  it('counts down 3→2→1→0 and reconnects each time until spent', () => {
    const { controller, restore, getCount } = connect()
    try {
      expect(controller.store.getState().retriesLeft).toBe(3)
      const initial = getCount() // the on-mount connect

      controller.retry()
      expect(controller.store.getState().retriesLeft).toBe(2)
      controller.retry()
      expect(controller.store.getState().retriesLeft).toBe(1)
      controller.retry()
      expect(controller.store.getState().retriesLeft).toBe(0)

      // Three retries → three fresh sockets opened.
      expect(getCount()).toBe(initial + 3)
    } finally {
      restore()
    }
  })

  it('no-ops (no reconnect) once the budget is exhausted', () => {
    const { controller, restore, getCount } = connect()
    try {
      controller.store.dispatch({ type: 'reset' })
      controller.store.dispatch({ type: 'reset' })
      controller.store.dispatch({ type: 'reset' })
      expect(controller.store.getState().retriesLeft).toBe(0)

      const before = getCount()
      controller.retry() // exhausted → must not open a socket
      expect(getCount()).toBe(before)
      expect(controller.store.getState().retriesLeft).toBe(0)
    } finally {
      restore()
    }
  })

  it('refills the budget on a successful reconnect (ready)', () => {
    const { controller, restore } = connect()
    try {
      controller.retry()
      controller.retry()
      expect(controller.store.getState().retriesLeft).toBe(1)

      controller.store.dispatch({
        type: 'ready',
        index: 0,
        seed: 1,
        radius: 0.13,
        tolerance: 0.06,
      })
      expect(controller.store.getState().retriesLeft).toBe(3)
    } finally {
      restore()
    }
  })
})

describe('PuzzleController tap-vs-drag classification', () => {
  const ready = (c: PuzzleController) =>
    c.store.dispatch({
      type: 'ready',
      index: 0,
      seed: 1,
      radius: 0.13,
      tolerance: 0.06,
    })

  it('treats a long round-trip drag back to the origin as a drag, not a tap', () => {
    // Regression: net displacement (down vs up) is ~0 for an out-and-back drag,
    // so displacement-only logic toggles reveal as if it were a click. The
    // path-aware `moved` flag must keep it a drag.
    const { controller, evt, flush } = makeDragController()
    ready(controller)
    const before = controller.store.getState().revealed

    controller.onPointerDown(evt(50, 75.6)) // grab at the resting centre
    controller.onPointerMove(evt(10, 20)) // travel far from the origin
    flush()
    controller.onPointerMove(evt(50, 75.6)) // …then return to ~origin
    flush()
    controller.onPointerUp(evt(50, 75.6)) // release where we started

    expect(controller.store.getState().revealed).toBe(before) // NOT toggled
  })

  it('still toggles reveal on a genuine in-place tap', () => {
    const { controller, evt, flush } = makeDragController()
    ready(controller)
    const before = controller.store.getState().revealed

    controller.onPointerDown(evt(50, 75.6))
    flush() // no movement at all
    controller.onPointerUp(evt(50, 75.6))

    expect(controller.store.getState().revealed).toBe(!before) // toggled
  })
})
