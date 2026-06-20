import { describe, expect, it, vi } from 'vitest'
import { PuzzleController } from './controller'
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
  const controller = new PuzzleController({
    aspect: 1,
    getBoardEl: () => null,
    getPieceEl: () => null,
    subscribe,
    analytics,
    config: { wsUrl: () => '', siteKey: undefined },
  })
  return { controller, calls, tracked }
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
    expect(s.error).toBe('something went wrong, try again')
    expect(s.submitting).toBe(false)
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
