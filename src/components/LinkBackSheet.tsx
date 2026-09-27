import { useEffect, useState } from 'react'
import { backend } from '../lib/config'
import type { Person } from '../lib/types'
import { ErrorNote, Sheet, Spinner } from './ui'
import { errorMessage } from '../lib/format'

const NEW = 'new'

/**
 * Shown after redeeming someone's invite: pick which person in your circle is
 * them, so they see the visits you log with them too.
 */
export function LinkBackSheet({
  ownerId,
  ownerName,
  onDone,
  onClose,
}: {
  ownerId: string
  ownerName: string
  onDone: (person: Person) => void
  onClose: () => void
}) {
  const [choices, setChoices] = useState<Person[] | null>(null)
  const [picked, setPicked] = useState<string>(NEW)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    backend.myCircle().then((circle) => {
      const already = circle.find((p) => p.linked_user_id === ownerId)
      if (already) {
        onDone(already)
        return
      }
      const open = circle.filter((p) => !p.is_me && !p.linked_user_id)
      const match = open.find((p) => p.name.trim().toLowerCase() === ownerName.trim().toLowerCase())
      setChoices(open)
      if (match) setPicked(match.id)
    }, (e) => setError(errorMessage(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, ownerName])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      onDone(await backend.linkBack(ownerId, picked === NEW ? null : picked))
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={`Share back with ${ownerName}`}
      onClose={onClose}
      footer={
        <button className="primary wide" disabled={busy || choices === null} onClick={save}>
          {busy ? 'Saving…' : 'Share back'}
        </button>
      }
    >
      <p className="muted">
        Who is {ownerName} in your People list? {ownerName} will see the visits you log with them, the same way you see theirs.
      </p>
      {choices === null ? (
        !error && <div className="list-empty"><Spinner /></div>
      ) : (
        <div className="chips" role="radiogroup" aria-label={`Who is ${ownerName}`}>
          {choices.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={picked === p.id} className={picked === p.id ? 'chip on' : 'chip'} onClick={() => setPicked(p.id)}>
              {p.name}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={picked === NEW} className={picked === NEW ? 'chip on' : 'chip'} onClick={() => setPicked(NEW)}>
            Not in my list, add {ownerName}
          </button>
        </div>
      )}
      <ErrorNote message={error} />
    </Sheet>
  )
}
