import { describe, expect, it } from 'vitest'
import { decideHot, hotJitter, type HotGateFloors } from './hot'

// Mirrors the worker's HOT_GATE (half the solve floors).
const FLOORS: HotGateFloors = { minSamples: 5, minPath: 0.06, minMs: 300 }
const TOLERANCE = 0.06

describe('hotJitter', () => {
  it('maps [0,1) into the [0.85, 1.15] band', () => {
    expect(hotJitter(0)).toBeCloseTo(0.85, 10)
    expect(hotJitter(0.5)).toBeCloseTo(1.0, 10)
    expect(hotJitter(1)).toBeCloseTo(1.15, 10)
  })
})

describe('decideHot', () => {
  const onTarget = {
    dist: 0, // dead on the target
    tolerance: TOLERANCE,
    jitter: 1,
    floors: FLOORS,
  }

  it('stays false before the behavioural gate is met, even when on-target', () => {
    // Too few samples / too little path / too little time — an instantaneous
    // probe must get nothing back, so no triangulation oracle.
    expect(
      decideHot({ ...onTarget, samples: 1, path: 0, elapsedMs: 0 }),
    ).toBe(false)
    expect(
      decideHot({ ...onTarget, samples: 100, path: 1, elapsedMs: 100 }),
    ).toBe(false) // time floor still unmet
    expect(
      decideHot({ ...onTarget, samples: 100, path: 0.01, elapsedMs: 1000 }),
    ).toBe(false) // path floor still unmet
  })

  it('emits true once gated and within the jittered tolerance', () => {
    expect(
      decideHot({ ...onTarget, samples: 5, path: 0.06, elapsedMs: 300 }),
    ).toBe(true)
  })

  it('compares against the jittered radius, not the raw tolerance', () => {
    const gated = { samples: 20, path: 0.5, elapsedMs: 1000, floors: FLOORS }
    // dist sits between the raw tolerance and a +15% jittered tolerance.
    const dist = TOLERANCE * 1.1
    expect(
      decideHot({ ...gated, dist, tolerance: TOLERANCE, jitter: 0.85 }),
    ).toBe(false) // shrunk boundary → out
    expect(
      decideHot({ ...gated, dist, tolerance: TOLERANCE, jitter: 1.15 }),
    ).toBe(true) // widened boundary → in
  })
})
