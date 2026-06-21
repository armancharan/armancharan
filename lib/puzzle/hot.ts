// Pure decision for the pre-win "hot" (white-shard) drag preview.
//
// The client must never learn the target before solving, so pre-win hotness has
// to come from the Worker as a per-move boolean. A naive "within tolerance" flag
// would leak the answer: a script could sweep the board and binary-search the
// disc to triangulate the target to ~tolerance precision without moving like a
// human. This module hardens that signal two ways so it stays a UX nicety, not
// an oracle:
//
//   1. GATE on human-like motion — no positive hot is emitted until the session
//      has accrued some samples AND path AND elapsed time. An instantaneous,
//      teleporting probe therefore gets nothing back to triangulate against.
//   2. JITTER the boundary — the comparison uses tolerance scaled by a stable
//      per-session factor (~±15%), so the exact tolerance radius can't be
//      pinpointed by probing where the flag flips.
//
// Turnstile + single-use D1 solve tokens + rate limiting + the attempt cap remain
// the real wall; this just keeps the preview from being a cheap triangulation
// oracle. Pure + dependency-free so it runs identically in the Worker and under
// vitest.

export interface HotGateFloors {
  minSamples: number
  minPath: number
  minMs: number
}

// Map a uniform random in [0, 1) to a stable per-session boundary multiplier in
// [0.85, 1.15]. Derived ONCE per session (stored on the socket attachment) so it
// can't be averaged out by repeated probing within a single session.
export const hotJitter = (rand: number): number => 0.85 + rand * 0.3

export interface HotDecisionInput {
  dist: number // distance from shard centre to the secret target (normalised)
  tolerance: number // base on-target tolerance radius
  jitter: number // per-session multiplier from hotJitter()
  samples: number // pointer samples accrued so far
  path: number // cumulative normalised path length so far
  elapsedMs: number // time since the first pointer sample
  floors: HotGateFloors // minimum behaviour before any positive hot
}

// Decide whether the shard is "hot" for this move. Returns false until the
// behavioural gate is cleared, then compares against the jittered tolerance.
export const decideHot = (input: HotDecisionInput): boolean => {
  const gated =
    input.samples >= input.floors.minSamples &&
    input.path >= input.floors.minPath &&
    input.elapsedMs >= input.floors.minMs
  if (!gated) return false
  return input.dist <= input.tolerance * input.jitter
}
