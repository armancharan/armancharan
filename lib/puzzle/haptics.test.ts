import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HAPTIC_PATTERNS, createHaptics, noopHaptics } from './haptics'

// Snapshot/restore the bits of the global we mutate so each test is isolated and
// we don't leak a fake navigator/matchMedia into other suites.
const originalNavigator = globalThis.navigator
const originalMatchMedia = (globalThis as { matchMedia?: unknown }).matchMedia

const setNavigatorVibrate = (vibrate: ((p: number | number[]) => boolean) | null) => {
  if (vibrate == null) {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    })
    return
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: { vibrate },
    configurable: true,
  })
}

const setReducedMotion = (matches: boolean) => {
  ;(globalThis as { matchMedia?: unknown }).matchMedia = vi.fn(() => ({
    matches,
  }))
  ;(globalThis as unknown as { window: typeof globalThis }).window =
    globalThis as typeof globalThis
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
  })
  ;(globalThis as { matchMedia?: unknown }).matchMedia = originalMatchMedia
  vi.restoreAllMocks()
})

describe('createHaptics', () => {
  beforeEach(() => setReducedMotion(false))

  it('calls navigator.vibrate with the expected pattern per cue', () => {
    const vibrate = vi.fn((_pattern: number | number[]) => true)
    setNavigatorVibrate(vibrate)
    const h = createHaptics()

    h.grab()
    h.hot()
    h.cold()
    h.solved()
    h.success()
    h.error()

    expect(vibrate.mock.calls.map(c => c[0])).toEqual([
      HAPTIC_PATTERNS.grab,
      HAPTIC_PATTERNS.hot,
      HAPTIC_PATTERNS.cold,
      HAPTIC_PATTERNS.solved,
      HAPTIC_PATTERNS.success,
      HAPTIC_PATTERNS.error,
    ])
  })

  it('no-ops when vibrate is unavailable (e.g. iOS Safari)', () => {
    setNavigatorVibrate(null)
    const h = createHaptics()
    expect(() => {
      h.grab()
      h.solved()
      h.error()
    }).not.toThrow()
  })

  it('no-ops when prefers-reduced-motion is set', () => {
    const vibrate = vi.fn(() => true)
    setNavigatorVibrate(vibrate)
    setReducedMotion(true)
    const h = createHaptics()

    h.grab()
    h.solved()
    h.error()

    expect(vibrate).not.toHaveBeenCalled()
  })

  it('swallows errors thrown by navigator.vibrate', () => {
    const vibrate = vi.fn(() => {
      throw new Error('blocked')
    })
    setNavigatorVibrate(vibrate)
    const h = createHaptics()
    expect(() => h.grab()).not.toThrow()
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})

describe('noopHaptics', () => {
  it('never touches navigator.vibrate', () => {
    const vibrate = vi.fn(() => true)
    setNavigatorVibrate(vibrate)
    noopHaptics.grab()
    noopHaptics.hot()
    noopHaptics.cold()
    noopHaptics.solved()
    noopHaptics.success()
    noopHaptics.error()
    expect(vibrate).not.toHaveBeenCalled()
  })
})
