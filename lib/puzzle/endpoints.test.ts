import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { puzzleWsUrl, resolveBackend, subscribeUrl } from './endpoints'

// Tests run under the `node` environment (vitest.config.ts), so `window` is
// undefined — these exercise the env-var and SSR branches deterministically.
const KEY = 'NEXT_PUBLIC_PUZZLE_WS_URL'

describe('endpoints', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env[KEY]
  })
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY]
    else process.env[KEY] = saved
  })

  it('derives both URLs from one secure env base', () => {
    process.env[KEY] = 'wss://arman-puzzle.example.workers.dev/puzzle'
    expect(resolveBackend()).toEqual({
      host: 'arman-puzzle.example.workers.dev',
      secure: true,
    })
    expect(puzzleWsUrl()).toBe('wss://arman-puzzle.example.workers.dev/puzzle')
    expect(subscribeUrl()).toBe(
      'https://arman-puzzle.example.workers.dev/subscribe',
    )
  })

  it('derives insecure ws/http from a local ws base', () => {
    process.env[KEY] = 'ws://localhost:8799/puzzle'
    expect(puzzleWsUrl()).toBe('ws://localhost:8799/puzzle')
    expect(subscribeUrl()).toBe('http://localhost:8799/subscribe')
  })

  it('uses the base host only, ignoring the env URL path', () => {
    process.env[KEY] = 'wss://host.example.com/puzzle'
    expect(subscribeUrl()).toBe('https://host.example.com/subscribe')
  })

  it('falls through on a malformed env (no window → unresolved)', () => {
    process.env[KEY] = 'not a url'
    expect(resolveBackend()).toBeNull()
    expect(puzzleWsUrl()).toBe('')
    expect(subscribeUrl()).toBe('/api/subscribe')
  })

  it('is unresolved during SSR with no env configured', () => {
    delete process.env[KEY]
    expect(resolveBackend()).toBeNull()
    expect(puzzleWsUrl()).toBe('')
    expect(subscribeUrl()).toBe('/api/subscribe')
  })
})
