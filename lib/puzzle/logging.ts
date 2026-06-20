// Logging service: a small, injectable seam for error reporting so the
// controller depends only on the abstraction (like the rest of services.ts) and
// tests can inject a spy/noop. Mirrors haptics.ts (a factory + a noop). Keeps
// raw `console.error` out of the controller and gives swallowed catches a place
// to surface the underlying cause without changing user-facing behaviour.

export interface LoggingService {
  logError: (scope: string, error: unknown, meta?: Record<string, unknown>) => void
}

// SSR/test/injection-safe no-op. Use this when logging should be silenced.
export const noopLogger: LoggingService = {
  logError: () => {},
}

// Normalise an unknown thrown value into a structured, serialisable shape so the
// message and stack survive in the console output regardless of what was thrown.
const describeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

// Build the real console-backed logger. Output is a single structured object
// prefixed with the scope so logs are greppable and the error/meta are never
// lost. Wrapped in try/catch so a logging failure can never break a flow.
export const createConsoleLogger = (): LoggingService => ({
  logError: (scope, error, meta) => {
    try {
      console.error(`[puzzle:${scope}]`, {
        error: describeError(error),
        ...(meta ? { meta } : {}),
      })
    } catch {
      // ignore: logging is best-effort, never essential
    }
  },
})
