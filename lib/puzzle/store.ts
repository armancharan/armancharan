// Framework-agnostic store for the puzzle. The reducer is a pure function (the
// unit-tested core); createPuzzleStore wraps it in a tiny subscribe/dispatch
// container the React view binds to. No React, no DOM here.

import { DEFAULT_PIECE_RADIUS, DEFAULT_TOLERANCE } from './geometry'
import type { PuzzleAction, PuzzleState } from './types'

// How many consecutive "try again" reconnects the user gets before the CTA is
// disabled (and they're asked to refresh). The budget resets to this on every
// successful (re)connect — i.e. each time the session reaches `ready` — so only
// consecutive failures burn it down.
export const MAX_RETRIES = 3

export const initialPuzzleState: PuzzleState = {
  phase: 'connecting',
  hot: false,
  revealed: false,
  bgFocus: false,
  dragging: false,
  dragMoved: false,
  pieceIndex: null,
  pieceSeed: null,
  pieceRadius: DEFAULT_PIECE_RADIUS,
  tolerance: DEFAULT_TOLERANCE,
  won: false,
  target: null,
  token: null,
  error: null,
  errorRetry: false,
  retriesLeft: MAX_RETRIES,
  email: '',
  submitting: false,
  turnstileToken: null,
  boardW: 0,
}

export const puzzleReducer = (
  state: PuzzleState,
  action: PuzzleAction,
): PuzzleState => {
  switch (action.type) {
    case 'ready':
      return {
        ...state,
        phase: 'playing',
        pieceIndex: action.index,
        pieceSeed: action.seed,
        pieceRadius: action.radius,
        tolerance: action.tolerance,
        error: null,
        errorRetry: false,
        // A successful (re)connect refills the retry budget, so only consecutive
        // failures (which never reach `ready`) count against it.
        retriesLeft: MAX_RETRIES,
      }

    case 'prox':
      // Proximity only governs the (un-solved) playing state; once solved, the
      // shard's "hotness" is implied and not driven by the server stream.
      if (state.phase !== 'playing') return state
      if (state.hot === action.hot) return state
      return { ...state, hot: action.hot }

    case 'solved':
      // First (server-judged) win: cache the token AND the revealed target so
      // every later placement decision can be made locally, with the socket
      // detached. `won` stays true for the rest of the session.
      return {
        ...state,
        phase: 'solved',
        won: true,
        token: action.token,
        target: action.target,
        hot: true,
        revealed: true, // show the clean crop (still tap-toggleable)
        dragging: false,
        dragMoved: false,
      }

    case 'miss':
      // A miss is never a win. Clear the hot/preview look so the UI can never
      // settle into a solved-looking-but-inactive state, and leave the piece
      // where it was dropped. We deliberately do NOT cache or snap to the
      // target on a miss — that would both leak the answer and look "placed".
      // Only an authoritative `solved` snaps the piece and unlocks the form.
      return state.hot ? { ...state, hot: false } : state

    case 'dragStart':
      return { ...state, dragging: true, dragMoved: false }

    case 'dragMoved':
      return state.dragMoved ? state : { ...state, dragMoved: true }

    case 'dragEnd':
      // `hot` is a *drag-time* preview signal. Once the gesture ends, it may
      // only persist if we actually settled solved; otherwise clear it so we can
      // never rest as white-shard + visible-disabled-form (phase playing + hot).
      return {
        ...state,
        dragging: false,
        dragMoved: false,
        hot: state.phase === 'solved' ? state.hot : false,
      }

    case 'toggleReveal':
      return { ...state, revealed: !state.revealed }

    case 'toggleBgFocus':
      // Purely a background visual; never touches the shard's own reveal state.
      return { ...state, bgFocus: !state.bgFocus }

    case 'place':
      // Local re-placement of an already-won puzzle: re-light the win using the
      // CACHED token/target (no server, no new challenge). Safe — the token is
      // single-use server-side; toggling placement grants nothing extra.
      if (!state.won || state.phase === 'solved') return state
      return {
        ...state,
        phase: 'solved',
        hot: true,
        revealed: true,
        dragging: false,
        dragMoved: false,
      }

    case 'unsolve':
      // Pulled out of the zone: drop the win *look* and de-activate the form,
      // but KEEP the cached token/target so it can be re-placed locally. KEEP
      // the shard's reveal state too — scramble/clear is driven only by tapping
      // the shard, never as a side effect of dragging it off. Only meaningful
      // once won.
      if (!state.won || state.phase !== 'solved') return state
      return {
        ...state,
        phase: 'playing',
        hot: false,
      }

    case 'submitStart':
      return { ...state, submitting: true, error: null, errorRetry: false }

    case 'submitted':
      return { ...state, phase: 'done', submitting: false }

    case 'reset':
      // Throw the whole session back to a fresh challenge: drop the (possibly
      // expired) token/target/win and reconnect for a new puzzle. Keep the
      // measured board and the typed email so the user isn't made to redo those.
      // `reset` is dispatched once per consumed "try again", so this is where the
      // retry budget is decremented (clamped at 0). It refills again on `ready`.
      return {
        ...initialPuzzleState,
        boardW: state.boardW,
        email: state.email,
        retriesLeft: Math.max(0, state.retriesLeft - 1),
      }

    case 'error':
      // Any error also ends an in-flight submit; nothing else mid-submit.
      return {
        ...state,
        error: action.message,
        errorRetry: action.retry ?? false,
        submitting: false,
      }

    case 'setEmail':
      return state.email === action.email
        ? state
        : { ...state, email: action.email }

    case 'setTurnstileToken':
      return state.turnstileToken === action.token
        ? state
        : { ...state, turnstileToken: action.token }

    case 'setBoardWidth':
      return state.boardW === action.width
        ? state
        : { ...state, boardW: action.width }

    default:
      return state
  }
}

export interface PuzzleStore {
  getState: () => PuzzleState
  dispatch: (action: PuzzleAction) => void
  subscribe: (listener: () => void) => () => void
}

export const createPuzzleStore = (
  initial: PuzzleState = initialPuzzleState,
): PuzzleStore => {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    dispatch: action => {
      const next = puzzleReducer(state, action)
      if (next === state) return
      state = next
      listeners.forEach(l => l())
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
