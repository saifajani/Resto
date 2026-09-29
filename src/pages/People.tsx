import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import type { Person } from '../lib/types'
import { ErrorNote, Sheet, Spinner } from '../components/ui'
import { errorMessage } from '../lib/format'
import { LinkBackSheet } from '../components/LinkBackSheet'
import { inviteLink } from '../lib/invite'

type Invite = { personName: string; code: string }

export default function People() {
  const [circle, setCircle] = useState<Person[] | null>(null)
  const [joined, setJoined] = useState<Person[]>([])
  const [newName, setNewName] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [linkBack, setLinkBack] = useState<{ id: string; name: string } | null>(null)
  const [invitingNew, setInvitingNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([backend.myCircle(), backend.circlesImIn()])
      .then(([mine, theirs]) => {
        setCircle(mine)
        setJoined(theirs)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      const person = await backend.addPerson(name)
      setCircle((c) => [...(c ?? []), person])
      setNewName('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async (person: Person) => {
    if (!confirm(`Remove ${person.name} from your circle?`)) return
    try {
      await backend.deletePerson(person.id)
      setCircle((c) => (c ?? []).filter((p) => p.id !== person.id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  /**
   * Invites someone who isn't in the circle yet. An invite code always points
   * at a person, since that is what the code links their account to, so this
   * adds them first rather than asking the user to do it in two steps.
   */
  const inviteSomeone = async (name: string) => {
    const person = await backend.addPerson(name)
    setCircle((c) => [...(c ?? []), person])
    // The sheet stays open until there is a code, so that if making one fails
    // the sheet is still there to say so. The person is added either way.
    const code = await backend.createInvite(person.id)
    setInvitingNew(false)
    setInvite({ personName: person.name, code })
  }

  const makeInvite = async (person: Person) => {
    try {
      setInvite({ personName: person.name, code: await backend.createInvite(person.id) })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>People</h1>
      </header>
      <ErrorNote message={error} onDismiss={() => setError(null)} />

      <section>
        <h2>Your circle</h2>
        {circle === null ? (
          <div className="list-empty"><Spinner /></div>
        ) : (
          <ul className="list">
            {circle.map((person) => (
              <li key={person.id} className="row static">
                <div className="row-main">
                  <div className="row-title">{person.name}</div>
                  {person.is_me && <div className="row-sub">You</div>}
                </div>
                {!person.is_me &&
                  (person.linked_user_id ? (
                    <span className="badge yes">Joined</span>
                  ) : (
                    <button className="secondary small" onClick={() => makeInvite(person)}>Invite</button>
                  ))}
                {!person.is_me && (
                  <button className="link danger small" aria-label={`Remove ${person.name}`} onClick={() => remove(person)}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="inline-add padded" onSubmit={add}>
          <input placeholder="Add a person" value={newName} onChange={(e) => setNewName(e.target.value)} autoCapitalize="words" />
          <button className="secondary" disabled={!newName.trim()}>Add</button>
        </form>
        <div className="padded invite-someone">
          <button className="secondary wide" onClick={() => setInvitingNew(true)}>Invite someone</button>
        </div>
        <p className="fine-print padded">
          People you eat with don't need an account. Invite someone if you want to share your visit log with them and to see theirs once they share back.
        </p>
      </section>

      {joined.length > 0 && (
        <section>
          <h2>Circles you're in</h2>
          <ul className="list">
            {joined.map((p) => (
              <li key={p.id} className="row static">
                <div className="row-main">
                  <div className="row-title">{p.owner?.display_name ?? 'Someone'}'s circle</div>
                  <div className="row-sub">They added you as {p.name}</div>
                </div>
                {circle?.some((mine) => mine.linked_user_id === p.owner_id) ? (
                  <span className="badge yes">Both ways</span>
                ) : (
                  circle && (
                    <button className="secondary small" onClick={() => setLinkBack({ id: p.owner_id, name: p.owner?.display_name ?? p.name })}>
                      Share back
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {invitingNew && (
        <InviteSomeoneSheet
          onClose={() => setInvitingNew(false)}
          onInvite={inviteSomeone}
        />
      )}
      {invite && <InviteSheet invite={invite} onClose={() => setInvite(null)} />}
      {linkBack && (
        <LinkBackSheet
          ownerId={linkBack.id}
          ownerName={linkBack.name}
          onClose={() => setLinkBack(null)}
          onDone={(person) => {
            setCircle((c) => [...(c ?? []).filter((x) => x.id !== person.id), person])
            setLinkBack(null)
          }}
        />
      )}
    </>
  )
}

/** Asks who is being invited, then hands the name back to be added and invited. */
function InviteSomeoneSheet({ onClose, onInvite }: { onClose: () => void; onInvite: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onInvite(name.trim())
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Invite someone"
      onClose={onClose}
      footer={
        <button className="primary wide" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? 'Making a code' : 'Get their code'}
        </button>
      }
    >
      <form onSubmit={submit}>
        <ErrorNote message={error} onDismiss={() => setError(null)} />
        <label className="field padded">
          <span>Who are you inviting?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoFocus placeholder="Their name" />
        </label>
        <p className="fine-print padded">
          They'll be added to your circle, so you can pick them when you log a visit.
        </p>
      </form>
    </Sheet>
  )
}

function InviteSheet({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  // The app first: someone who has it installed should not be sent to a browser
  // tab, which is a separate copy with its own storage and its own sign-in.
  // The link is the second line for exactly that reason: it is for the person
  // who hasn't got Resto yet, and it carries the code through signing up.
  const link = inviteLink(window.location.origin, invite.code)
  const message = [
    `I'm using Resto to keep track of what we order at restaurants.`,
    `Join my circle so we can see each other's ratings. If you already have Resto, open it and enter invite code ${invite.code} on the Profile tab.`,
    `If you don't have it yet, start here and it will set you up: ${link}`,
  ].join('\n\n')

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: message })
      } catch {
        // Closing the share sheet rejects; nothing to do.
      }
      return
    }
    await navigator.clipboard.writeText(message)
    setCopied(true)
  }

  return (
    <Sheet
      title={`Invite ${invite.personName}`}
      onClose={onClose}
      footer={<button className="primary wide" onClick={share}>{copied ? 'Copied to clipboard' : 'Send invite'}</button>}
    >
      <div className="invite">
        <p className="muted">Send {invite.personName} this code:</p>
        <div className="invite-code">{invite.code}</div>
        <p className="muted">When {invite.personName} enters it in Resto, they'll see every visit you log, not only the ones you were both on. You'll see theirs when they share back.</p>
        <p className="fine-print">Send invite shares the code and this link, which sets them up if they don't have Resto yet: <span className="invite-url">{link}</span></p>
      </div>
    </Sheet>
  )
}
