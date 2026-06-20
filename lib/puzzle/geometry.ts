// Pure geometry + interaction-decision helpers. These encode the reliability
// rules of the puzzle (tap vs drag, in-zone snapping, unset-on-leave) and are
// the primary surface covered by unit tests.

import type { Point } from './types'

// Shard's resting position: a gap below it ≈ 3/4 of its own height.
export const START: Point = { x: 0.5, y: 0.756 }

export const DEFAULT_PIECE_RADIUS = 0.13
export const DEFAULT_TOLERANCE = 0.06

// Normalised travel under which a press counts as a click, not a drag.
export const TAP_SLOP = 0.04

// Effective (normalised) shard radius for a given board width. The shard is
// rendered at exactly the radius it was cropped at, so the crop is shown 1:1
// (never magnified). To make the shard bigger, enlarge the captured region via
// `radius` in worker/src/puzzle.config.json and regenerate the crops. Kept as a
// helper so the view (sizing) and controller (positioning) derive one value.
export const effectivePieceRadius = (baseRadius: number, _boardW: number): number =>
  baseRadius

export const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

// A press that barely moved is a click (toggles focus), not a drag.
export const isTap = (down: Point, up: Point, slop = TAP_SLOP): boolean =>
  dist(down, up) <= slop

// Is a shard centre within tolerance of the target?
export const inZone = (centre: Point, target: Point, tolerance: number): boolean =>
  dist(centre, target) <= tolerance

// Has the shard been released off the board entirely?
export const offBoard = (centre: Point): boolean =>
  centre.x < 0 || centre.x > 1 || centre.y < 0 || centre.y > 1

// While dragging a solved shard, it only unsets once dragged OUT past tolerance;
// nudging it within the zone keeps it solved.
export const shouldUnsolve = (
  centre: Point,
  target: Point | null,
  tolerance: number,
): boolean => target != null && !inZone(centre, target, tolerance)

// Where the shard should settle on release. Derived purely from geometry +
// whether we already hold the answer — NEVER from the tap/drag classification.
// Recomputed on every release, so a sub-slop nudge can never leave the shard
// "moved but unjudged" (the old tap-shortcut bug).
export type Placement =
  | { kind: 'place'; target: Point } // resting in the zone (or still solved) → snap on & solve
  | { kind: 'dissolve' } // flung off the board → fade out, reset to START, unset
  | { kind: 'leave' } // on the board but out of zone → leave it where dropped, unset
  | { kind: 'ask' } // pre-win real drag → the server must judge it

// A pointer-up has two INDEPENDENT outcomes: a `reveal` toggle (a gesture
// question — was it a stationary click?) and a `placement` (a geometry
// question — where does the shard rest, and do we know the target?). Keeping
// them separate is what stops a tiny nudge from being mis-handled as "just a
// click" and stranding the shard off-target.
export interface PointerUpDecision {
  reveal: boolean
  placement: Placement
}

export const decidePointerUp = (args: {
  won: boolean
  solved: boolean // currently solved (i.e. it never left the zone during this drag)
  down: Point
  up: Point
  centre: Point
  target: Point | null
  tolerance: number
  slop?: number
  // True if the pointer EVER travelled past the slop at any point during the
  // gesture. A round-trip drag (out and back to ~origin) nets ~0 displacement,
  // so down-vs-up alone would misread it as a tap; this path-aware flag vetoes
  // the reveal so only a gesture that never moved counts as a click.
  moved?: boolean
}): PointerUpDecision => {
  const {
    won,
    solved,
    down,
    up,
    centre,
    target,
    tolerance,
    slop = TAP_SLOP,
    moved = false,
  } = args
  const reveal = !moved && isTap(down, up, slop)

  // Once won the target is cached, so placement is decided locally, purely from
  // where the shard actually rests — independent of whether it read as a tap.
  if (won && target) {
    if (solved || inZone(centre, target, tolerance)) {
      return { reveal, placement: { kind: 'place', target } }
    }
    if (offBoard(centre)) return { reveal, placement: { kind: 'dissolve' } }
    return { reveal, placement: { kind: 'leave' } }
  }

  // Pre-win: we don't know the target. A stationary click just toggles reveal;
  // anything flung off-board dissolves; a real in-board drag is sent for judging.
  if (reveal) return { reveal, placement: { kind: 'leave' } }
  if (offBoard(centre)) return { reveal, placement: { kind: 'dissolve' } }
  return { reveal, placement: { kind: 'ask' } }
}
