import { describe, expect, it } from 'vitest'
import type { HotGateFloors } from './hot'
import {
  accrueMoveSamples,
  normaliseSamples,
  sessionExpired,
  type MoveAccumulators,
} from './session'
import type { Point } from './types'

const FLOORS: HotGateFloors = { minSamples: 5, minPath: 0.06, minMs: 300 }

const freshAcc = (): MoveAccumulators => ({
  samples: 0,
  path: 0,
  firstT: 0,
  lastT: 0,
  lastX: 0,
  lastY: 0,
})

const base = (acc: MoveAccumulators, samples: Point[], now: number) => ({
  acc,
  samples,
  now,
  tx: 0.5,
  ty: 0.5,
  tolerance: 0.06,
  jitter: 1,
  hotGate: FLOORS,
  solved: false,
  maxSamples: 9_000,
})

describe('accrueMoveSamples — gate-preserving batch accrual', () => {
  it('counts samples per sample and path between consecutive samples', () => {
    const acc = freshAcc()
    accrueMoveSamples(
      base(
        acc,
        [
          { x: 0, y: 0 },
          { x: 0, y: 0.1 },
          { x: 0, y: 0.3 },
        ],
        1000,
      ),
    )
    expect(acc.samples).toBe(3)
    // No jump added before the first sample; 0.1 + 0.2 between the next two.
    expect(acc.path).toBeCloseTo(0.3, 6)
    expect(acc.lastX).toBe(0)
    expect(acc.lastY).toBe(0.3)
    expect(acc.firstT).toBe(1000)
    expect(acc.lastT).toBe(1000)
  })

  it('is identical whether samples arrive batched or one-per-message', () => {
    const stream: Point[] = [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.15 },
      { x: 0.25, y: 0.4 },
      { x: 0.5, y: 0.5 },
    ]

    const batched = freshAcc()
    accrueMoveSamples(base(batched, stream, 2000))

    const single = freshAcc()
    for (const s of stream) accrueMoveSamples(base(single, [s], 2000))

    expect(single.samples).toBe(batched.samples)
    expect(single.path).toBeCloseTo(batched.path, 9)
    expect(single.lastX).toBe(batched.lastX)
    expect(single.lastY).toBe(batched.lastY)
  })

  it('decides hot off the LAST sample, once per call', () => {
    const acc = freshAcc()
    acc.firstT = 0 // first batch will set it
    // Enough samples/path/time to clear the gate; last sample lands on target.
    const res = accrueMoveSamples({
      ...base(
        acc,
        [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.3 },
          { x: 0.5, y: 0.5 }, // on target → hot
        ],
        500,
      ),
      // pre-seed accrual so the gate (>=5 samples) is cleared by this batch
    })
    // Only 3 samples here — gate not cleared → not hot yet despite on-target.
    expect(res.hot).toBe(false)

    // Add more samples to clear the gate (>=5 samples, >=300ms since firstT);
    // last sample on target → hot true.
    const res2 = accrueMoveSamples(
      base(
        acc,
        [
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.5 },
        ],
        900,
      ),
    )
    expect(acc.samples).toBeGreaterThanOrEqual(FLOORS.minSamples)
    expect(res2.hot).toBe(true)
  })

  it('does not emit hot when solved', () => {
    const acc = freshAcc()
    const res = accrueMoveSamples({
      ...base(acc, [{ x: 0.5, y: 0.5 }], 1000),
      solved: true,
    })
    expect(res.hot).toBeNull()
    expect(acc.samples).toBe(1) // still accrues behaviour
  })

  it('flags capExceeded once cumulative samples pass the ceiling', () => {
    const acc = freshAcc()
    acc.samples = 8_999
    const res = accrueMoveSamples({
      ...base(acc, [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }], 1000),
      maxSamples: 9_000,
    })
    expect(acc.samples).toBe(9_001)
    expect(res.capExceeded).toBe(true)
  })

  it('does not flag capExceeded for a normal session', () => {
    const acc = freshAcc()
    const res = accrueMoveSamples(base(acc, [{ x: 0.1, y: 0.1 }], 1000))
    expect(res.capExceeded).toBe(false)
  })
})

describe('sessionExpired', () => {
  it('is false within the cap and true once past it', () => {
    expect(sessionExpired(1000 + 124_000, 1000, 125_000)).toBe(false)
    expect(sessionExpired(1000 + 125_001, 1000, 125_000)).toBe(true)
  })
})

describe('normaliseSamples', () => {
  it('passes through a batched samples array', () => {
    expect(
      normaliseSamples({ samples: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }),
    ).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }])
  })

  it('accepts a single {x,y} move (backward-compat)', () => {
    expect(normaliseSamples({ x: 0.1, y: 0.2 })).toEqual([{ x: 0.1, y: 0.2 }])
  })

  it('drops malformed entries and returns [] for junk', () => {
    expect(
      normaliseSamples({ samples: [{ x: 0.1, y: 0.2 }, { x: 'no' } as never, null as never] }),
    ).toEqual([{ x: 0.1, y: 0.2 }])
    expect(normaliseSamples({})).toEqual([])
  })
})
