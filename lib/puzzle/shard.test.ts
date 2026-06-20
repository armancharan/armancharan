import { describe, expect, it } from 'vitest'
import {
  FALLBACK_SHARD,
  SHARD_MAX_VERTICES,
  SHARD_MIN_VERTICES,
  makeShard,
  mulberry32,
  shardForSeed,
} from './shard'

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('produces values in [0, 1)', () => {
    const r = mulberry32(99)
    for (let i = 0; i < 50; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe('makeShard', () => {
  it('is a valid polygon clip-path', () => {
    expect(makeShard(7)).toMatch(/^polygon\(.+\)$/)
  })
  it('is reproducible for the same seed', () => {
    expect(makeShard(424242)).toBe(makeShard(424242))
  })
  it('varies between seeds', () => {
    expect(makeShard(1)).not.toBe(makeShard(2))
  })
  it('stays within the configured vertex range', () => {
    for (const seed of [1, 2, 3, 7, 42, 1000, 999999, 123456789]) {
      const count = makeShard(seed).split(',').length
      expect(count).toBeGreaterThanOrEqual(SHARD_MIN_VERTICES)
      expect(count).toBeLessThanOrEqual(SHARD_MAX_VERTICES)
    }
  })

  it('keeps every vertex inside the 0–100% box', () => {
    for (const seed of [1, 99, 4242, 7777777]) {
      const nums = makeShard(seed)
        .replace(/[^0-9.\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .map(Number)
      for (const v of nums) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('produces a spread of vertex counts across seeds', () => {
    const counts = new Set(
      Array.from({ length: 60 }, (_, s) => makeShard(s).split(',').length),
    )
    expect(counts.size).toBeGreaterThan(1)
  })
})

describe('shardForSeed', () => {
  it('returns the fallback when no seed is present', () => {
    expect(shardForSeed(null)).toBe(FALLBACK_SHARD)
  })
  it('returns a seeded shard otherwise', () => {
    expect(shardForSeed(5)).toBe(makeShard(5))
  })
})
