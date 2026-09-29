import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backend } from '../lib/config'
import { ErrorNote } from '../components/ui'
import { LinkBackSheet } from '../components/LinkBackSheet'
import { errorMessage } from '../lib/format'
import { normalizeInviteCode } from '../lib/invite'

/**
 * Where an invite link lands: /join/<code>, after signing in. The code is
 * already in the address, so this is one tap rather than hunting for the
 * Profile tab, which is what the plain code still asks of you.
 *
 * It is a whole screen rather than a sheet because it is a step in signing up.
 * Finishing it, or skipping it, goes to the restaurant list, which is where
 * the Add to Home Screen nudge is waiting.
 */
export default function JoinInvite() {
  const { code: raw = '' } = useParams()
  const code = normalizeInviteCode(raw)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The person whose invite this was, once it has been redeemed. */
  const [inviter, setInviter] = useState<{ id: string; name: string } | null>(null)
  const [sharedBack, setSharedBack] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const leave = () => navigate('/', { replace: true })

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const person = await backend.claimInvite(code)
      const circle = (await backend.circlesImIn()).find((p) => p.id === person.id)
      setInviter({ id: person.owner_id, name: circle?.owner?.display_name ?? person.name })
      setSheetOpen(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (inviter) {
    return (
      <div className="signin">
        <h1>You're in</h1>
        <p className="muted">
          Every visit {inviter.name} logs now shows up on your restaurant pages, including the ones you weren't on.
        </p>
        {sharedBack ? (
          <p className="success-note" role="status">
            You and {inviter.name} now see each other's visits.
          </p>
        ) : (
          <p className="fine-print">
            {inviter.name} can't see your visits yet. You can share back any time from the People tab.
          </p>
        )}
        <div className="stack">
          <button className="primary" onClick={leave}>Continue</button>
        </div>
        {sheetOpen && (
          <LinkBackSheet
            ownerId={inviter.id}
            ownerName={inviter.name}
            onClose={() => setSheetOpen(false)}
            onDone={() => {
              setSharedBack(true)
              setSheetOpen(false)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="signin">
      <img src="/icon.svg" alt="" className="signin-logo" />
      <h1>You've been invited</h1>
      <p className="muted">Join their circle to see what they thought of everything they've ordered.</p>
      <div className="invite-code">{code || '------'}</div>
      <div className="stack">
        <button className="primary" disabled={busy || code.length < 6} onClick={join}>
          {busy ? 'Joining…' : 'Join'}
        </button>
        <button type="button" className="link" onClick={leave}>Not now</button>
        <p className="fine-print">
          You'll see every visit they log. They'll see yours only if you share back, which we'll ask about next.
        </p>
      </div>
      <ErrorNote message={error} onDismiss={() => setError(null)} />
    </div>
  )
}
