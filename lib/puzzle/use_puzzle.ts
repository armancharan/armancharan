'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { PuzzleController, type PuzzleControllerDeps } from './controller'
import { selectViewModel } from './presenter'
import type { Point, PuzzleViewModel } from './types'

export interface UsePuzzleOptions {
  aspect: number
  deps?: Partial<Omit<PuzzleControllerDeps, 'aspect' | 'getBoardEl' | 'getPieceEl'>>
}

export interface PuzzleRefs {
  board: React.RefObject<HTMLDivElement>
  piece: React.RefObject<HTMLDivElement>
  turnstile: React.RefObject<HTMLDivElement>
}

export interface PuzzleActions {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  toggleReveal: () => void
  toggleBgFocus: () => void
  setEmail: (email: string) => void
  submit: (honeypot: string) => void
}

export interface UsePuzzleResult {
  vm: PuzzleViewModel
  refs: PuzzleRefs
  actions: PuzzleActions
  position: Point // imperative shard centre, for the solve burst
  siteKey: string | undefined
}

// The single API the view consumes: one controller (presenter) wired to the
// store + services, exposed as a derived view model, refs, and bound actions.
// The component holds no business logic, no fetch, no socket, no drag refs.
export const usePuzzle = (opts: UsePuzzleOptions): UsePuzzleResult => {
  const board = useRef<HTMLDivElement>(null)
  const piece = useRef<HTMLDivElement>(null)
  const turnstile = useRef<HTMLDivElement>(null)

  const controllerRef = useRef<PuzzleController>()
  if (!controllerRef.current) {
    controllerRef.current = new PuzzleController({
      aspect: opts.aspect,
      getBoardEl: () => board.current,
      getPieceEl: () => piece.current,
      ...opts.deps,
    })
  }
  const controller = controllerRef.current

  const state = useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getState,
    controller.store.getState,
  )
  const vm = selectViewModel(state)

  // Open the socket once on mount.
  useEffect(() => controller.connect(), [controller])

  // Measure the board and keep the shard pinned through resizes.
  useEffect(() => {
    controller.measure()
    window.addEventListener('resize', controller.measure)
    return () => window.removeEventListener('resize', controller.measure)
  }, [controller])

  // Mount the Turnstile widget once a solve unlocks the form.
  useEffect(() => {
    if (!vm.showTurnstile || !turnstile.current) return
    return controller.mountTurnstile(turnstile.current)
  }, [controller, vm.showTurnstile])

  const actions = useMemo<PuzzleActions>(
    () => ({
      onPointerDown: controller.onPointerDown,
      onPointerMove: controller.onPointerMove,
      onPointerUp: controller.onPointerUp,
      toggleReveal: controller.toggleReveal,
      toggleBgFocus: controller.toggleBgFocus,
      setEmail: controller.setEmail,
      submit: controller.submit,
    }),
    [controller],
  )

  return {
    vm,
    refs: { board, piece, turnstile },
    actions,
    position: controller.position,
    siteKey: controller.siteKey,
  }
}
