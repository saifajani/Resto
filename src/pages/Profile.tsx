import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import { ErrorNote } from '../components/ui'
import { errorMessage } from '../lib/format'

export default function Profile() {
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    backend.myProfile().then((p) => {
      setName(p.display_name)
      setSavedName(p.display_name)
    }, (e) => setError(errorMessage(e)))
  }, [])

  const run = async (e: FormEvent, action: () => Promise<string>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      setStatus(await action())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Profile</h1>
      </header>

      <form
        className="form-section"
        onSubmit={(e) =>
          run(e, async () => {
            await backend.setDisplayName(name.trim())
            setSavedName(name.trim())
            return 'Name saved.'
          })
        }
      >
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </label>
        <p className="fine-print">This is how you appear to people you share visits with.</p>
        <button className="secondary" disabled={busy || !name.trim() || name.trim() === savedName}>Save name</button>
      </form>

      <form
        className="form-section"
        onSubmit={(e) =>
          run(e, async () => {
            const person = await backend.claimInvite(code)
            setCode('')
            return `You're in. Visits logged with ${person.name} now show up on your restaurant pages.`
          })
        }
      >
        <label className="field">
          <span>Got an invite code?</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            className="code-input"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <p className="fine-print">Enter the code a friend or family member sent you to see the visits they've logged with you.</p>
        <button className="secondary" disabled={busy || code.length < 6}>Join</button>
      </form>

      {status && <p className="success-note" role="status">{status}</p>}
      <ErrorNote message={error} onDismiss={() => setError(null)} />

      <div className="form-section">
        <button className="danger-button wide" onClick={() => backend.signOut()}>Sign out</button>
      </div>
    </>
  )
}
