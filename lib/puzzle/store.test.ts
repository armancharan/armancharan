import { describe, expect, it } from 'vitest'
import {
  createPuzzleStore,
  initialPuzzleState,
  MAX_RETRIES,
  puzzleReducer,
} from './store'
import type { PuzzleState } from './types'

const ready = (s: PuzzleState = initialPuzzleState) =>
  puzzleReducer(s, {
    type: 'ready',
    index: 3,
    seed: 42,
    radius: 0.13,
    tolerance: 0.06,
  })

const solved = (s: PuzzleState) =>
  puzzleReducer(s, {
    type: 'solved',
    token: 'tok',
    target: { x: 0.4, y: 0.5 },
  })

describe('puzzleReducer', () => {
  it('reset drops the won session but keeps board + email', () => {
    let s = ready()
    s = solved(s)
    s = puzzleReducer(s, { type: 'setBoardWidth', width: 320 })
    s = puzzleReducer(s, { type: 'setEmail', email: 'me@x.co' })
    s = puzzleReducer(s, {
      type: 'error',
      message: 'puzzle check expired',
      retry: true,
    })
    expect(s.errorRetry).toBe(true)

    const r = puzzleReducer(s, { type: 'reset' })
    expect(r.phase).toBe('connecting')
    expect(r.token).toBeNull()
    expect(r.target).toBeNull()
    expect(r.won).toBe(false)
    expect(r.error).toBeNull()
    expect(r.errorRetry).toBe(false)
    expect(r.boardW).toBe(320) // preserved
    expect(r.email).toBe('me@x.co') // preserved
  })

  it('error carries the retry flag; submitStart clears it', () => {
    const e = puzzleReducer(initialPuzzleState, {
      type: 'error',
      message: 'nope',
      retry: true,
    })
    expect(e.errorRetry).toBe(true)
    const cleared = puzzleReducer(e, { type: 'submitStart' })
    expect(cleared.errorRetry).toBe(false)
    expect(cleared.error).toBeNull()
  })

  it('ready moves to playing and stores challenge params', () => {
    const s = ready()
    expect(s.phase).toBe('playing')
    expect(s.pieceIndex).toBe(3)
    expect(s.pieceSeed).toBe(42)
    expect(s.tolerance).toBe(0.06)
    expect(s.error).toBeNull()
  })

  it('prox only applies while playing', () => {
    expect(puzzleReducer(initialPuzzleState, { type: 'prox', hot: true }).hot).toBe(
      false,
    )
    expect(ready().hot).toBe(false)
    const hot = puzzleReducer(ready(), { type: 'prox', hot: true })
    expect(hot.hot).toBe(true)
  })

  it('prox is a no-op when unchanged (preserves reference)', () => {
    const s = ready()
    expect(puzzleReducer(s, { type: 'prox', hot: false })).toBe(s)
  })

  it('solved sets won, token, target, hot, revealed', () => {
    const s = solved(ready())
    expect(s.phase).toBe('solved')
    expect(s.won).toBe(true)
    expect(s.token).toBe('tok')
    expect(s.target).toEqual({ x: 0.4, y: 0.5 })
    expect(s.hot).toBe(true)
    expect(s.revealed).toBe(true)
    expect(s.dragging).toBe(false)
  })

  it('miss clears the hot preview and never caches the target (no win look)', () => {
    const hot = puzzleReducer(ready(), { type: 'prox', hot: true })
    const s = puzzleReducer(hot, { type: 'miss', target: { x: 0.2, y: 0.3 } })
    expect(s.phase).toBe('playing')
    expect(s.hot).toBe(false) // back to a non-winning look
    expect(s.target).toBeNull() // answer is never cached/snapped on a miss
  })

  it('miss is a no-op when already cold (stable reference)', () => {
    const base = ready()
    expect(puzzleReducer(base, { type: 'miss', target: null })).toBe(base)
    expect(puzzleReducer(base, { type: 'miss', target: { x: 0.2, y: 0.3 } })).toBe(
      base,
    )
  })

  it('unsolve un-places but RETAINS the cached win (token + target)', () => {
    const playing = ready()
    expect(puzzleReducer(playing, { type: 'unsolve' })).toBe(playing) // not won
    const s = puzzleReducer(solved(playing), { type: 'unsolve' })
    expect(s.phase).toBe('playing')
    expect(s.hot).toBe(false)
    expect(s.revealed).toBe(true) // reveal is tap-driven; dragging off never scrambles it
    // win stays cached so re-placement needs no server
    expect(s.won).toBe(true)
    expect(s.token).toBe('tok')
    expect(s.target).toEqual({ x: 0.4, y: 0.5 })
  })

  it('place re-lights a won-but-unplaced puzzle locally (no token needed)', () => {
    const unplaced = puzzleReducer(solved(ready()), { type: 'unsolve' })
    expect(unplaced.phase).toBe('playing')
    const replaced = puzzleReducer(unplaced, { type: 'place' })
    expect(replaced.phase).toBe('solved')
    expect(replaced.hot).toBe(true)
    expect(replaced.revealed).toBe(true)
    expect(replaced.token).toBe('tok') // same cached token
  })

  it('place is a no-op when not won, or already placed', () => {
    const playing = ready()
    expect(puzzleReducer(playing, { type: 'place' })).toBe(playing) // not won
    const solvedState = solved(playing)
    expect(puzzleReducer(solvedState, { type: 'place' })).toBe(solvedState) // already
  })

  it('toggleReveal flips reveal without touching background focus', () => {
    const s = puzzleReducer(ready(), { type: 'toggleReveal' })
    expect(s.revealed).toBe(true)
    expect(s.bgFocus).toBe(false)
  })

  it('toggleBgFocus flips background focus without touching the shard reveal', () => {
    const s = puzzleReducer(ready(), { type: 'toggleBgFocus' })
    expect(s.bgFocus).toBe(true)
    expect(s.revealed).toBe(false) // shard untouched
    expect(puzzleReducer(s, { type: 'toggleBgFocus' }).bgFocus).toBe(false)
  })

  it('drag lifecycle tracks dragging/dragMoved', () => {
    let s = puzzleReducer(ready(), { type: 'dragStart' })
    expect(s).toMatchObject({ dragging: true, dragMoved: false })
    s = puzzleReducer(s, { type: 'dragMoved' })
    expect(s.dragMoved).toBe(true)
    s = puzzleReducer(s, { type: 'dragEnd' })
    expect(s).toMatchObject({ dragging: false, dragMoved: false })
  })

  it('dragEnd clears a stale hot when not solved (no rest white+disabled form)', () => {
    // playing + hot (drag-time preview) → dragEnd must drop hot
    const hotPlaying = puzzleReducer(ready(), { type: 'prox', hot: true })
    expect(puzzleReducer(hotPlaying, { type: 'dragEnd' }).hot).toBe(false)
  })

  it('dragEnd keeps hot when actually solved', () => {
    const s = puzzleReducer(solved(ready()), { type: 'dragEnd' })
    expect(s.hot).toBe(true)
    expect(s.phase).toBe('solved')
  })

  it('submit lifecycle: start sets submitting, submitted clears it and finishes', () => {
    const started = puzzleReducer(solved(ready()), { type: 'submitStart' })
    expect(started.submitting).toBe(true)
    expect(started.error).toBeNull()
    const done = puzzleReducer(started, { type: 'submitted' })
    expect(done.phase).toBe('done')
    expect(done.submitting).toBe(false)
  })

  it('error sets the message and always ends an in-flight submit', () => {
    const started = puzzleReducer(solved(ready()), { type: 'submitStart' })
    const withErr = puzzleReducer(started, { type: 'error', message: 'boom' })
    expect(withErr.error).toBe('boom')
    expect(withErr.submitting).toBe(false) // never stuck "sending…"
    expect(puzzleReducer(withErr, { type: 'error', message: null }).error).toBeNull()
  })

  it('setEmail stores the value and no-ops when unchanged', () => {
    const s = puzzleReducer(initialPuzzleState, { type: 'setEmail', email: 'a@b.co' })
    expect(s.email).toBe('a@b.co')
    expect(puzzleReducer(s, { type: 'setEmail', email: 'a@b.co' })).toBe(s)
  })

  it('setTurnstileToken stores the token and no-ops when unchanged', () => {
    const s = puzzleReducer(initialPuzzleState, {
      type: 'setTurnstileToken',
      token: 'cf',
    })
    expect(s.turnstileToken).toBe('cf')
    expect(puzzleReducer(s, { type: 'setTurnstileToken', token: 'cf' })).toBe(s)
  })

  it('setBoardWidth stores the width and no-ops when unchanged', () => {
    const s = puzzleReducer(initialPuzzleState, { type: 'setBoardWidth', width: 400 })
    expect(s.boardW).toBe(400)
    expect(puzzleReducer(s, { type: 'setBoardWidth', width: 400 })).toBe(s)
  })

  it('starts with a full retry budget', () => {
    expect(initialPuzzleState.retriesLeft).toBe(MAX_RETRIES)
  })

  it('reset decrements the retry budget, clamped at 0', () => {
    let s = initialPuzzleState
    s = puzzleReducer(s, { type: 'reset' })
    expect(s.retriesLeft).toBe(MAX_RETRIES - 1)
    s = puzzleReducer(s, { type: 'reset' })
    s = puzzleReducer(s, { type: 'reset' })
    expect(s.retriesLeft).toBe(0) // 3 → 2 → 1 → 0
    s = puzzleReducer(s, { type: 'reset' })
    expect(s.retriesLeft).toBe(0) // never goes negative
  })

  it('ready refills the retry budget (only consecutive failures burn it)', () => {
    let s = puzzleReducer(initialPuzzleState, { type: 'reset' })
    s = puzzleReducer(s, { type: 'reset' })
    expect(s.retriesLeft).toBe(MAX_RETRIES - 2)
    s = ready(s)
    expect(s.retriesLeft).toBe(MAX_RETRIES)
  })
})

describe('createPuzzleStore', () => {
  it('notifies subscribers on real changes only', () => {
    const store = createPuzzleStore()
    let calls = 0
    const unsub = store.subscribe(() => calls++)
    store.dispatch({ type: 'ready', index: 0, seed: 1, radius: 0.1, tolerance: 0.06 })
    expect(store.getState().phase).toBe('playing')
    expect(calls).toBe(1)
    store.dispatch({ type: 'prox', hot: false }) // no-op
    expect(calls).toBe(1)
    unsub()
    store.dispatch({ type: 'prox', hot: true })
    expect(calls).toBe(1) // unsubscribed
  })
})
