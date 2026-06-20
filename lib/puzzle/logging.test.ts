import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConsoleLogger, noopLogger } from './logging'

afterEach(() => vi.restoreAllMocks())

describe('createConsoleLogger', () => {
  it('prefixes with the scope and serialises an Error (message + stack)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createConsoleLogger()
    const err = new Error('kaboom')

    logger.logError('submit', err, { project: 'p' })

    expect(spy).toHaveBeenCalledTimes(1)
    const [prefix, payload] = spy.mock.calls[0] as [string, Record<string, unknown>]
    expect(prefix).toBe('[puzzle:submit]')
    expect(payload).toMatchObject({
      error: { name: 'Error', message: 'kaboom' },
      meta: { project: 'p' },
    })
    expect((payload.error as { stack?: string }).stack).toContain('kaboom')
  })

  it('serialises a non-Error throw via String() and omits absent meta', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createConsoleLogger().logError('connect', 'plain string')

    const [, payload] = spy.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual({ error: { message: 'plain string' } })
  })

  it('never throws even if console.error blows up', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console broken')
    })
    expect(() => createConsoleLogger().logError('x', new Error('y'))).not.toThrow()
  })
})

describe('noopLogger', () => {
  it('never touches console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    noopLogger.logError('scope', new Error('z'), { a: 1 })
    expect(spy).not.toHaveBeenCalled()
  })
})
