import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../lib/config'
import type { Person } from '../lib/types'
import { ErrorNote, Sheet, Spinner } from '../components/ui'
import { errorMessage } from '../lib/format'
import { LinkBackSheet } from '../components/LinkBackSheet'

type Invite = { personName: string; code: string }

export default function People() {
  const [circle, setCircle] = useState<Person[] | null>(null)
  const [joined, setJoined] = useState<Person[]>([])
  const [newName, setNewName] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [linkBack, setLinkBack] = useState<{ id: string; name: string } | null>(null)
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
        <p className="fine-print padded">
          People you eat with don't need an account. If they want to see what you've been ordering, tap Invite and send them the code.
          Once they sign in and enter it, they'll see every visit you log, past and future. You'll see theirs when they share back.
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

function InviteSheet({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  // The app first: someone who has it installed should not be sent to a browser
  // tab, which is a separate copy with its own storage and its own sign-in.
  const message = [
    `I'm using Resto to keep track of what we order at restaurants.`,
    `Join my circle so we can see each other's ratings. Open the app and enter invite code ${invite.code} on the Profile tab.`,
    `If you don't have it yet, open ${window.location.origin}, sign in, and enter the code ${invite.code} on the Profile tab.`,
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
      </div>
    </Sheet>
  )
}
