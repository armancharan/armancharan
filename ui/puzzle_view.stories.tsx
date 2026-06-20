import type { Meta, StoryObj } from '@storybook/react'
import { useEffect, useRef, type JSX } from 'react'
import { selectViewModel } from '../lib/puzzle/presenter'
import { initialPuzzleState, puzzleReducer } from '../lib/puzzle/store'
import type { PuzzleAction, PuzzleState } from '../lib/puzzle/types'
import type { PuzzleActions, PuzzleRefs } from '../lib/puzzle/use_puzzle'
import { ASPECT, PuzzleView, type PuzzleViewProps } from './puzzle_view'

// Build a real PuzzleState by replaying actions through the real reducer, then
// derive the view model exactly as the app does — so every story is faithful.
const state = (...actions: PuzzleAction[]): PuzzleState =>
  actions.reduce(puzzleReducer, initialPuzzleState)

const vmFrom = (...actions: PuzzleAction[]) => selectViewModel(state(...actions))

const BOARD_W = 392 // 440px modal − 2×24px padding

const ready: PuzzleAction = {
  type: 'ready',
  index: 0,
  seed: 7,
  radius: 0.184,
  tolerance: 0.06,
}
const measure: PuzzleAction = { type: 'setBoardWidth', width: BOARD_W }
const solve: PuzzleAction = {
  type: 'solved',
  token: 'demo-token',
  target: { x: 0.5, y: 0.35 },
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
const RenderPuzzle = (args: PuzzleViewProps) => {
  const piece = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = piece.current
    if (!el || !args.vm.pieceVisible) return
    const w = args.vm.boardW
    const h = w * ASPECT
    const r = args.vm.pieceSizePx / 2
    el.style.transform = `translate3d(${args.position.x * w - r}px, ${
      args.position.y * h - r
    }px, 0)`
  })
  return <PuzzleView {...args} refs={{ ...args.refs, piece }} />
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

// The state under review: the socket is connecting and we show "warming up…".
export const WarmingUp: Story = {
  args: { vm: vmFrom() },
}

// Connection failed — shows the message + the one-tap "give it another go" CTA,
// over the same loading backdrop.
export const ConnectionError: Story = {
  args: {
    vm: vmFrom({
      type: 'error',
      message: 'could not reach the puzzle',
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
    position: { x: 0.5, y: 0.35 }, // the revealed target
  },
}

// Solved, but the signup was rejected because the solve token lapsed — the
// below-form "give it another go" CTA resets the puzzle.
export const ExpiredTokenError: Story = {
  args: {
    vm: vmFrom(ready, measure, solve, {
      type: 'error',
      message: 'puzzle check expired',
      retry: true,
    }),
    position: { x: 0.5, y: 0.35 },
  },
}

// After a successful signup.
export const Done: Story = {
  args: { vm: vmFrom(ready, measure, solve, { type: 'submitted' }) },
}
