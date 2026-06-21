// Pure behavioural-accrual core for the puzzle Durable Object.
//
// The Worker measures the drag itself (samples, path, duration) so the human-
// motion gate and the pre-win "hot" preview are server-truth. The client now
// transmits pointer samples BATCHED (one socket frame holding many samples)
// instead of one frame per sample, so this module folds a whole batch into the
// session accumulators EXACTLY as the old one-sample-per-message path did:
//
//   - `samples` is incremented once PER sample (never per batch) — the gate
//     thresholds (MIN_SAMPLES) keep counting per sample.
//   - `path` accumulates the distance between CONSECUTIVE samples, with no jump
//     added before the very first sample of the session (mirrors the original
//     `if (samples > 0)` guard).
//   - hotness is decided ONCE off the LAST sample in the batch (at most one
//     `hot` per message), so a batch can't be used to emit many oracle probes.
//
// Kept pure + dependency-free (like hot.ts) so it runs identically in the Worker
// and under vitest without Cloudflare globals.

import { decideHot, type HotGateFloors } from './hot'
import type { Point } from './types'

// The mutable behavioural accumulators a session carries on its socket
// attachment. A structural subset of the Worker's Session, so the Session can be
// passed straight in.
export interface MoveAccumulators {
  samples: number
  path: number
  firstT: number
  lastT: number
  lastX: number
  lastY: number
}

export interface AccrueParams {
  acc: MoveAccumulators // mutated in place
  samples: Point[]
  now: number
  tx: number
  ty: number
  tolerance: number
  jitter: number
  hotGate: HotGateFloors
  solved: boolean
  maxSamples: number // close-the-socket ceiling on cumulative samples
}

export interface AccrueResult {
  hot: boolean | null // null when solved or empty batch — emit nothing
  capExceeded: boolean // cumulative samples now exceed maxSamples → close
}

// Fold a batch of pointer samples into `acc`, returning the (single) hot
// decision off the last sample and whether the per-session sample cap is now
// exceeded. Mutates `acc`.
export const accrueMoveSamples = (p: AccrueParams): AccrueResult => {
  const { acc, samples, now } = p
  if (samples.length === 0) {
    return { hot: null, capExceeded: acc.samples > p.maxSamples }
  }
  if (!acc.firstT) acc.firstT = now
  for (const s of samples) {
    if (acc.samples > 0) acc.path += Math.hypot(s.x - acc.lastX, s.y - acc.lastY)
    acc.samples += 1
    acc.lastX = s.x
    acc.lastY = s.y
  }
  acc.lastT = now

  const capExceeded = acc.samples > p.maxSamples
  if (p.solved) return { hot: null, capExceeded }

  const last = samples[samples.length - 1]
  const hot = decideHot({
    dist: Math.hypot(last.x - p.tx, last.y - p.ty),
    tolerance: p.tolerance,
    jitter: p.jitter,
    samples: acc.samples,
    path: acc.path,
    elapsedMs: now - acc.firstT,
    floors: p.hotGate,
  })
  return { hot, capExceeded }
}

// Wall-clock session guard. True once the connection has outlived its cap and
// the socket should be closed. Anchored at the connection's accept time.
export const sessionExpired = (
  now: number,
  startT: number,
  maxMs: number,
): boolean => now - startT > maxMs

// Normalise an inbound move message to an array of samples. Accepts the batched
// `samples: [...]` shape and stays backward-compatible with a single `{x, y}`
// move. Filters out malformed entries so a bad sample can't poison the batch.
export const normaliseSamples = (msg: {
  x?: number
  y?: number
  samples?: unknown
}): Point[] => {
  if (Array.isArray(msg.samples)) {
    const out: Point[] = []
    for (const s of msg.samples) {
      if (
        s &&
        typeof (s as Point).x === 'number' &&
        typeof (s as Point).y === 'number'
      ) {
        out.push({ x: (s as Point).x, y: (s as Point).y })
      }
    }
    return out
  }
  if (typeof msg.x === 'number' && typeof msg.y === 'number') {
    return [{ x: msg.x, y: msg.y }]
  }
  return []
}
