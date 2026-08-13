'use client'

import { track } from '@vercel/analytics'
import { useEffect, useState, type ReactNode } from 'react'
import { usePuzzle } from '../lib/puzzle/use_puzzle'
import { ASPECT, PuzzleView } from './puzzle_view'

/**
 * Caption + optional cover image. Both open the same Express Interest
 * modal (puzzle → signup), matching the tabawake image→link pattern.
 */
export const CloudPuzzleSignup = ({
  cover,
}: {
  cover?: ReactNode
} = {}) => {
  const [open, setOpen] = useState(false)
  const openModal = () => {
    track('express_interest_open', { project: 'agentic-engineering-101' })
    setOpen(true)
  }
  return (
    <>
      <div className="text-secondary text-[13px] mb-4">
        {'agentic engineering 101 \u2014 '}
        <button
          type="button"
          onClick={openModal}
          style={{ font: 'inherit' }}
          className="inline cursor-pointer align-baseline text-primary underline decoration-from-font underline-offset-2 transition-opacity hover:opacity-70"
        >
          express interest {'\u2192'}
        </button>
      </div>
      {cover ? (
        <button
          type="button"
          onClick={openModal}
          aria-label="Express interest in agentic engineering 101"
          className="block w-full max-w-4xl cursor-pointer appearance-none border-0 bg-transparent p-0 text-left"
        >
          {cover}
        </button>
      ) : null}
      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <Puzzle onClose={() => setOpen(false)} />
        </Modal>
      ) : null}
    </>
  )
}

const Modal = ({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80">
      <div
        className="relative z-10 flex min-h-full flex-col items-center justify-start px-4 pb-4 pt-[100px]"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[440px] select-none border border-primary bg-background p-6"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="close"
            onClick={onClose}
            className="absolute right-3 top-2 text-[20px] leading-none text-secondary transition-opacity hover:opacity-70"
          >
            {'\u00d7'}
          </button>
          <div className="mb-5 flex min-h-[42px] flex-col justify-center border-b border-[rgba(255,255,255,0.14)] pb-5 pr-6">
            <h2 className="text-[17px] font-medium italic leading-none text-primary">
              Express Interest
            </h2>
            <p className="mt-2 text-[11px] tracking-[0.12em] text-secondary">
              agentic engineering 101
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

// Container: wires the live controller (socket/store/services) to the view.
const Puzzle = ({ onClose }: { onClose: () => void }) => {
  // One hook gives the view everything: a derived view model, refs to wire,
  // bound actions, and the (imperative) shard centre for the solve burst.
  const puzzle = usePuzzle({ aspect: ASPECT })
  return <PuzzleView {...puzzle} onClose={onClose} />
}
