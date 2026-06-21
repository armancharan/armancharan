import type { FormEvent } from 'react'
import type { Point, PuzzleViewModel } from '../lib/puzzle/types'
import type { PuzzleActions, PuzzleRefs } from '../lib/puzzle/use_puzzle'

export const IMG = '/nuke-cloud.webp'
export const ASPECT = 840 / 630 // portrait source image

// Shard edge: grey at rest, locks white when the server says you're on target.
const EDGE_COLD = 'rgba(170,170,170,.85)'
const EDGE_HOT = 'rgba(255,255,255,.98)'

// Shared geometry/typography for the paired email input + submit button so they
// stay identical. `appearance-none` + the vendor-prefixed `-webkit-appearance`
// reset force square corners and strip the native field/button chrome (rounded
// corners, inset shadow, gradient) that mobile webkit (iOS Safari/Chrome)
// otherwise paints. `[font-size:16px]` keeps iOS from zooming the page on focus.
// `disabled:opacity-100` + `disabled:text-primary` cancel the browser's native
// dimming of disabled controls (the submit button before an email is typed, the
// input while the form is inert) so the border/text always match the sibling —
// the only intentional dim is the form wrapper's 0.4 in the inert state, which
// applies to both equally.
const PAIR_CONTROL =
  'box-border h-[42px] appearance-none [-webkit-appearance:none] rounded-none border border-primary text-primary [font-size:16px] leading-none shadow-none outline-none disabled:opacity-100 disabled:text-primary'

// Presentational view: every pixel is derived from `vm`, so any state can be
// rendered in isolation (e.g. Storybook) by handing it a view model plus stub
// refs/actions. Holds no socket, fetch, or drag state of its own.
export interface PuzzleViewProps {
  vm: PuzzleViewModel
  refs: PuzzleRefs
  actions: PuzzleActions
  position: Point
  siteKey: string | undefined
  onClose: () => void
}

export const PuzzleView = ({
  vm,
  refs,
  actions,
  siteKey,
  onClose,
}: PuzzleViewProps) => {
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

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const honeypot =
      (e.currentTarget.elements.namedItem('website') as HTMLInputElement)?.value ??
      ''
    actions.submit(honeypot)
  }

  return (
    <div>
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
          {/* Sits behind the photo, clipped to the board — guaranteed to render
              behind the puzzle picture. Only ever glimpsed in the esoteric gap
              before the webp paints (or via inspection); never floats in the
              backdrop. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex select-none items-center justify-center px-4 text-center lowercase leading-[1.15] tracking-[-0.01em] text-primary"
          >
            <span>
              <span className="block text-[18px] font-normal">
                and it{'\u2019'}s like
              </span>
              <span className="block text-[18px] font-normal">
                {'\u201c'}no, not really{'\u201d'}
              </span>
            </span>
          </div>
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
            className="pointer-events-none absolute inset-0 bg-background"
            style={{
              opacity: vm.bgDim ? 0.5 : 0,
            }}
          />
        </div>

        {vm.connecting ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-4 text-center">
            <span className="text-[13px] text-primary">{vm.connectingLabel}</span>
            {vm.errorRetry ? (
              <button
                type="button"
                onClick={actions.retry}
                className="cursor-pointer text-[13px] text-primary underline decoration-from-font underline-offset-2 transition-opacity hover:opacity-70"
              >
                give it another go
              </button>
            ) : null}
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
              <p className="mt-2 text-[13px] text-secondary">
                {vm.error}
                {vm.errorRetry ? (
                  <>
                    {' \u2014 '}
                    <button
                      type="button"
                      onClick={actions.retry}
                      className="cursor-pointer text-primary underline decoration-from-font underline-offset-2 transition-opacity hover:opacity-70"
                    >
                      give it another go
                    </button>
                  </>
                ) : null}
              </p>
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
