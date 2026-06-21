import { describe, expect, it, vi } from 'vitest'
import {
  createMetrics,
  emitSession,
  noopMetrics,
  type EndReason,
  type MetricsService,
  type SessionMetric,
} from './metrics'

// A spy service — no real AnalyticsEngineDataset, no CF globals.
const spyMetrics = () => {
  const sessions: SessionMetric[] = []
  const rejects: { ip: string; reason: string }[] = []
  const service: MetricsService = {
    recordSession: f => {
      sessions.push(f)
    },
    recordReject: f => {
      rejects.push(f)
    },
  }
  return { service, sessions, rejects }
}

const fakeSession = () => ({
  metricEmitted: false,
  ip: '203.0.113.7',
  country: 'AU',
  colo: 'SYD',
  startT: 1000,
  samples: 42,
  path: 0.5,
  attempts: 1,
})

const fields = (
  session: ReturnType<typeof fakeSession>,
  endReason: EndReason,
): SessionMetric => ({
  ip: session.ip,
  endReason,
  country: session.country,
  colo: session.colo,
  project: 'agentic-engineering-101',
  durationMs: 5000,
  sampleCount: session.samples,
  attempts: session.attempts,
  pathLen: session.path,
  hotGatePass: true,
})

describe('emitSession — one datapoint per terminal reason', () => {
  for (const reason of [
    'solved',
    'session_expired',
    'too_many_samples',
    'too_many_attempts',
  ] as const) {
    it(`records exactly one session for end_reason=${reason}`, () => {
      const { service, sessions } = spyMetrics()
      const s = fakeSession()
      const emitted = emitSession(service, s, fields(s, reason))
      expect(emitted).toBe(true)
      expect(sessions).toHaveLength(1)
      expect(sessions[0].endReason).toBe(reason)
      expect(sessions[0].ip).toBe('203.0.113.7')
      expect(s.metricEmitted).toBe(true)
    })
  }

  it('does not double-count on solved-then-disconnect', () => {
    const { service, sessions } = spyMetrics()
    const s = fakeSession()
    expect(emitSession(service, s, fields(s, 'solved'))).toBe(true)
    // A subsequent webSocketClose would try to emit 'disconnect' on the same
    // session — the latch must swallow it.
    expect(emitSession(service, s, fields(s, 'disconnect'))).toBe(false)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].endReason).toBe('solved')
  })
})

describe('createMetrics', () => {
  it('returns noopMetrics when the binding is absent (no throw)', () => {
    const m = createMetrics(undefined)
    expect(m).toBe(noopMetrics)
    expect(() =>
      m.recordSession(fields(fakeSession(), 'solved')),
    ).not.toThrow()
    expect(() => m.recordReject({ ip: 'x', reason: 'rate_limited' })).not.toThrow()
  })

  it('writes a session datapoint within AE limits (≤20 blobs/doubles, 1 index)', () => {
    const writes: Array<{
      indexes?: unknown[]
      blobs?: unknown[]
      doubles?: number[]
    }> = []
    const dataset = {
      writeDataPoint: (e: {
        indexes?: unknown[]
        blobs?: unknown[]
        doubles?: number[]
      }) => writes.push(e),
    } as unknown as AnalyticsEngineDataset
    const m = createMetrics(dataset)
    const s = fakeSession()
    m.recordSession(fields(s, 'session_expired'))

    expect(writes).toHaveLength(1)
    const w = writes[0]
    expect(w.indexes).toHaveLength(1)
    expect((w.blobs ?? []).length).toBeLessThanOrEqual(20)
    expect((w.doubles ?? []).length).toBeLessThanOrEqual(20)
    expect(w.blobs?.[0]).toBe('session_expired')
    // hot_gate_pass encoded as the trailing 0/1 double.
    expect(w.doubles?.[w.doubles.length - 1]).toBe(1)
  })

  it('truncates an over-long index to <= 96 bytes', () => {
    let captured: string | undefined
    const dataset = {
      writeDataPoint: (e: { indexes?: unknown[] }) => {
        captured = e.indexes?.[0] as string
      },
    } as unknown as AnalyticsEngineDataset
    const m = createMetrics(dataset)
    m.recordReject({ ip: 'a'.repeat(200), reason: 'rate_limited' })
    expect(new TextEncoder().encode(captured!).length).toBeLessThanOrEqual(96)
  })
})
