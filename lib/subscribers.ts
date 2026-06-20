import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

// Subscriber storage. In production this writes to Cloudflare D1 over its HTTP
// query API (the site is on Vercel, so there is no native binding yet). With no
// D1 env configured it falls back to a local JSON file so the flow is testable
// before the database is provisioned.

export type AddResult = { ok: boolean; duplicate?: boolean; backend: 'd1' | 'local' }

const d1Configured = () =>
  Boolean(
    process.env.CF_ACCOUNT_ID &&
      process.env.CF_D1_DATABASE_ID &&
      process.env.CF_API_TOKEN,
  )

const addToD1 = async (email: string, meta: SubscriberMeta): Promise<AddResult> => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql:
        'INSERT INTO subscribers (email, source, user_agent, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING',
      params: [email, meta.source, meta.userAgent ?? '', new Date().toISOString()],
    }),
  })

  const data = (await res.json()) as {
    success: boolean
    result?: Array<{ meta?: { changes?: number } }>
    errors?: Array<{ message: string }>
  }

  if (!data.success) {
    throw new Error(data.errors?.map(e => e.message).join('; ') || 'd1_query_failed')
  }

  const changes = data.result?.[0]?.meta?.changes ?? 0
  return { ok: true, duplicate: changes === 0, backend: 'd1' }
}

const LOCAL_PATH = join(process.cwd(), '.data', 'subscribers.json')

const addToLocal = async (
  email: string,
  meta: SubscriberMeta,
): Promise<AddResult> => {
  let existing: Array<{ email: string }> = []
  try {
    existing = JSON.parse(await readFile(LOCAL_PATH, 'utf8'))
  } catch {
    existing = []
  }
  if (existing.some(s => s.email === email)) {
    return { ok: true, duplicate: true, backend: 'local' }
  }
  existing.push({ email, ...meta, created_at: new Date().toISOString() } as never)
  await mkdir(dirname(LOCAL_PATH), { recursive: true })
  await writeFile(LOCAL_PATH, JSON.stringify(existing, null, 2))
  return { ok: true, duplicate: false, backend: 'local' }
}

export type SubscriberMeta = { source: string; userAgent?: string }

export const addSubscriber = (
  email: string,
  meta: SubscriberMeta,
): Promise<AddResult> =>
  d1Configured() ? addToD1(email, meta) : addToLocal(email, meta)
