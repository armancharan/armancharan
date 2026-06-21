// Shared types for the cloud-placement puzzle. Kept framework-agnostic so the
// store and presenter logic can be unit-tested without React or the DOM.

export type Phase = 'connecting' | 'playing' | 'solved' | 'done'

export interface Point {
  x: number
  y: number
}

// The discrete, render-affecting state of a puzzle session. The high-frequency
// drag *position* deliberately lives outside the store (it's driven imperatively
// for performance) — this only holds state that changes the rendered view.
export interface PuzzleState {
  phase: Phase
  hot: boolean // shard is within tolerance of the target (server-driven)
  revealed: boolean // focused (clear crop) vs scrambled fuzz
  bgFocus: boolean // background "focus mode" — dims the surrounding clouds
  dragging: boolean // a pointer is currently down on the shard
  dragMoved: boolean // the press has travelled far enough to be a real drag
  pieceIndex: number | null
  pieceSeed: number | null
  pieceRadius: number
  tolerance: number
  won: boolean // puzzle has been beaten once; token + target cached locally
  target: Point | null // known only once on-target (solve / on-target miss)
  token: string | null // signed solve token; gates the subscribe request
  error: string | null
  errorRetry: boolean // the error is fixable by resetting the puzzle (offer a CTA)
  retriesLeft: number // remaining "try again" reconnects before the budget is spent
  // Form / layout state — kept here so the view holds no local state and the
  // selector can derive everything it renders.
  email: string
  submitting: boolean
  turnstileToken: string | null // Cloudflare bot-check token for the signup
  boardW: number // measured board width in px (drives shard sizing)
}

export type PuzzleAction =
  | {
      type: 'ready'
      index: number
      seed: number
      radius: number
      tolerance: number
    }
  | { type: 'prox'; hot: boolean }
  | { type: 'solved'; token: string; target: Point }
  | { type: 'miss'; target: Point | null }
  | { type: 'dragStart' }
  | { type: 'dragMoved' }
  | { type: 'dragEnd' }
  | { type: 'toggleReveal' }
  | { type: 'toggleBgFocus' } // dim/undim the surrounding clouds (background only)
  | { type: 'place' } // local re-placement of an already-won puzzle (no server)
  | { type: 'unsolve' } // local un-placement; retains the cached win/token
  | { type: 'submitStart' }
  | { type: 'submitted' }
  | { type: 'reset' } // tear the session back to a fresh challenge (new token)
  | { type: 'error'; message: string | null; retry?: boolean }
  | { type: 'setEmail'; email: string }
  | { type: 'setTurnstileToken'; token: string | null }
  | { type: 'setBoardWidth'; width: number }

// Everything the view needs to render — derived purely from PuzzleState. The
// component reads only this; it never inspects raw state.
export interface PuzzleViewModel {
  phase: Phase
  connecting: boolean // socket not ready yet
  done: boolean // signed up — show the thank-you
  error: string | null
  errorRetry: boolean // show a "try again" CTA that resets the puzzle
  retriesLeft: number // remaining retries (drives the "try again (N)" countdown)
  canRetry: boolean // budget not yet spent — the CTA is still clickable
  // shard visuals
  shardWhite: boolean // white edge vs grey
  shadeHidden: boolean // drop the 20% shading
  showFuzz: boolean // scrambled overlay visible
  pieceVisible: boolean // shard mounted (board measured + crop known)
  pieceSrc: string | null // the crop image url
  shard: string // clip-path polygon for this session's seed
  pieceSizePx: number // rendered shard square size
  boardW: number
  dragging: boolean // pointer is down on the shard (cursor feedback)
  bgDim: boolean // dim the surrounding clouds (background focus mode)
  // form
  formActive: boolean // inputs enabled, full opacity
  formVisible: boolean // form shown (active or dimmed preview) vs the credit line
  showTurnstile: boolean // mount the Turnstile widget
  email: string
  submitting: boolean
  canSubmit: boolean // active, not in flight, and holding a solve token
  // copy
  solved: boolean
  instruction: string
  submitLabel: string
}

// Client -> server wire messages.
//
// Pointer movement is sent as a BATCH of samples coalesced over a short window
// (see PuzzleController) rather than one frame per socket frame, cutting send
// volume ~5x while preserving the ~60Hz behavioural stream the server measures.
export type ClientMessage =
  | { type: 'move'; samples: Point[] }
  | { type: 'release'; x: number; y: number }
  | { type: 'reset' }

// Server -> client wire messages.
export type ServerMessage =
  | { type: 'ready'; index?: number; seed?: number; tolerance?: number; piece?: { radius?: number } }
  // Per-move pre-win hotness preview. Hardened server-side (gated + jittered) so
  // it can't be used to triangulate the target — see worker/src/index.ts.
  | { type: 'hot'; hot?: boolean }
  | { type: 'solved'; token?: string; target?: Point }
  | { type: 'miss'; reason?: string; target?: Point }
