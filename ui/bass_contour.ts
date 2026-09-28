/** Spike-tip jitter for the bass contours. Letters are not passed through here. */

type Move = { op: 'M' | 'L'; x: number; y: number }
type Curve = {
  op: 'C'
  x1: number
  y1: number
  x2: number
  y2: number
  x: number
  y: number
}
type Close = { op: 'Z' }
export type AbsCmd = Move | Curve | Close

const ARG_COUNT: Record<string, number> = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
}

const isNum = (token: Token): token is { kind: 'n'; n: number } => token.kind === 'n'

type Token = { kind: 'op'; op: string } | { kind: 'n'; n: number }

const lex = (d: string): Token[] => {
  const re = /[MmLlHhVvCcZz]|-?(?:\d+\.\d+|\d+|\.\d+)/g
  const out: Token[] = []
  for (const match of d.matchAll(re)) {
    const text = match[0]
    if (/[A-Za-z]/.test(text)) out.push({ kind: 'op', op: text })
    else out.push({ kind: 'n', n: Number(text) })
  }
  return out
}

/** Absolute M/L/C/Z. Relative commands and H/V become L so one vertex can move alone. */
export const normalizePath = (d: string): AbsCmd[] => {
  const tokens = lex(d)
  const abs: AbsCmd[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let k = 0
  while (k < tokens.length) {
    const token = tokens[k]
    if (token.kind !== 'op') throw new Error('path number before command')
    let op = token.op
    k += 1
    if (op === 'Z' || op === 'z') {
      abs.push({ op: 'Z' })
      cx = sx
      cy = sy
      continue
    }
    const count = ARG_COUNT[op]
    if (count === undefined) throw new Error(`unsupported path command ${op}`)
    let first = true
    while (k < tokens.length && isNum(tokens[k])) {
      const args: number[] = []
      for (let a = 0; a < count; a += 1) {
        const next = tokens[k]
        if (!isNum(next)) throw new Error(`short args for ${op}`)
        args.push(next.n)
        k += 1
      }
      const rel = op === op.toLowerCase()
      if (op === 'H' || op === 'h') {
        const x = rel ? cx + args[0] : args[0]
        abs.push({ op: 'L', x, y: cy })
        cx = x
      } else if (op === 'V' || op === 'v') {
        const y = rel ? cy + args[0] : args[0]
        abs.push({ op: 'L', x: cx, y })
        cy = y
      } else if (op === 'C' || op === 'c') {
        const x1 = rel ? cx + args[0] : args[0]
        const y1 = rel ? cy + args[1] : args[1]
        const x2 = rel ? cx + args[2] : args[2]
        const y2 = rel ? cy + args[3] : args[3]
        const x = rel ? cx + args[4] : args[4]
        const y = rel ? cy + args[5] : args[5]
        abs.push({ op: 'C', x1, y1, x2, y2, x, y })
        cx = x
        cy = y
      } else {
        const x = rel ? cx + args[0] : args[0]
        const y = rel ? cy + args[1] : args[1]
        const isMove = first && (op === 'M' || op === 'm')
        abs.push({ op: isMove ? 'M' : 'L', x, y })
        cx = x
        cy = y
        if (isMove) {
          sx = x
          sy = y
        }
      }
      first = false
      if (op === 'M') op = 'L'
      else if (op === 'm') op = 'l'
    }
  }
  return abs
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export const pathToD = (cmds: AbsCmd[]): string => {
  let d = ''
  for (const cmd of cmds) {
    if (cmd.op === 'Z') {
      d += 'Z'
      continue
    }
    if (cmd.op === 'C') {
      d += `C${round3(cmd.x1)} ${round3(cmd.y1)} ${round3(cmd.x2)} ${round3(cmd.y2)} ${round3(cmd.x)} ${round3(cmd.y)}`
      continue
    }
    d += `${cmd.op}${round3(cmd.x)} ${round3(cmd.y)}`
  }
  return d
}

type OnCurve = { index: number; x: number; y: number }

const onCurve = (cmds: AbsCmd[]): OnCurve[] => {
  const pts: OnCurve[] = []
  for (let index = 0; index < cmds.length; index += 1) {
    const cmd = cmds[index]
    if (cmd.op === 'M' || cmd.op === 'L' || cmd.op === 'C') {
      pts.push({ index, x: cmd.x, y: cmd.y })
    }
  }
  return pts
}

const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) < 0.05

/** Smooth around the circle so an inner spike and the outer spike on the same heading move together. */
const radialAmount = (seed: number, angle: number, amplitude: number) => {
  const n =
    Math.sin(angle * 3 + seed * 1.7) * 0.55 +
    Math.sin(angle * 7 + seed * 2.3) * 0.3 +
    Math.sin(angle * 11 + seed * 0.8) * 0.2
  return n * amplitude
}

const unit = (x: number, y: number) => {
  const len = Math.hypot(x, y)
  if (len < 1e-6) return { x: 0, y: 0 }
  return { x: x / len, y: y / len }
}

/**
 * Move spike tips along the axis they already point, by at most `amplitude`.
 * Valleys and the lettering are left alone. A tip is a vertex sharper than
 * its neighbors and farther from the centroid than both of them.
 */
export const jitterTips = (cmds: AbsCmd[], seed: number, amplitude: number): AbsCmd[] => {
  const pts = onCurve(cmds)
  if (pts.length < 4) return cmds
  const closedDup = samePoint(pts[0], pts[pts.length - 1])
  const ring = closedDup ? pts.slice(0, -1) : pts
  let cx = 0
  let cy = 0
  for (const p of ring) {
    cx += p.x
    cy += p.y
  }
  cx /= ring.length
  cy /= ring.length

  const delta = new Map<number, { x: number; y: number }>()
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i]
    const prev = ring[(i + ring.length - 1) % ring.length]
    const next = ring[(i + 1) % ring.length]
    const r = Math.hypot(p.x - cx, p.y - cy)
    const rPrev = Math.hypot(prev.x - cx, prev.y - cy)
    const rNext = Math.hypot(next.x - cx, next.y - cy)
    if (r < rPrev + 1.25 || r < rNext + 1.25) continue
    const back = unit(prev.x - p.x, prev.y - p.y)
    const fore = unit(next.x - p.x, next.y - p.y)
    // Neighbors sit back down the spike. The tip points the other way.
    const point = unit(-(back.x + fore.x), -(back.y + fore.y))
    const fromCenter = unit(p.x - cx, p.y - cy)
    if (point.x * fromCenter.x + point.y * fromCenter.y <= 0) continue
    const sharpness = back.x * fore.x + back.y * fore.y
    if (sharpness < -0.15) continue
    const angle = Math.atan2(p.y - cy, p.x - cx)
    let amount = radialAmount(seed, angle, amplitude)
    const floor = Math.max(rPrev, rNext) + 0.75
    const nextR = r + amount
    if (nextR < floor) amount = floor - r
    if (amount > amplitude) amount = amplitude
    if (amount < -amplitude * 0.45) amount = -amplitude * 0.45
    delta.set(p.index, { x: point.x * amount, y: point.y * amount })
  }
  if (closedDup) {
    const first = delta.get(pts[0].index)
    if (first) delta.set(pts[pts.length - 1].index, first)
  }

  return cmds.map((cmd, index) => {
    if (cmd.op === 'Z') return cmd
    const shift = delta.get(index)
    if (!shift) return cmd
    return { ...cmd, x: cmd.x + shift.x, y: cmd.y + shift.y }
  })
}

const ringPoints = (cmds: AbsCmd[]) => {
  const pts = onCurve(cmds)
  if (pts.length > 1 && samePoint(pts[0], pts[pts.length - 1])) return pts.slice(0, -1)
  return pts
}

const contains = (poly: readonly { x: number; y: number }[], x: number, y: number) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i]
    const pj = poly[j]
    const crosses = (pi.y > y) !== (pj.y > y)
    if (!crosses) continue
    const xHit = ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x
    if (x < xHit) inside = !inside
  }
  return inside
}

/** Pull inner vertices that crossed the outer contour back toward the center. */
export const pullInside = (outer: AbsCmd[], inner: AbsCmd[]): AbsCmd[] => {
  const poly = ringPoints(outer)
  let cx = 0
  let cy = 0
  for (const p of poly) {
    cx += p.x
    cy += p.y
  }
  cx /= poly.length
  cy /= poly.length
  return inner.map(cmd => {
    if (cmd.op === 'Z') return cmd
    let x = cmd.x
    let y = cmd.y
    const originX = x
    const originY = y
    for (let step = 0; step < 8 && !contains(poly, x, y); step += 1) {
      x += (cx - x) * 0.12
      y += (cy - y) * 0.12
      if (Math.hypot(x - originX, y - originY) > 4) break
    }
    return { ...cmd, x, y }
  })
}

export const lerpPaths = (from: AbsCmd[], to: AbsCmd[], t: number): string => {
  const cmds: AbsCmd[] = from.map((cmd, index) => {
    const next = to[index]
    if (cmd.op === 'Z' || !next || next.op !== cmd.op) return cmd
    if (cmd.op === 'C' && next.op === 'C') {
      return {
        op: 'C',
        x1: cmd.x1 + (next.x1 - cmd.x1) * t,
        y1: cmd.y1 + (next.y1 - cmd.y1) * t,
        x2: cmd.x2 + (next.x2 - cmd.x2) * t,
        y2: cmd.y2 + (next.y2 - cmd.y2) * t,
        x: cmd.x + (next.x - cmd.x) * t,
        y: cmd.y + (next.y - cmd.y) * t,
      }
    }
    if ((cmd.op === 'M' || cmd.op === 'L') && (next.op === 'M' || next.op === 'L')) {
      return {
        op: cmd.op,
        x: cmd.x + (next.x - cmd.x) * t,
        y: cmd.y + (next.y - cmd.y) * t,
      }
    }
    return cmd
  })
  return pathToD(cmds)
}
