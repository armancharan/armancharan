// Deterministic shard-outline generation. The server hands the client a
// CSPRNG seed per session; the polygon is derived from it so every challenge
// gets a unique, unpredictable outline. The shape carries no information about
// the answer (the secret is the target position, held server-side).

// Fallback outline used before a seed arrives.
export const FALLBACK_SHARD =
  'polygon(48% 2%, 72% 11%, 88% 30%, 80% 52%, 95% 74%, 66% 92%, 40% 99%, 16% 84%, 7% 56%, 19% 33%, 4% 18%, 28% 12%)'

// Small, fast, deterministic PRNG (mulberry32): a given seed always yields the
// same sequence, which is what makes the outline reproducible and testable.
export const mulberry32 = (a: number) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const SHARD_MIN_VERTICES = 5
export const SHARD_MAX_VERTICES = 8

// Build an angular shard polygon (CSS clip-path string) from a seed. Few sides
// + irregular angular spacing give a crystalline rhombus/quartz silhouette
// rather than a round blob. Radius variance is kept modest so neighbouring
// vertices stay similar — which avoids deep inward notches (the "dented blob"
// state). Angle jitter stays under half a slice to preserve winding order.
export const makeShard = (seed: number): string => {
  const rnd = mulberry32(seed)
  const range = SHARD_MAX_VERTICES - SHARD_MIN_VERTICES + 1
  const n = SHARD_MIN_VERTICES + Math.floor(rnd() * range)
  const base = 0.4 + rnd() * 0.06 // overall size of this crystal
  const vary = 0.04 + rnd() * 0.05 // gentle radius variance (no deep notches)
  const tilt = rnd() * Math.PI * 2 // rotate the whole shard
  const pts: string[] = []
  for (let i = 0; i < n; i++) {
    const jitter = (rnd() - 0.5) * 0.7 // irregular, rhombus-like angular spacing
    const ang = tilt + ((i + jitter) / n) * Math.PI * 2
    const noise = (rnd() - 0.5) * 2 * vary
    const rad = Math.max(0.24, Math.min(0.49, base + noise))
    const x = 50 + Math.cos(ang) * rad * 100
    const y = 50 + Math.sin(ang) * rad * 100
    pts.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`)
  }
  return `polygon(${pts.join(', ')})`
}

export const shardForSeed = (seed: number | null): string =>
  seed == null ? FALLBACK_SHARD : makeShard(seed)
