import { useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import { ErrorNote } from '../components/ui'
import { errorMessage } from '../lib/format'

/** Deliberately loose: the real check is whether the code arrives. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Why the form can't be sent yet. Shown only once they've tried. */
  const [hint, setHint] = useState<string | null>(null)

  const run = async (e: FormEvent, action: () => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Buttons stay enabled even when the field isn't filled in properly, because
   * a disabled button fires no events: hovering or tapping it tells you
   * nothing, which is exactly the moment you want to be told what's missing.
   */
  const guard = (e: FormEvent, ok: boolean, why: string, action: () => Promise<void>) => {
    if (!ok) {
      e.preventDefault()
      setHint(why)
      return
    }
    setHint(null)
    void run(e, action)
  }

  return (
    <div className="signin">
      <img src="/icon.svg" alt="" className="signin-logo" />
      <h1>Resto</h1>
      <p className="muted">Remember what everyone ordered, and whether it was worth ordering again.</p>

      {backend.mode === 'demo' ? (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => guard(e, !!name.trim(), 'Enter your first name so the app knows what to call you.', () => backend.startDemo(name))}
        >
          <label className="field">
            <span>Your first name</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setHint(null) }} autoComplete="given-name" autoFocus />
          </label>
          {hint && <p className="field-hint" role="alert">{hint}</p>}
          <button className="primary" disabled={busy}>Try the demo</button>
          <p className="fine-print">
            No Supabase project is connected, so this runs as a demo that saves to this device only.
          </p>
        </form>
      ) : !codeSent ? (
        <form
          className="stack"
          noValidate
          onSubmit={(e) =>
            guard(
              e,
              LOOKS_LIKE_EMAIL.test(email.trim()),
              'That does not look like an email address. It should look like name@example.com.',
              async () => {
                await backend.sendCode(email.trim())
                setCodeSent(true)
              },
            )
          }
        >
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setHint(null) }} autoComplete="email" inputMode="email" />
          </label>
          {hint && <p className="field-hint" role="alert">{hint}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
        </form>
      ) : (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => guard(e, code.length >= 6, 'Enter the 6-digit code from the email.', () => backend.verifyCode(email.trim(), code))}
        >
          <p>We sent a sign-in code to <strong>{email}</strong>.</p>
          <label className="field">
            <span>Code</span>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setHint(null) }}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="code-input"
              maxLength={10}
              autoFocus
            />
          </label>
          {hint && <p className="field-hint" role="alert">{hint}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="link" onClick={() => { setCodeSent(false); setCode(''); setHint(null) }}>Use a different email</button>
        </form>
      )}
      <ErrorNote message={error} />
    </div>
  )
}
