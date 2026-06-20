// Structured error logging for the Worker. `[observability] enabled` in
// wrangler.toml means these `console.error` lines are surfaced by `wrangler
// tail`, so logging the real exception cause here turns a blind 502 into a
// diagnosable event without changing any response the client sees.

const describeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

export const logError = (
  scope: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void => {
  console.error(`[worker:${scope}]`, {
    error: describeError(error),
    ...(meta ? { meta } : {}),
  })
}
