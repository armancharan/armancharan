// Server-side Cloudflare Turnstile verification. Invisible backstop that runs
// underneath the cloud puzzle. Skipped (with a flag) when no secret is set so
// the flow stays testable locally before the widget is provisioned.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult = { ok: boolean; configured: boolean; reason?: string }

export const verifyTurnstile = async (
  token: string | undefined,
  ip?: string,
): Promise<TurnstileResult> => {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: true, configured: false }

  if (!token) return { ok: false, configured: true, reason: 'missing_token' }

  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)

  try {
    const res = await fetch(SITEVERIFY, { method: 'POST', body: form })
    const data = (await res.json()) as {
      success: boolean
      ['error-codes']?: string[]
    }
    return data.success
      ? { ok: true, configured: true }
      : {
          ok: false,
          configured: true,
          reason: data['error-codes']?.join(',') || 'failed',
        }
  } catch {
    return { ok: false, configured: true, reason: 'siteverify_unreachable' }
  }
}
