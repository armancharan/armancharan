import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Guards the puzzle data pipeline so it can never silently drift again: the
// hand-edited config (worker/src/puzzle.config.json), the GENERATED secret
// targets (worker/src/targets.json) and the pre-rendered crops (public/pieces)
// must all agree. This is exactly the footgun that bit us — a stray
// `cp targets.example.json targets.json` clobbered the real generated file with
// the 1-target / radius-0.08 placeholder and nothing caught it (shards rendered
// tiny and from the wrong part of the photo). These read the real files off disk
// via node:fs and fail loudly on any mismatch.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

interface Config {
  radius: number
  tolerance: number
  count: number
  region: { x: [number, number]; y: [number, number] }
}
interface Targets {
  note?: string
  radius: number
  tolerance: number
  targets: { x: number; y: number }[]
}

const config = readJson('worker/src/puzzle.config.json') as Config
const targets = readJson('worker/src/targets.json') as Targets

describe('puzzle data pipeline consistency', () => {
  it('targets.json is the real generated file, not the example placeholder', () => {
    // The example's note contains "EXAMPLE"; the generated one does not. If this
    // trips, someone copied targets.example.json over the real file.
    expect(
      (targets.note ?? '').includes('EXAMPLE'),
      'worker/src/targets.json is the EXAMPLE placeholder — run `node scripts/generate-pieces.mjs` to regenerate the real targets + crops',
    ).toBe(false)
  })

  it('target count matches config.count', () => {
    expect(targets.targets.length).toBe(config.count)
  })

  it('radius and tolerance match the config', () => {
    expect(targets.radius).toBe(config.radius)
    expect(targets.tolerance).toBe(config.tolerance)
  })

  it('every target lies within the configured region', () => {
    const EPS = 0.001 // targets are rounded to 3 decimals by the generator
    for (const t of targets.targets) {
      expect(t.x).toBeGreaterThanOrEqual(config.region.x[0] - EPS)
      expect(t.x).toBeLessThanOrEqual(config.region.x[1] + EPS)
      expect(t.y).toBeGreaterThanOrEqual(config.region.y[0] - EPS)
      expect(t.y).toBeLessThanOrEqual(config.region.y[1] + EPS)
    }
  })

  it('public/pieces holds exactly one webp per target, indices 0..count-1', () => {
    const indices = readdirSync(join(ROOT, 'public', 'pieces'))
      .map(f => /^piece-(\d+)\.webp$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map(m => Number(m[1]))
      .sort((a, b) => a - b)
    expect(indices).toEqual(Array.from({ length: config.count }, (_, i) => i))
  })

  // Proves the placeholder trap actually catches the example, without clobbering
  // the real targets.json: the checks that pass above MUST fail for the example.
  it('the placeholder trap would catch targets.example.json', () => {
    const example = readJson('worker/src/targets.example.json') as Targets
    expect((example.note ?? '').includes('EXAMPLE')).toBe(true)
    expect(example.targets.length).not.toBe(config.count)
  })
})
