import { useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import { ErrorNote, errorMessage } from '../components/ui'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="signin">
      <img src="/icon.svg" alt="" className="signin-logo" />
      <h1>Resto</h1>
      <p className="muted">Remember what everyone ordered, and whether it was worth ordering again.</p>

      {backend.mode === 'demo' ? (
        <form className="stack" onSubmit={(e) => run(e, () => backend.startDemo(name))}>
          <label className="field">
            <span>Your first name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" autoFocus required />
          </label>
          <button className="primary" disabled={busy || !name.trim()}>Try the demo</button>
          <p className="fine-print">
            No Supabase project is connected, so this runs as a demo that saves to this device only.
          </p>
        </form>
      ) : !codeSent ? (
        <form className="stack" onSubmit={(e) => run(e, async () => { await backend.sendCode(email.trim()); setCodeSent(true) })}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
          </label>
          <button className="primary" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Email me a code'}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={(e) => run(e, () => backend.verifyCode(email.trim(), code))}>
          <p>We sent a sign-in code to <strong>{email}</strong>.</p>
          <label className="field">
            <span>Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="code-input"
              maxLength={10}
              autoFocus
              required
            />
          </label>
          <button className="primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="link" onClick={() => { setCodeSent(false); setCode('') }}>Use a different email</button>
        </form>
      )}
      <ErrorNote message={error} />
    </div>
  )
}
