import { describe, expect, it } from 'vitest'
import { effectivePieceRadius } from './geometry'
import {
  humanError,
  interpretServerMessage,
  isRetryableReason,
  resolvePointerMove,
  selectViewModel,
} from './presenter'
import { initialPuzzleState, MAX_RETRIES, puzzleReducer } from './store'
import type { PuzzleState } from './types'

const playing = puzzleReducer(initialPuzzleState, {
  type: 'ready',
  index: 0,
  seed: 1,
  radius: 0.13,
  tolerance: 0.06,
})
const solved = puzzleReducer(playing, {
  type: 'solved',
  token: 'tok',
  target: { x: 0.4, y: 0.5 },
})

describe('interpretServerMessage', () => {
  it('ignores malformed JSON', () => {
    expect(interpretServerMessage('not json')).toBeNull()
  })
  it('maps ready with defaults', () => {
    const a = interpretServerMessage(
      JSON.stringify({ type: 'ready', index: 2, seed: 7, tolerance: 0.05, piece: { radius: 0.2 } }),
    )
    expect(a).toEqual({ type: 'ready', index: 2, seed: 7, radius: 0.2, tolerance: 0.05 })
  })
  it('maps the server hot message onto the prox action', () => {
    expect(interpretServerMessage(JSON.stringify({ type: 'hot', hot: true }))).toEqual({
      type: 'prox',
      hot: true,
    })
  })
  it('maps solved only with token and target', () => {
    expect(interpretServerMessage(JSON.stringify({ type: 'solved', token: 't' }))).toBeNull()
    expect(
      interpretServerMessage(
        JSON.stringify({ type: 'solved', token: 't', target: { x: 0.1, y: 0.2 } }),
      ),
    ).toEqual({ type: 'solved', token: 't', target: { x: 0.1, y: 0.2 } })
  })
  it('maps miss with and without a target', () => {
    expect(
      interpretServerMessage(JSON.stringify({ type: 'miss', target: { x: 0.3, y: 0.3 } })),
    ).toEqual({ type: 'miss', target: { x: 0.3, y: 0.3 } })
    expect(interpretServerMessage(JSON.stringify({ type: 'miss', reason: 'far' }))).toEqual({
      type: 'miss',
      target: null,
    })
  })
  it('ignores unknown types', () => {
    expect(interpretServerMessage(JSON.stringify({ type: 'whatever' }))).toBeNull()
  })
})

describe('selectViewModel', () => {
  it('playing + cold: scrambled, no form, grey shard', () => {
    const vm = selectViewModel(playing)
    expect(vm).toMatchObject({
      shardWhite: false,
      shadeHidden: false,
      showFuzz: true,
      formActive: false,
      formVisible: false,
      solved: false,
    })
  })

  it('playing + hot: form previews and shard whitens, but not active', () => {
    const hot = puzzleReducer(playing, { type: 'prox', hot: true })
    const vm = selectViewModel(hot)
    expect(vm.shardWhite).toBe(true)
    expect(vm.formVisible).toBe(true)
    expect(vm.formActive).toBe(false)
  })

  it('solved: form active and shard white', () => {
    const vm = selectViewModel(solved)
    expect(vm).toMatchObject({
      shardWhite: true,
      shadeHidden: true,
      formActive: true,
      formVisible: true,
      solved: true,
    })
  })

  it('lifts the scramble while the shard is actively dragged', () => {
    const dragging = puzzleReducer(
      puzzleReducer(playing, { type: 'dragStart' }),
      { type: 'dragMoved' },
    )
    expect(selectViewModel(dragging).showFuzz).toBe(false)
  })

  it('shows the scramble at rest before any reveal toggle (no hover reveal)', () => {
    expect(selectViewModel(playing).showFuzz).toBe(true)
  })

  it('only the explicit reveal toggle lifts the fuzz', () => {
    const revealed = puzzleReducer(playing, { type: 'toggleReveal' })
    expect(selectViewModel(revealed).showFuzz).toBe(false)
  })

  it('background focus dims the clouds without lifting the shard fuzz', () => {
    const dimmed = puzzleReducer(playing, { type: 'toggleBgFocus' })
    const vm = selectViewModel(dimmed)
    expect(vm.bgDim).toBe(true)
    expect(vm.showFuzz).toBe(true) // shard scramble unaffected
  })

  it('derives the crop url and size from index + measured board', () => {
    const measured = puzzleReducer(playing, { type: 'setBoardWidth', width: 400 })
    const vm = selectViewModel(measured)
    expect(vm.pieceSrc).toBe('/pieces/piece-0.webp')
    expect(vm.pieceVisible).toBe(true)
    expect(vm.pieceSizePx).toBeCloseTo(effectivePieceRadius(0.13, 400) * 400 * 2)
  })

  it('piece is not visible before the board is measured', () => {
    expect(selectViewModel(playing).pieceVisible).toBe(false) // boardW 0
  })

  it('canSubmit requires solved + a token + not in flight', () => {
    expect(selectViewModel(playing).canSubmit).toBe(false)
    expect(selectViewModel(solved).canSubmit).toBe(true)
    const sending = puzzleReducer(solved, { type: 'submitStart' })
    expect(selectViewModel(sending).canSubmit).toBe(false)
    expect(selectViewModel(sending).submitLabel).toBe('sending\u2026')
  })

  it('instruction copy follows phase', () => {
    expect(selectViewModel(playing).instruction).toContain('dislocated')
    expect(selectViewModel(solved).instruction).toContain('drop your email')
  })

  it('exposes the retry countdown and disables the CTA at 0', () => {
    expect(selectViewModel(initialPuzzleState).retriesLeft).toBe(MAX_RETRIES)
    expect(selectViewModel(initialPuzzleState).canRetry).toBe(true)

    let s = initialPuzzleState
    for (let i = 0; i < MAX_RETRIES; i++) s = puzzleReducer(s, { type: 'reset' })
    expect(selectViewModel(s).retriesLeft).toBe(0)
    expect(selectViewModel(s).canRetry).toBe(false)
  })
})

describe('humanError', () => {
  it('maps known reasons and falls back generically', () => {
    expect(humanError('invalid_email')).toContain('email')
    expect(humanError('rate_limited')).toContain('minute')
    expect(humanError('turnstile_failed')).toContain('bot check')
    expect(humanError('puzzle_expired')).toContain('puzzle')
    expect(humanError('storage_error')).toContain('check back')
    expect(humanError('something_unmapped')).toBe('something went wrong')
    expect(humanError(undefined)).toBe('something went wrong')
  })
})

describe('isRetryableReason', () => {
  it('flags only puzzle-token failures (a fresh solve fixes those)', () => {
    expect(isRetryableReason('puzzle_expired')).toBe(true)
    expect(isRetryableReason('puzzle_replay')).toBe(true)
    expect(isRetryableReason('invalid_email')).toBe(false)
    expect(isRetryableReason('rate_limited')).toBe(false)
    expect(isRetryableReason('turnstile_failed')).toBe(false)
    expect(isRetryableReason(undefined)).toBe(false)
  })
})

describe('resolvePointerMove', () => {
  it('is a no-op while merely playing', () => {
    expect(resolvePointerMove(playing, { x: 0.9, y: 0.9 })).toBe('none')
  })
  it('keeps the solve while inside the zone', () => {
    expect(resolvePointerMove(solved, { x: 0.42, y: 0.5 })).toBe('none')
  })
  it('unsolves once dragged out of the zone', () => {
    expect(resolvePointerMove(solved, { x: 0.7, y: 0.5 })).toBe('unsolve')
  })
})

// End-to-end of the pure model: a representative session never leaves the
// shard white while the form is inactive (the drift bug we guard against).
describe('state coherence', () => {
  it('shard whiteness and form activation never disagree on solve', () => {
    let s: PuzzleState = playing
    s = puzzleReducer(s, { type: 'prox', hot: true })
    s = puzzleReducer(s, { type: 'solved', token: 't', target: { x: 0.4, y: 0.5 } })
    const vm = selectViewModel(s)
    expect(vm.shardWhite).toBe(vm.formActive)
    // pulled out → both fall back together
    s = puzzleReducer(s, { type: 'unsolve' })
    const vm2 = selectViewModel(s)
    expect(vm2.shardWhite).toBe(false)
    expect(vm2.formActive).toBe(false)
  })

  // Regression: the "placed/white shard but disabled input" state. A hot drop
  // that the server rejects (in-zone behavioural miss) must return to a plainly
  // non-winning look — never white/placed with the form locked.
  it('a hot drop that misses returns to a non-winning look', () => {
    let s: PuzzleState = puzzleReducer(playing, { type: 'prox', hot: true })
    expect(selectViewModel(s).shardWhite).toBe(true) // preview while hot — ok
    s = puzzleReducer(s, { type: 'miss', target: { x: 0.4, y: 0.5 } })
    const vm = selectViewModel(s)
    expect(vm.shardWhite).toBe(false)
    expect(vm.formActive).toBe(false)
    expect(vm.formVisible).toBe(false)
  })

  // The win/unset/re-place cycle (local, post-detach) stays coherent: the form
  // is active iff placed, the cached token survives un-placement, and a resting
  // white shard always has an active form.
  it('drag-to-unset then re-place keeps form/shard/token coherent', () => {
    let s: PuzzleState = puzzleReducer(playing, {
      type: 'solved',
      token: 'tok',
      target: { x: 0.4, y: 0.5 },
    })
    const cycle: PuzzleState[] = [s]
    s = puzzleReducer(s, { type: 'unsolve' }) // pulled out → unplaced
    cycle.push(s)
    s = puzzleReducer(s, { type: 'place' }) // dropped back in → re-placed
    cycle.push(s)

    const [solvedS, unplacedS, replacedS] = cycle
    expect(selectViewModel(solvedS).canSubmit).toBe(true)
    expect(selectViewModel(unplacedS).canSubmit).toBe(false) // can't submit unplaced
    expect(unplacedS.token).toBe('tok') // but the win is retained
    expect(selectViewModel(replacedS).canSubmit).toBe(true) // and re-armable locally

    for (const st of cycle) {
      if (st.dragging) continue
      const vm = selectViewModel(st)
      if (vm.shardWhite) expect(vm.formActive).toBe(true)
      if (vm.formActive) expect(st.token).not.toBeNull()
    }
  })

  // Invariant across every reachable resting (non-dragging) state: a winning
  // look (white shard) implies the form is active. The only place white is
  // allowed without an active form is the transient hot preview *during* a drag.
  it('resting white shard implies an active form (no orphaned win look)', () => {
    const targets = [{ x: 0.4, y: 0.5 }]
    const sequences: PuzzleState[] = []
    let s: PuzzleState = playing
    sequences.push(s)
    s = puzzleReducer(s, { type: 'prox', hot: true })
    s = puzzleReducer(s, { type: 'miss', target: targets[0] })
    sequences.push(s) // missed → cold
    s = puzzleReducer(playing, { type: 'solved', token: 't', target: targets[0] })
    sequences.push(s) // solved
    s = puzzleReducer(s, { type: 'unsolve' })
    sequences.push(s) // unsolved
    for (const st of sequences) {
      if (st.dragging) continue
      const vm = selectViewModel(st)
      if (vm.shardWhite) expect(vm.formActive).toBe(true)
    }
  })
})
