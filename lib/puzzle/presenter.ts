// The presenter: pure functions that mediate between the outside world (server
// messages, pointer interactions) and the store, plus the selector that derives
// the view model. Holding this logic here (not in the React component) keeps it
// unit-testable and the view thin.

import { DEFAULT_PIECE_RADIUS, shouldUnsolve } from './geometry'
import { shardForSeed } from './shard'
import type {
  Point,
  PuzzleAction,
  PuzzleState,
  PuzzleViewModel,
  ServerMessage,
} from './types'

const INSTRUCTION_PLAYING =
  'a shard of sky has dislocated \u2014 drag it back to where it belongs'
const INSTRUCTION_SOLVED = 'nice \u2014 drop your email and you\u2019re in'

export { decidePointerUp } from './geometry'
export type { Placement, PointerUpDecision } from './geometry'

// Translate a raw server frame into a store action (or null to ignore).
export const interpretServerMessage = (raw: string): PuzzleAction | null => {
  let msg: ServerMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    return null
  }
  switch (msg.type) {
    case 'ready':
      return {
        type: 'ready',
        index: typeof msg.index === 'number' ? msg.index : 0,
        seed: typeof msg.seed === 'number' ? msg.seed : 1,
        radius: msg.piece?.radius ?? DEFAULT_PIECE_RADIUS,
        tolerance: typeof msg.tolerance === 'number' ? msg.tolerance : 0.06,
      }
    case 'prox':
      return { type: 'prox', hot: Boolean(msg.hot) }
    case 'solved':
      if (!msg.token || !msg.target) return null
      return { type: 'solved', token: msg.token, target: msg.target }
    case 'miss':
      return { type: 'miss', target: msg.target ?? null }
    default:
      return null
  }
}

// Derive everything the view renders from state — single source of truth, so the
// shard and the bottom form can never disagree. The component reads only this.
export const selectViewModel = (s: PuzzleState): PuzzleViewModel => {
  const solved = s.phase === 'solved'
  const hotOrSolved = solved || s.hot
  const formActive = solved
  const pieceSrc = s.pieceIndex == null ? null : `/pieces/piece-${s.pieceIndex}.webp`
  const pieceR = s.pieceRadius * s.boardW
  return {
    phase: s.phase,
    connecting: s.phase === 'connecting',
    done: s.phase === 'done',
    error: s.error,
    shardWhite: hotOrSolved,
    shadeHidden: hotOrSolved,
    // The scramble is only ever lifted by the explicit reveal toggle (a click),
    // never by hovering or by merely moving the shard.
    showFuzz: !s.revealed,
    pieceVisible: s.phase !== 'connecting' && s.boardW > 0 && pieceSrc != null,
    pieceSrc,
    shard: shardForSeed(s.pieceSeed),
    pieceSizePx: pieceR * 2,
    boardW: s.boardW,
    dragging: s.dragging,
    bgDim: s.bgFocus,
    formActive,
    formVisible: solved || s.hot,
    showTurnstile: formActive,
    email: s.email,
    submitting: s.submitting,
    canSubmit: formActive && !s.submitting && s.token != null,
    solved,
    instruction: solved ? INSTRUCTION_SOLVED : INSTRUCTION_PLAYING,
    connectingLabel: s.error ?? 'warming up\u2026',
    submitLabel: s.submitting ? 'sending\u2026' : 'join the list \u27e1',
  }
}

// Map an API failure reason to friendly copy. Pure, so it lives with the rest of
// the presentation logic rather than in the component.
export const humanError = (reason?: string): string => {
  if (!reason) return 'something went wrong, try again'
  if (reason === 'invalid_email') return 'that email looks off'
  if (reason === 'rate_limited') return 'easy there \u2014 try again in a minute'
  if (reason.startsWith('turnstile')) return 'bot check failed, refresh and retry'
  if (reason.startsWith('puzzle')) return 'puzzle check expired, give it another go'
  if (reason === 'storage_error')
    return 'signups aren\u2019t live yet \u2014 check back soon'
  return 'something went wrong, try again'
}

// During a drag, decide whether a solved shard has been pulled out of the zone.
export const resolvePointerMove = (
  state: PuzzleState,
  centre: Point,
): 'unsolve' | 'none' =>
  state.phase === 'solved' &&
  shouldUnsolve(centre, state.target, state.tolerance)
    ? 'unsolve'
    : 'none'
