import { useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import { ErrorNote } from '../components/ui'
import { errorMessage } from '../lib/format'

/** First-run prompt so the people you share with see your real name. */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await backend.setDisplayName(name.trim())
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <h1>Welcome</h1>
      <p className="muted">What should we call you? This is how you'll show up to people you share visits with.</p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Your first name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" autoFocus required />
        </label>
        <button className="primary" disabled={busy || !name.trim()}>Continue</button>
      </form>
      <ErrorNote message={error} />
    </div>
  )
}
