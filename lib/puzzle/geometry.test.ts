import { describe, expect, it } from 'vitest'
import {
  TAP_SLOP,
  decidePointerUp,
  dist,
  inZone,
  isTap,
  offBoard,
  shouldUnsolve,
} from './geometry'

describe('dist', () => {
  it('is 0 for the same point', () => {
    expect(dist({ x: 0.3, y: 0.7 }, { x: 0.3, y: 0.7 })).toBe(0)
  })
  it('is euclidean', () => {
    expect(dist({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(0.5, 6)
  })
})

describe('isTap', () => {
  it('counts a tiny move as a tap', () => {
    expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 })).toBe(true)
  })
  it('counts travel beyond the slop as a drag', () => {
    expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.5 + TAP_SLOP + 0.01, y: 0.5 })).toBe(
      false,
    )
  })
  it('treats exactly-slop travel as a tap (inclusive)', () => {
    expect(isTap({ x: 0, y: 0 }, { x: TAP_SLOP, y: 0 })).toBe(true)
  })
})

describe('inZone', () => {
  const target = { x: 0.4, y: 0.5 }
  it('is true within tolerance', () => {
    expect(inZone({ x: 0.42, y: 0.5 }, target, 0.06)).toBe(true)
  })
  it('is false outside tolerance', () => {
    expect(inZone({ x: 0.6, y: 0.5 }, target, 0.06)).toBe(false)
  })
})

describe('offBoard', () => {
  it('detects coordinates outside [0,1]', () => {
    expect(offBoard({ x: -0.01, y: 0.5 })).toBe(true)
    expect(offBoard({ x: 0.5, y: 1.2 })).toBe(true)
  })
  it('accepts in-bounds coordinates', () => {
    expect(offBoard({ x: 0, y: 1 })).toBe(false)
  })
})

describe('shouldUnsolve', () => {
  const target = { x: 0.4, y: 0.5 }
  it('never unsolves without a target', () => {
    expect(shouldUnsolve({ x: 0.9, y: 0.9 }, null, 0.06)).toBe(false)
  })
  it('keeps the solve when nudged inside the zone', () => {
    expect(shouldUnsolve({ x: 0.43, y: 0.5 }, target, 0.06)).toBe(false)
  })
  it('unsolves when pulled out past tolerance', () => {
    expect(shouldUnsolve({ x: 0.7, y: 0.5 }, target, 0.06)).toBe(true)
  })
})

// Reveal (a gesture question) and placement (a geometry question) are decided
// independently. Crucially, placement is recomputed on EVERY release — a tiny
// nudge can never be shortcut as "just a click" and strand the shard off-target.
describe('decidePointerUp', () => {
  const target = { x: 0.4, y: 0.5 }
  const tolerance = 0.06

  describe('pre-win (target unknown → server judges)', () => {
    const base = { won: false, solved: false, target: null, tolerance }

    it('a stationary click only toggles reveal, stays put', () => {
      expect(
        decidePointerUp({
          ...base,
          down: { x: 0.5, y: 0.7 },
          up: { x: 0.505, y: 0.702 },
          centre: { x: 0.5, y: 0.7 },
        }),
      ).toEqual({ reveal: true, placement: { kind: 'leave' } })
    })

    it('a real in-board drag asks the server to judge (no reveal)', () => {
      expect(
        decidePointerUp({
          ...base,
          down: { x: 0.5, y: 0.7 },
          up: { x: 0.3, y: 0.4 },
          centre: { x: 0.3, y: 0.4 },
        }),
      ).toEqual({ reveal: false, placement: { kind: 'ask' } })
    })

    it('a drag off the board dissolves', () => {
      expect(
        decidePointerUp({
          ...base,
          down: { x: 0.5, y: 0.7 },
          up: { x: 1.3, y: 0.5 },
          centre: { x: 1.3, y: 0.5 },
        }),
      ).toEqual({ reveal: false, placement: { kind: 'dissolve' } })
    })
  })

  describe('post-win (target cached → judged locally)', () => {
    const base = { won: true, target, tolerance }

    it('a still-solved sub-slop nudge snaps home (the bug): place, even though it reads as a tap', () => {
      expect(
        decidePointerUp({
          ...base,
          solved: true,
          down: { x: 0.4, y: 0.5 },
          up: { x: 0.42, y: 0.5 }, // < slop → reveal true
          centre: { x: 0.42, y: 0.5 },
        }),
      ).toEqual({ reveal: true, placement: { kind: 'place', target } })
    })

    it('a real drag that lands in the zone re-places and snaps', () => {
      expect(
        decidePointerUp({
          ...base,
          solved: false,
          down: { x: 0.5, y: 0.7 },
          up: { x: 0.43, y: 0.5 },
          centre: { x: 0.43, y: 0.5 },
        }),
      ).toEqual({ reveal: false, placement: { kind: 'place', target } })
    })

    it('a drag out of the zone (already live-unset) is left unplaced', () => {
      expect(
        decidePointerUp({
          ...base,
          solved: false,
          down: { x: 0.4, y: 0.5 },
          up: { x: 0.8, y: 0.5 },
          centre: { x: 0.8, y: 0.5 },
        }),
      ).toEqual({ reveal: false, placement: { kind: 'leave' } })
    })

    it('a fling off the board dissolves and unsets', () => {
      expect(
        decidePointerUp({
          ...base,
          solved: false,
          down: { x: 0.4, y: 0.5 },
          up: { x: 1.4, y: 0.5 },
          centre: { x: 1.4, y: 0.5 },
        }),
      ).toEqual({ reveal: false, placement: { kind: 'dissolve' } })
    })
  })
})
