import type { Meta, StoryObj } from '@storybook/react'
import { useLayoutEffect, useRef, useState, type JSX } from 'react'
import { selectViewModel } from '../lib/puzzle/presenter'
import { initialPuzzleState, puzzleReducer } from '../lib/puzzle/store'
import type { PuzzleAction, PuzzleState } from '../lib/puzzle/types'
import type { PuzzleActions, PuzzleRefs } from '../lib/puzzle/use_puzzle'
import { ASPECT, PuzzleView, type PuzzleViewProps } from './puzzle_view'
import targetsData from '../worker/src/targets.json'

// Build a real PuzzleState by replaying actions through the real reducer, then
// derive the view model exactly as the app does — so every story is faithful.
const state = (...actions: PuzzleAction[]): PuzzleState =>
  actions.reduce(puzzleReducer, initialPuzzleState)

const vmFrom = (...actions: PuzzleAction[]) => selectViewModel(state(...actions))

const BOARD_W = 392 // 440px modal − 2×24px padding

// Solved stories place the shard at its *true* target so the crop blends
// seamlessly into the photo, exactly as a real solve looks. Targets come from
// the gitignored worker/src/targets.json (the secret answer coords; CI swaps in
// targets.example.json). Pick a piece near the photo's centre for framing, and
// degrade gracefully when only the single-target example is present.
const TARGETS = (targetsData.targets ?? []) as ReadonlyArray<{
  x: number
  y: number
}>
const SOLVED_INDEX = Math.min(7, Math.max(0, TARGETS.length - 1))
const SOLVED_TARGET = TARGETS[SOLVED_INDEX] ?? { x: 0.5, y: 0.35 }

const ready: PuzzleAction = {
  type: 'ready',
  index: SOLVED_INDEX,
  seed: 7,
  radius: 0.184,
  tolerance: 0.06,
}
const measure: PuzzleAction = { type: 'setBoardWidth', width: BOARD_W }
const solve: PuzzleAction = {
  type: 'solved',
  token: 'demo-token',
  target: SOLVED_TARGET,
}

const noop = () => {}
const stubActions: PuzzleActions = {
  onPointerDown: noop,
  onPointerMove: noop,
  onPointerUp: noop,
  toggleReveal: noop,
  toggleBgFocus: noop,
  setEmail: noop,
  submit: noop,
  retry: noop,
}
const stubRefs: PuzzleRefs = {
  board: { current: null },
  piece: { current: null },
  turnstile: { current: null },
}

// Renders the view and, when a shard is visible, places it imperatively with the
// SAME transform the controller uses (translate3d(x*w−r, y*h−r)) so shard-bearing
// states look exactly as they do live. `position` doubles as the shard's centre.
//
// The shard's size and position must be derived from the *actual* rendered board
// width — exactly as the live controller does via ResizeObserver. Trusting the
// fixture's nominal BOARD_W instead would overshoot whenever Storybook's canvas
// renders the modal narrower than the 440px ideal (the shard drifts down/right
// and stops aligning with the photo).
const RenderPuzzle = (args: PuzzleViewProps) => {
  const piece = useRef<HTMLDivElement>(null)
  const board = useRef<HTMLDivElement>(null)
  const [boardW, setBoardW] = useState(0)

  useLayoutEffect(() => {
    const el = board.current
    if (!el) return
    const measure = () => setBoardW(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const w = boardW || args.vm.boardW
  // pieceSizePx / boardW is the shard's diameter ratio; rescale it to the real
  // width so the crop is shown 1:1 with the photo (never magnified).
  const sizeRatio = args.vm.pieceSizePx / args.vm.boardW
  const vm = { ...args.vm, boardW: w, pieceSizePx: sizeRatio * w }

  useLayoutEffect(() => {
    const el = piece.current
    if (!el || !vm.pieceVisible || !w) return
    const h = w * ASPECT
    const r = vm.pieceSizePx / 2
    el.style.transform = `translate3d(${args.position.x * w - r}px, ${
      args.position.y * h - r
    }px, 0)`
  })

  return <PuzzleView {...args} vm={vm} refs={{ ...args.refs, piece, board }} />
}

// Frames the view in the real modal chrome (header + bordered black panel) so a
// story reads like the production dialog.
const ModalFrame = (Story: () => JSX.Element) => (
  <div className="w-full max-w-[440px] border border-primary bg-background p-6 text-primary">
    <div className="mb-5 flex min-h-[42px] flex-col justify-center border-b border-[rgba(255,255,255,0.14)] pb-5 pr-6">
      <h2 className="text-[17px] font-medium italic leading-none text-primary">
        Express Interest
      </h2>
      <p className="mt-2 text-[11px] tracking-[0.12em] text-secondary">
        agentic engineering 101
      </p>
    </div>
    <Story />
  </div>
)

const meta: Meta<typeof PuzzleView> = {
  title: 'Puzzle/PuzzleView',
  component: PuzzleView,
  render: args => <RenderPuzzle {...args} />,
  decorators: [ModalFrame],
  args: {
    refs: stubRefs,
    actions: stubActions,
    position: { x: 0.5, y: 0.756 }, // START (shard resting spot)
    siteKey: undefined,
    onClose: noop,
  },
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof PuzzleView>

// The state under review: the socket is connecting, so we show the animated
// line loader (no error text).
export const WarmingUp: Story = {
  args: { vm: vmFrom() },
}

// Connection failed — shows the message + the one-tap "try again" CTA, over the
// same loading backdrop.
export const ConnectionError: Story = {
  args: {
    vm: vmFrom({
      type: 'error',
      message: 'failed to load puzzle',
      retry: true,
    }),
  },
}

// Challenge loaded; shard at rest, scrambled (TV static) until revealed.
export const PlayingScrambled: Story = {
  args: { vm: vmFrom(ready, measure) },
}

// Same, but the crop is revealed (what you see after clicking the shard).
export const PlayingRevealed: Story = {
  args: { vm: vmFrom(ready, measure, { type: 'toggleReveal' }) },
}

// Solved: shard locked on target (white edge), form active and ready to submit.
export const Solved: Story = {
  args: {
    vm: vmFrom(ready, measure, solve),
    position: SOLVED_TARGET, // the revealed target — crop blends into the photo
  },
}

// Solved, but the signup was rejected because the solve token lapsed — the
// below-form "try again" CTA resets the puzzle.
export const ExpiredTokenError: Story = {
  args: {
    vm: vmFrom(ready, measure, solve, {
      type: 'error',
      message: 'puzzle check expired',
      retry: true,
    }),
    position: SOLVED_TARGET,
  },
}

// After a successful signup.
export const Done: Story = {
  args: { vm: vmFrom(ready, measure, solve, { type: 'submitted' }) },
}
