'use client'

import { track } from '@vercel/analytics'
import { useState, type FormEvent } from 'react'

type Status = 'idle' | 'loading' | 'ok' | 'dup' | 'error'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const interestUrl = (): string => {
  const env = process.env.NEXT_PUBLIC_PUZZLE_WS_URL?.trim()
  if (env) {
    try {
      const u = new URL(env.replace(/^ws/i, 'http'))
      u.pathname = '/interest'
      u.search = ''
      return u.toString()
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8799/interest'
  }
  return 'https://arman-puzzle.armancharan.workers.dev/interest'
}

export const WaitlistForm = ({
  compact = false,
  id = 'vl-email',
}: {
  compact?: boolean
  id?: string
}) => {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [website, setWebsite] = useState('') // honeypot

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleaned = email.trim().toLowerCase()
    if (!EMAIL.test(cleaned)) {
      setStatus('error')
      return
    }
    setStatus('loading')
    track('verifiedloops_interest_submit', { source: 'verified-loops' })
    try {
      const res = await fetch(interestUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: cleaned, website, source: 'verified-loops' }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        duplicate?: boolean
      }
      if (!res.ok || !data.ok) {
        setStatus('error')
        return
      }
      setStatus(data.duplicate ? 'dup' : 'ok')
      track('verifiedloops_interest_ok', {
        source: 'verified-loops',
        duplicate: Boolean(data.duplicate),
      })
    } catch {
      setStatus('error')
    }
  }

  if (status === 'ok' || status === 'dup') {
    return (
      <p className={`vl-form-done ${compact ? 'vl-form-done-compact' : ''}`}>
        {status === 'dup'
          ? 'You are already on the list.'
          : 'You are on the list. We will write when the first cohort opens.'}
      </p>
    )
  }

  return (
    <form className={`vl-form ${compact ? 'vl-form-compact' : ''}`} onSubmit={onSubmit}>
      <label className="vl-sr-only" htmlFor={id}>
        Email
      </label>
      <input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={e => {
          setEmail(e.target.value)
          if (status === 'error') setStatus('idle')
        }}
        className="vl-input"
      />
      {/* honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={e => setWebsite(e.target.value)}
        className="vl-honeypot"
        aria-hidden
      />
      <button type="submit" className="vl-submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Request a seat'}
      </button>
      {status === 'error' ? (
        <p className="vl-form-error" role="alert">
          Could not save that email. Check it and try again.
        </p>
      ) : null}
    </form>
  )
}
