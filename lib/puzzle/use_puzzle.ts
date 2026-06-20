'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { PuzzleController, type PuzzleControllerDeps } from './controller'
import { createHaptics, type HapticsService } from './haptics'
import { selectViewModel } from './presenter'
import type { Point, PuzzleViewModel } from './types'

export interface UsePuzzleOptions {
  aspect: number
  deps?: Partial<Omit<PuzzleControllerDeps, 'aspect' | 'getBoardEl' | 'getPieceEl'>>
  // Injectable so it can be stubbed/disabled in tests; defaults to the real
  // browser-backed service (no-ops on unsupported devices / reduced-motion).
  haptics?: HapticsService
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
  retry: () => void
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

  // Tasteful haptic feedback, driven declaratively off view-model transitions.
  // Kept here (not in the controller) so it watches the same derived vm the view
  // renders, and stays clear of the files other work is touching.
  const hapticsRef = useRef<HapticsService>()
  if (!hapticsRef.current) hapticsRef.current = opts.haptics ?? createHaptics()
  const haptics = hapticsRef.current

  const prev = useRef({
    dragging: vm.dragging,
    shardWhite: vm.shardWhite,
    solved: vm.solved,
    done: vm.done,
    error: vm.error,
    errorRetry: vm.errorRetry,
  })

  useEffect(() => {
    const p = prev.current
    if (!p.dragging && vm.dragging) haptics.grab() // grab: pick up the shard
    if (!p.shardWhite && vm.shardWhite) haptics.hot() // enter the on-target zone
    else if (p.shardWhite && !vm.shardWhite) haptics.cold() // leave it
    if (!p.solved && vm.solved) haptics.solved() // puzzle solved
    if (!p.done && vm.done) haptics.success() // signup confirmed
    // a fresh, retryable error (ignore re-renders of the same error)
    if (vm.error && vm.errorRetry && (p.error !== vm.error || !p.errorRetry)) {
      haptics.error()
    }
    prev.current = {
      dragging: vm.dragging,
      shardWhite: vm.shardWhite,
      solved: vm.solved,
      done: vm.done,
      error: vm.error,
      errorRetry: vm.errorRetry,
    }
  }, [
    haptics,
    vm.dragging,
    vm.shardWhite,
    vm.solved,
    vm.done,
    vm.error,
    vm.errorRetry,
  ])

  // Open the socket on mount; dispose whatever socket is current on unmount
  // (the controller may have replaced it via retry()).
  useEffect(() => {
    controller.connect()
    return () => controller.dispose()
  }, [controller])

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
      retry: controller.retry,
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
