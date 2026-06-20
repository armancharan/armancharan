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

// On compact (phone-sized) boards the shard becomes a small, fiddly touch
// target, so we scale it up. Desktop boards (the 440px-capped modal yields a
// ~392px board) stay below the breakpoint untouched; phones (board ≲ 350px)
// get the larger shard. This only affects rendered size + centring — never the
// secret target or the tolerance zone, so it can't change puzzle difficulty.
export const COMPACT_BOARD_PX = 360
export const COMPACT_PIECE_SCALE = 1.4

// Effective (normalised) shard radius for a given board width. Pure so the view
// (sizing) and the controller (positioning) derive the exact same value.
export const effectivePieceRadius = (baseRadius: number, boardW: number): number =>
  boardW > 0 && boardW < COMPACT_BOARD_PX ? baseRadius * COMPACT_PIECE_SCALE : baseRadius

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
}): PointerUpDecision => {
  const { won, solved, down, up, centre, target, tolerance, slop = TAP_SLOP } = args
  const reveal = isTap(down, up, slop)

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
