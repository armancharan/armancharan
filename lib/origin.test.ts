import { describe, expect, it } from 'vitest'
import { isOriginAllowed, parseAllowList } from './origin'

describe('parseAllowList', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseAllowList(' https://a.com , , https://b.com ')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  it('treats undefined/empty as an empty list', () => {
    expect(parseAllowList(undefined)).toEqual([])
    expect(parseAllowList('')).toEqual([])
  })
})

describe('isOriginAllowed', () => {
  it('is permissive when the allowlist is empty (dev/tunnel parity)', () => {
    expect(isOriginAllowed('https://anything.example', [])).toBe(true)
    expect(isOriginAllowed(null, [])).toBe(true)
  })

  it('rejects a missing origin when the allowlist is non-empty', () => {
    expect(isOriginAllowed(null, ['https://armancharan.com'])).toBe(false)
    expect(isOriginAllowed(undefined, ['https://armancharan.com'])).toBe(false)
  })

  it('matches exact origins', () => {
    const allow = ['https://armancharan.com']
    expect(isOriginAllowed('https://armancharan.com', allow)).toBe(true)
    expect(isOriginAllowed('https://evil.com', allow)).toBe(false)
  })

  it('matches single-label subdomain wildcards', () => {
    const allow = ['https://*.armancharan.com']
    expect(isOriginAllowed('https://dev.armancharan.com', allow)).toBe(true)
    expect(isOriginAllowed('https://www.armancharan.com', allow)).toBe(true)
    // apex is NOT a subdomain — list it explicitly if needed
    expect(isOriginAllowed('https://armancharan.com', allow)).toBe(false)
  })

  it('matches Vercel preview origins via *.vercel.app', () => {
    const allow = ['https://*.vercel.app']
    expect(isOriginAllowed('https://arman-charan-git-main-arman.vercel.app', allow)).toBe(true)
    expect(isOriginAllowed('https://other.app', allow)).toBe(false)
  })

  it('does not let a wildcard leak across the dot or scheme', () => {
    const allow = ['https://*.armancharan.com']
    expect(isOriginAllowed('http://dev.armancharan.com', allow)).toBe(false)
    expect(isOriginAllowed('https://evil.com/.armancharan.com', allow)).toBe(false)
    expect(isOriginAllowed('https://armancharan.com.evil.com', allow)).toBe(false)
  })

  it('honours a literal "*" as allow-all', () => {
    expect(isOriginAllowed('https://anything.example', ['*'])).toBe(true)
  })

  it('accepts when any rule in a mixed list matches', () => {
    const allow = ['https://armancharan.com', 'https://*.armancharan.com', 'https://*.vercel.app']
    expect(isOriginAllowed('https://armancharan.com', allow)).toBe(true)
    expect(isOriginAllowed('https://dev.armancharan.com', allow)).toBe(true)
    expect(isOriginAllowed('https://preview.vercel.app', allow)).toBe(true)
    expect(isOriginAllowed('https://nope.com', allow)).toBe(false)
  })
})
