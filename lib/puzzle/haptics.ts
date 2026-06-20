// Haptics service: tasteful, short vibration cues for key puzzle moments, behind
// a small interface so the view/hook depends only on the abstraction (like the
// rest of services.ts) and tests can inject a fake. Uses the Web Vibration API
// (`navigator.vibrate`), which is supported on Android Chrome but NOT iOS Safari
// — so every call degrades gracefully to a no-op when vibrate is unavailable.

// Vibration patterns, in milliseconds. A single number is a one-shot buzz; an
// array alternates vibrate/pause/vibrate… Kept short and subtle on purpose.
export const HAPTIC_PATTERNS = {
  grab: 10, // tiny tick when picking up the shard
  hot: 12, // light tick when entering the on-target zone
  cold: 8, // softer tick when leaving the zone
  solved: [14, 30, 24], // satisfying short pattern on solve
  success: [12, 24, 12, 24, 18], // confirmation buzz on signup success
  error: [20, 40, 20], // short double-buzz on a retryable error
} as const

export interface HapticsService {
  grab: () => void
  hot: () => void
  cold: () => void
  solved: () => void
  success: () => void
  error: () => void
}

// SSR/test/injection-safe no-op. Use this when haptics should be disabled.
export const noopHaptics: HapticsService = {
  grab: () => {},
  hot: () => {},
  cold: () => {},
  solved: () => {},
  success: () => {},
  error: () => {},
}

const canVibrate = (): boolean =>
  typeof navigator !== 'undefined' && 'vibrate' in navigator

// Respect the user's reduced-motion preference: if set, haptics are suppressed.
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Build the real browser-backed haptics service. Every cue is guarded for
// support + reduced-motion and wrapped in try/catch so a flaky/blocked vibrate
// call can never break an interaction.
export const createHaptics = (): HapticsService => {
  const fire = (pattern: number | readonly number[]): void => {
    if (!canVibrate() || prefersReducedMotion()) return
    try {
      navigator.vibrate(pattern as number | number[])
    } catch {
      // ignore: vibration is best-effort, never essential
    }
  }
  return {
    grab: () => fire(HAPTIC_PATTERNS.grab),
    hot: () => fire(HAPTIC_PATTERNS.hot),
    cold: () => fire(HAPTIC_PATTERNS.cold),
    solved: () => fire(HAPTIC_PATTERNS.solved),
    success: () => fire(HAPTIC_PATTERNS.success),
    error: () => fire(HAPTIC_PATTERNS.error),
  }
}
