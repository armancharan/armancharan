// Server-truth observability for the puzzle, backed by Workers Analytics Engine.
//
// Client-side metrics are spoofable, so anything the owner wants to trust —
// "what % of sessions hit the time cap?", "which IPs are abusing the room?" —
// must be emitted from the Worker. This mirrors logging.ts: a tiny injectable
// service with a default impl wrapping the binding and a no-op fallback, so the
// call sites stay clean and unit tests inject a spy (no real binding required).
//
// Analytics Engine datapoint limits (respected below): at most 1 index (≤96
// bytes), ≤20 blobs, ≤20 doubles per write.

// How a session ended — the single dimension the cap/abuse rollups pivot on.
export type EndReason =
  | 'solved'
  | 'session_expired'
  | 'too_many_samples'
  | 'too_many_attempts'
  | 'disconnect'

// One datapoint per finished session (server-truth).
export interface SessionMetric {
  ip: string // CF-Connecting-IP — the datapoint index
  endReason: EndReason
  country: string
  colo: string
  project: string
  durationMs: number
  sampleCount: number
  attempts: number
  pathLen: number
  hotGatePass: boolean // did the drag clear the behavioural hot gate?
}

// One datapoint for a request rejected before a session ever started (rate
// limit, bad origin) — no behavioural fields, just the IP and why.
export interface RejectMetric {
  ip: string
  reason: string
}

export interface MetricsService {
  recordSession(fields: SessionMetric): void
  recordReject(fields: RejectMetric): void
}

const MAX_INDEX_BYTES = 96

// Analytics Engine caps an index at 96 bytes. IPs are far shorter, but truncate
// defensively (byte-accurate) so a hostile/garbage header can never exceed it.
const truncateIndex = (s: string): string => {
  const enc = new TextEncoder()
  if (enc.encode(s).length <= MAX_INDEX_BYTES) return s
  let out = s
  while (out.length > 0 && enc.encode(out).length > MAX_INDEX_BYTES) {
    out = out.slice(0, -1)
  }
  return out
}

// No-op service: used in local dev / tests and whenever the binding is absent.
// Must never throw.
export const noopMetrics: MetricsService = {
  recordSession() {},
  recordReject() {},
}

// Build the live service from the binding, or fall back to no-op when it's
// missing (local dev without the dataset). Writes are wrapped so a metrics
// failure can never take down a session or a request.
export const createMetrics = (
  dataset: AnalyticsEngineDataset | undefined,
): MetricsService => {
  if (!dataset) return noopMetrics
  return {
    recordSession(f: SessionMetric): void {
      try {
        dataset.writeDataPoint({
          indexes: [truncateIndex(f.ip)],
          blobs: [f.endReason, f.country, f.colo, f.project],
          doubles: [
            f.durationMs,
            f.sampleCount,
            f.attempts,
            f.pathLen,
            f.hotGatePass ? 1 : 0,
          ],
        })
      } catch {
        // metrics are best-effort — never surface to the client
      }
    },
    recordReject(f: RejectMetric): void {
      try {
        dataset.writeDataPoint({
          indexes: [truncateIndex(f.ip)],
          blobs: [f.reason],
          doubles: [],
        })
      } catch {
        // best-effort
      }
    },
  }
}

// Emit at most ONE session datapoint per session, flipping a `metricEmitted`
// latch on the (mutated) session so a solved-then-disconnect can't double-count.
// Returns whether this call actually emitted. CF-global-free, so it's unit-
// tested with a spy MetricsService.
export const emitSession = (
  metrics: MetricsService,
  session: { metricEmitted: boolean },
  fields: SessionMetric,
): boolean => {
  if (session.metricEmitted) return false
  session.metricEmitted = true
  metrics.recordSession(fields)
  return true
}
