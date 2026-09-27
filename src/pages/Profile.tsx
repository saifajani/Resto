import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import { ErrorNote } from '../components/ui'
import { LinkBackSheet } from '../components/LinkBackSheet'
import { errorMessage } from '../lib/format'
import { readThemeChoice, saveThemeChoice, THEME_CHOICES, type ThemeChoice } from '../lib/theme'

export default function Profile() {
  const [name, setName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice)
  const [inviter, setInviter] = useState<{ id: string; name: string } | null>(null)

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
            const circle = (await backend.circlesImIn()).find((p) => p.id === person.id)
            const ownerName = circle?.owner?.display_name ?? person.name
            setInviter({ id: person.owner_id, name: ownerName })
            return `You're in. Every visit ${ownerName} logs now shows up on your restaurant pages.`
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
        <p className="fine-print">
          Enter the code a friend or family member sent you. You'll see the visits they've logged, including ones you weren't on, and they'll see yours if you share back.
        </p>
        <button className="secondary" disabled={busy || code.length < 6}>Join</button>
      </form>

      {status && <p className="success-note" role="status">{status}</p>}
      <ErrorNote message={error} onDismiss={() => setError(null)} />

      {inviter && (
        <LinkBackSheet
          ownerId={inviter.id}
          ownerName={inviter.name}
          onClose={() => setInviter(null)}
          onDone={() => {
            setStatus(`You and ${inviter.name} now see each other's visits together.`)
            setInviter(null)
          }}
        />
      )}

      <div className="form-section">
        <h2>Appearance</h2>
        <div className="segmented" role="radiogroup" aria-label="Appearance">
          {THEME_CHOICES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              className={theme === value ? 'on' : ''}
              onClick={() => {
                setTheme(value)
                saveThemeChoice(value)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="fine-print">Automatic follows the light or dark setting on your phone or computer.</p>
      </div>

      <div className="form-section">
        <button className="danger-button wide" onClick={() => backend.signOut()}>Sign out</button>
      </div>
    </>
  )
}
