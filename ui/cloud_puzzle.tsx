'use client'

import { track } from '@vercel/analytics'
import { useEffect, useState } from 'react'
import { usePuzzle } from '../lib/puzzle/use_puzzle'

const IMG = '/nuke-cloud.webp'
const ASPECT = 840 / 630 // portrait source image

// Shard edge: grey at rest, locks white when the server says you're on target.
const EDGE_COLD = 'rgba(170,170,170,.85)'
const EDGE_HOT = 'rgba(255,255,255,.98)'

// Shared geometry/typography for the paired email input + submit button so they
// stay identical. `rounded-none` + `appearance-none` force square corners even
// where the platform (Safari) would otherwise round native inputs/buttons.
const PAIR_CONTROL =
  'box-border h-[42px] appearance-none rounded-none border border-primary text-[15px] text-primary outline-none'

// Inline trigger that lives in the "coming soon" line and opens the modal.
export const CloudPuzzleSignup = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          track('express_interest_open', { project: 'agentic-engineering-101' })
          setOpen(true)
        }}
        style={{ font: 'inherit' }}
        className="inline cursor-pointer align-baseline text-primary underline decoration-from-font underline-offset-2 transition-opacity hover:opacity-70"
      >
        express interest {'\u2192'}
      </button>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
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
  )
}

const Puzzle = ({ onClose }: { onClose: () => void }) => {
  // One hook gives the view everything: a derived view model, refs to wire,
  // bound actions, and the (imperative) shard centre for the solve burst. No
  // local state, no fetch, no socket, no drag refs live here.
  const { vm, refs, actions, position, siteKey } = usePuzzle({ aspect: ASPECT })

  if (vm.done) {
    return (
      <div className="text-primary">
        <p className="mb-2 mt-2 text-[15px]">you{"'"}re on the list. talk soon.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 border border-primary px-5 py-2 text-[15px] transition-colors hover:bg-primary hover:text-background"
        >
          back to whatever you were doing {'\u21af'}
        </button>
      </div>
    )
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const honeypot =
      (e.currentTarget.elements.namedItem('website') as HTMLInputElement)?.value ??
      ''
    actions.submit(honeypot)
  }

  return (
    <div>
      <Styles />
      {siteKey ? (
        <script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          async
          defer
        />
      ) : null}

      <p className="mb-5 mt-5 flex min-h-[42px] items-center pr-6 text-[13px] text-secondary">
        {vm.instruction}
      </p>

      <div className="relative w-full">
        <div
          ref={refs.board}
          onClick={actions.toggleBgFocus}
          className="relative w-full cursor-pointer select-none overflow-hidden border border-[rgba(255,255,255,0.14)]"
          style={{ aspectRatio: '630 / 840' }}
        >
          <img
            src={IMG}
            alt="clouds from above"
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
            draggable={false}
            style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
          />
          {/* background focus: dims the surrounding clouds. Sits below the shard
              overlay (a later sibling), so the shard itself stays full-bright. */}
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            style={{
              opacity: vm.bgDim ? 0.5 : 0,
              transition: 'opacity .25s ease',
            }}
          />
          {vm.solved ? <Poof boardW={vm.boardW} pos={position} /> : null}
        </div>

        {vm.connecting ? (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <span className="bg-black/80 px-[6.5px] py-[4px] text-center text-[13px] text-white">
              {vm.connectingLabel}
            </span>
          </div>
        ) : null}

        {/* the shard lives in an overlay so it is never clipped while dragging */}
        <div className="pointer-events-none absolute inset-0">
          {vm.pieceVisible ? (
            <div
              ref={refs.piece}
              onPointerDown={actions.onPointerDown}
              onPointerMove={actions.onPointerMove}
              onPointerUp={actions.onPointerUp}
              className="pointer-events-auto absolute left-0 top-0"
              style={{
                width: vm.pieceSizePx,
                height: vm.pieceSizePx,
                cursor: vm.dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                willChange: 'transform',
                // shard backing shows as a ~2px edge: grey at rest, white on
                // target — derived from state so it never drifts from the form.
                background: vm.shardWhite ? EDGE_HOT : EDGE_COLD,
                transition: 'background .12s ease',
                clipPath: vm.shard,
                filter: 'drop-shadow(0 5px 12px rgba(0,0,0,.5))',
              }}
            >
              <div
                className="absolute inset-[2px]"
                style={{
                  backgroundImage: `url(${vm.pieceSrc})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  clipPath: vm.shard,
                }}
              />
              {/* subtle 20% shading, dropped when on target (declarative) */}
              <div
                className="pointer-events-none absolute inset-[2px]"
                style={{
                  background: '#000',
                  opacity: vm.shadeHidden ? 0 : 0.2,
                  transition: 'opacity .12s ease',
                  clipPath: vm.shard,
                }}
              />
              {/* fuzz is always present so a tap toggles it in every phase */}
              <Static revealed={!vm.showFuzz} shard={vm.shard} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Reserve this row permanently so swapping the credit for the form never
          resizes the (vertically-centred) modal and jolts the photo mid-drag. */}
      <div className="mt-6 flex min-h-[42px] items-center">
        {!vm.formVisible ? (
          <p className="text-[12px] text-secondary">
            brought to you by{' '}
            <a
              href="https://inter-net.au"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-secondary/40 underline-offset-2 transition-opacity hover:opacity-70"
            >
              inter-net.au
            </a>
          </p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="w-full"
            aria-hidden={!vm.formActive}
            style={{
              // appears the instant you hit the white zone, dark + inert until
              // release locks the solve.
              opacity: vm.formActive ? 1 : 0.4,
              pointerEvents: vm.formActive ? 'auto' : 'none',
            }}
          >
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="email"
                required
                disabled={!vm.formActive}
                value={vm.email}
                onChange={e => actions.setEmail(e.target.value)}
                placeholder="you@email.com"
                className={`${PAIR_CONTROL} grow select-text bg-background px-4 placeholder:text-secondary`}
              />
              <button
                type="submit"
                disabled={!vm.canSubmit}
                className={`${PAIR_CONTROL} inline-flex items-center justify-center px-5 transition-colors hover:bg-primary hover:text-background`}
              >
                {vm.submitLabel}
              </button>
            </div>
            {vm.showTurnstile ? <div ref={refs.turnstile} className="mt-3" /> : null}
            {vm.error ? (
              <p className="mt-2 text-[13px] text-secondary">{vm.error}</p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  )
}

// Animated anaglyph TV-static that scrambles the shard at rest and resolves to
// the real crop only when the reveal toggle is on (click the photo to toggle).
const Static = ({ revealed, shard }: { revealed: boolean; shard: string }) => (
  <svg
    aria-hidden
    className="pointer-events-none absolute inset-[2px] h-[calc(100%-4px)] w-[calc(100%-4px)]"
    style={{
      opacity: revealed ? 0 : 1,
      transition: 'opacity .3s ease',
      filter: 'contrast(1.4) saturate(1.6)',
      clipPath: shard,
    }}
  >
    <defs>
      <filter id="cloud-tv-static">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves={2}
          stitchTiles="stitch"
          seed={3}
        >
          <animate
            attributeName="seed"
            dur="0.5s"
            calcMode="discrete"
            values="1;5;9;3;7;2;8;4;6;1"
            repeatCount="indefinite"
          />
        </feTurbulence>
        <feColorMatrix
          type="matrix"
          values="1.3 0 0 0 0  0 0.6 0.6 0 0  0 0.6 1.3 0 0  0 0 0 1.6 -0.3"
        />
      </filter>
    </defs>
    <rect width="100%" height="100%" filter="url(#cloud-tv-static)" />
  </svg>
)

const Poof = ({
  boardW,
  pos,
}: {
  boardW: number
  pos: { x: number; y: number }
}) => {
  const cx = pos.x * boardW
  const cy = pos.y * boardW * ASPECT
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2
        return (
          <span
            key={i}
            className="cloud-spark absolute block h-1.5 w-1.5 rounded-full bg-white"
            style={{
              left: cx,
              top: cy,
              ['--dx' as string]: `${Math.cos(angle) * 70}px`,
              ['--dy' as string]: `${Math.sin(angle) * 70}px`,
              animationDelay: `${i * 12}ms`,
            }}
          />
        )
      })}
      <span
        className="cloud-poof absolute -translate-x-1/2 -translate-y-1/2 text-2xl"
        style={{ left: cx, top: cy }}
      >
        {'\u2601\uFE0F'}
      </span>
    </div>
  )
}

const Styles = () => (
  <style>{`
    .cloud-spark { animation: cloudSpark .7s ease-out forwards; transform: translate(-50%, -50%); }
    @keyframes cloudSpark {
      to { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))); opacity: 0; }
    }
    .cloud-poof { animation: cloudPoof .6s ease-out forwards; }
    @keyframes cloudPoof {
      0% { transform: translate(-50%,-50%) scale(.2); opacity: 0; }
      40% { opacity: 1; }
      100% { transform: translate(-50%,-50%) scale(1.6); opacity: 0; }
    }
  `}</style>
)
