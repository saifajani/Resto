import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { backend } from '../lib/config'
import { knownDishNames } from '../lib/summary'
import { shrinkPhoto } from '../lib/photo'
import { displayName, visitPeople, type DraftDish, type PendingPhoto, type Person, type Restaurant, type Visit } from '../lib/types'
import { useUserId } from '../session'
import { DishPhoto, ErrorNote, ReorderBadge, Sheet, StarPicker, Stars } from '../components/ui'
import { useObjectUrl } from '../lib/useObjectUrl'
import { errorMessage } from '../lib/format'

/** A date as the date field holds it, in local time. */
function dayOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function today(): string {
  return dayOf(new Date())
}

let keyCounter = 0
const newKey = () => `dish-${Date.now()}-${keyCounter++}`

/** Everything the form holds, to tell whether an edit has changed anything. */
function snapshot(date: string, notes: string, selected: Set<string>, dishes: DraftDish[]): string {
  return JSON.stringify([date, notes, [...selected].sort(), dishes.map((d) => ({ ...d, photo: d.photo ? 'new' : null }))])
}

/** Logs a new visit, or with a visitId in the address, edits one you logged. */
export default function LogVisit() {
  const { id = '', visitId } = useParams()
  const navigate = useNavigate()
  const userId = useUserId()
  const passed = (useLocation().state as { restaurant?: Restaurant } | null)?.restaurant
  const [restaurant, setRestaurant] = useState<Restaurant | null>(passed?.id === id ? passed : null)
  const [circle, setCircle] = useState<Person[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [dishes, setDishes] = useState<DraftDish[]>([])
  const [editing, setEditing] = useState<DraftDish | null>(null)
  const [newPerson, setNewPerson] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** When editing: the visit as saved, and the form as it started, to spot changes. */
  const [original, setOriginal] = useState<{ visit: Visit; snapshot: string } | null>(null)
  /** Links for photos that are already saved, keyed by photo_path. */
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  /** Set once the visit is saved but some photos still need uploading. */
  const [saved, setSaved] = useState<{ visitId: string; pending: PendingPhoto[]; retried: boolean } | null>(null)

  useEffect(() => {
    const known = passed?.id === id ? passed : null
    Promise.all([backend.myCircle(), backend.visits(id), known ? Promise.resolve(known) : backend.getRestaurant(id)])
      .then(([people, visits, r]) => {
        setSuggestions(knownDishNames(visits))
        if (r) setRestaurant(r)
        if (visitId) {
          const visit = visits.find((v) => v.id === visitId)
          if (!visit || visit.owner_id !== userId) {
            setError('This visit can only be edited by whoever logged it.')
            return
          }
          setCircle(people)
          const chosen = new Set(visitPeople(visit).map((p) => p.id))
          const drafts = [...visit.dishes]
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((d): DraftDish => ({
              key: d.id,
              id: d.id,
              person_id: d.person_id,
              name: d.name,
              rating: d.rating,
              would_order_again: d.would_order_again,
              notes: d.notes ?? '',
              photo: null,
              photo_path: d.photo_path,
            }))
          const day = dayOf(new Date(visit.visited_at))
          setSelected(chosen)
          setDate(day)
          setNotes(visit.notes ?? '')
          setDishes(drafts)
          setOriginal({ visit, snapshot: snapshot(day, visit.notes ?? '', chosen, drafts) })
          const paths = drafts.flatMap((d) => (d.photo_path ? [d.photo_path] : []))
          backend.photoUrls(paths).then(setPhotoUrls, () => {})
          return
        }
        setCircle(people)
        const me = people.find((p) => p.is_me)
        if (me) setSelected((s) => (s.size ? s : new Set([me.id])))
      })
      .catch((e) => setError(errorMessage(e)))
  }, [id, passed, visitId, userId])

  const selectedPeople = useMemo(() => circle.filter((p) => selected.has(p.id)), [circle, selected])
  const nameOf = (personId: string) => displayName(circle.find((p) => p.id === personId), userId)

  const toggle = (person: Person) => {
    const next = new Set(selected)
    if (next.has(person.id)) {
      if (dishes.some((d) => d.person_id === person.id)) {
        setError(`Remove ${person.name}'s dishes before taking them off the visit.`)
        return
      }
      next.delete(person.id)
    } else next.add(person.id)
    setSelected(next)
  }

  const addPerson = async () => {
    const name = newPerson.trim()
    if (!name) return
    try {
      const person = await backend.addPerson(name)
      setCircle((c) => [...c, person])
      setSelected((s) => new Set(s).add(person.id))
      setNewPerson('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  /** Suggests the next person without a dish yet, so adding a round of dishes is quick. */
  const startDish = () => {
    const withDishes = new Set(dishes.map((d) => d.person_id))
    const personId = selectedPeople.find((p) => !withDishes.has(p.id))?.id ?? dishes.at(-1)?.person_id ?? selectedPeople[0].id
    setEditing({ key: newKey(), person_id: personId, name: '', rating: 0, would_order_again: false, notes: '', photo: null })
  }

  const saveDish = (dish: DraftDish) => {
    setDishes((ds) => (ds.some((d) => d.key === dish.key) ? ds.map((d) => (d.key === dish.key ? dish : d)) : [...ds, dish]))
    setEditing(null)
  }

  const done = () => navigate(`/r/${id}`, { replace: true, state: { restaurant } })

  const isEdit = visitId !== undefined
  const changed = original !== null && snapshot(date, notes, selected, dishes) !== original.snapshot

  /** An unchanged day keeps its saved time, so editing a dish doesn't move the visit. */
  const visitedAt = () => {
    if (original && date === dayOf(new Date(original.visit.visited_at))) return new Date(original.visit.visited_at)
    return date === today() ? new Date() : new Date(`${date}T19:00:00`)
  }

  const save = async () => {
    if (isEdit && !changed) return done()
    setSaving(true)
    setError(null)
    try {
      const visit = { visitedAt: visitedAt(), notes, personIds: [...selected], dishes }
      const result = isEdit
        ? await backend.updateVisit(visitId, visit)
        : await backend.createVisit({ restaurantId: id, ...visit })
      if (result.pendingPhotos.length === 0) return done()
      setSaved({ visitId: result.visitId, pending: result.pendingPhotos, retried: false })
    } catch (e) {
      setError(errorMessage(e))
    }
    setSaving(false)
  }

  const retryPhotos = async () => {
    if (!saved) return
    setSaving(true)
    try {
      const pending = await backend.retryPhotos(saved.visitId, saved.pending)
      if (pending.length === 0) return done()
      setSaved({ ...saved, pending, retried: true })
    } catch {
      setSaved({ ...saved, retried: true })
    }
    setSaving(false)
  }

  const cancel = () => {
    if (saved) return done()
    if (isEdit ? changed && !confirm('Discard your changes?') : dishes.length && !confirm('Discard this visit?')) return
    navigate(-1)
  }

  const hasPhotos = dishes.some((d) => d.photo)
  const failedNames = saved ? saved.pending.map((p) => dishes.find((d) => d.key === p.key)?.name ?? 'a dish') : []
  const one = saved?.pending.length === 1

  return (
    <>
      <header className="page-header with-back">
        <button className="back" onClick={cancel} aria-label="Cancel">‹</button>
        <div>
          <p className="muted small">{isEdit ? 'Edit visit' : 'Log a visit'}</p>
          <h1>{restaurant?.name ?? ' '}</h1>
        </div>
      </header>

      <fieldset className="plain" disabled={saved !== null || (isEdit && !original)}>
      <section className="form-section">
        <label className="field">
          <span>When</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        </label>
      </section>

      <section className="form-section">
        <h2>Who was there</h2>
        <div className="chips">
          {circle.map((p) => (
            <button key={p.id} type="button" className={selected.has(p.id) ? 'chip on' : 'chip'} aria-pressed={selected.has(p.id)} onClick={() => toggle(p)}>
              {p.is_me ? `${p.name} (you)` : p.name}
            </button>
          ))}
        </div>
        <form
          className="inline-add"
          onSubmit={(e) => {
            e.preventDefault()
            addPerson()
          }}
        >
          <input placeholder="Add someone new" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} autoCapitalize="words" />
          <button className="secondary" disabled={!newPerson.trim()}>Add</button>
        </form>
      </section>

      <section className="form-section">
        <h2>What everyone ate</h2>
        {dishes.length > 0 && (
          <ul className="dish-list editable">
            {dishes.map((dish) => (
              <li key={dish.key}>
                <DraftPhoto dish={dish} savedUrl={dish.photo_path ? photoUrls[dish.photo_path] : undefined} />
                <button className="dish-main as-button" onClick={() => setEditing(dish)}>
                  <div className="dish-name">{dish.name}</div>
                  <div className="dish-who">{nameOf(dish.person_id)}</div>
                </button>
                <Stars rating={dish.rating} />
                <ReorderBadge yes={dish.would_order_again} />
                <button className="link danger small" aria-label={`Remove ${dish.name}`} onClick={() => setDishes((ds) => ds.filter((d) => d.key !== dish.key))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="secondary wide" onClick={startDish} disabled={selectedPeople.length === 0}>+ Add a dish</button>
      </section>

      <section className="form-section">
        <label className="field">
          <span>Notes</span>
          <textarea rows={2} placeholder="Anything worth remembering about the visit?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>
      </fieldset>

      <ErrorNote message={error} onDismiss={() => setError(null)} />

      <div className="save-bar">
        {saved ? (
          <div className="photo-failed-bar">
            {/* In the pinned bar so it can't be missed below the fold. */}
            <div className="photo-failed" role="alert">
              <p>
                <strong>{isEdit ? 'Your changes are saved' : 'Your visit is saved'}</strong>, but {one ? 'the photo' : `${saved.pending.length} photos`} of{' '}
                {listNames(failedNames)} didn't upload. This usually means the connection dropped.
              </p>
              <p>
                {saved.retried
                  ? `Still couldn't upload. Try again when you have a better signal, or skip and keep the visit without ${one ? 'it' : 'them'}.`
                  : `The ${one ? 'photo is' : 'photos are'} still here, so you can try again now or skip ${one ? 'it' : 'them'}.`}
              </p>
            </div>
            <div className="choices">
              <button className="secondary" onClick={done} disabled={saving}>Skip {one ? 'photo' : 'photos'}</button>
              <button className="primary" onClick={retryPhotos} disabled={saving}>{saving ? 'Uploading…' : 'Try again'}</button>
            </div>
          </div>
        ) : (
          <button className="primary wide" onClick={save} disabled={saving || dishes.length === 0 || selected.size === 0 || (isEdit && !original)}>
            {saving
              ? hasPhotos ? 'Saving visit and photos…' : 'Saving…'
              : dishes.length === 0
                ? 'Add a dish to save'
                : isEdit
                  ? 'Save changes'
                  : `Save visit (${dishes.length} dish${dishes.length === 1 ? '' : 'es'})`}
          </button>
        )}
      </div>

      {editing && (
        <DishEditor
          dish={editing}
          people={selectedPeople}
          userId={userId}
          suggestions={suggestions}
          savedUrl={editing.photo_path ? photoUrls[editing.photo_path] : undefined}
          onCancel={() => setEditing(null)}
          onSave={saveDish}
        />
      )}
    </>
  )
}

/** "Khao Soi", "Khao Soi and Pad Thai", "Khao Soi, Pad Thai and Fries" */
function listNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** A new photo from this device, or else the one already saved with the dish. */
function DraftPhoto({ dish, savedUrl }: { dish: DraftDish; savedUrl: string | undefined }) {
  return <DishPhoto url={useObjectUrl(dish.photo) ?? savedUrl} name={dish.name} />
}

function DishEditor(props: {
  dish: DraftDish
  people: Person[]
  userId: string | null
  suggestions: string[]
  /** The link for the dish's saved photo, when it has one. */
  savedUrl: string | undefined
  onCancel: () => void
  onSave: (dish: DraftDish) => void
}) {
  const [dish, setDish] = useState(props.dish)
  const update = (patch: Partial<DraftDish>) => setDish((d) => ({ ...d, ...patch }))
  const typed = dish.name.trim().toLowerCase()
  const matches = props.suggestions
    .filter((s) => (typed ? s.toLowerCase().includes(typed) && s.toLowerCase() !== typed : true))
    .slice(0, 8)
  const valid = dish.name.trim().length > 0 && dish.rating >= 1
  const newPhotoUrl = useObjectUrl(dish.photo)
  // Shown until it's removed or a new photo replaces it.
  const photoUrl = newPhotoUrl ?? (dish.photo_path ? props.savedUrl : undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    setPreparing(true)
    setPhotoError(null)
    try {
      update({ photo: await shrinkPhoto(file) })
    } catch (e) {
      setPhotoError(errorMessage(e))
    }
    setPreparing(false)
  }

  return (
    <Sheet
      title={props.dish.name ? 'Edit dish' : 'Add a dish'}
      onClose={props.onCancel}
      footer={
        <>
          <button className="primary wide" disabled={!valid || preparing} onClick={() => props.onSave({ ...dish, name: dish.name.trim(), notes: dish.notes.trim() })}>
            {props.dish.name ? 'Save dish' : 'Add dish'}
          </button>
          {!valid && <span className="hint">{dish.name.trim() ? 'Tap a star rating to add it' : 'Enter a dish name and rating'}</span>}
        </>
      }
    >
      <div className="field">
        <span>Who ate it</span>
        <div className="chips">
          {props.people.map((p) => (
            <button key={p.id} type="button" className={dish.person_id === p.id ? 'chip on' : 'chip'} aria-pressed={dish.person_id === p.id} onClick={() => update({ person_id: p.id })}>
              {displayName(p, props.userId)}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Dish</span>
        <input value={dish.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Khao soi" autoCapitalize="words" autoFocus={!dish.name} />
      </label>
      {matches.length > 0 && (
        <div className="chips suggestions" aria-label="Dishes from past visits">
          {matches.map((s) => (
            <button key={s} type="button" className="chip small" onClick={() => update({ name: s })}>{s}</button>
          ))}
        </div>
      )}

      <div className="field">
        <span>How was it?</span>
        <StarPicker value={dish.rating} onChange={(rating) => update({ rating })} />
      </div>

      <label className="toggle">
        <span>Would order again</span>
        <input type="checkbox" checked={dish.would_order_again} onChange={(e) => update({ would_order_again: e.target.checked })} />
        <span className="switch" aria-hidden="true" />
      </label>

      <div className="field">
        <span>Photo</span>
        {/* No capture attribute, so iPhone offers both Take Photo and Photo Library. */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose a photo"
          onChange={(e) => {
            pickPhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {preparing ? (
          <p className="muted small">Preparing photo…</p>
        ) : photoUrl || dish.photo || dish.photo_path ? (
          <div className="photo-field">
            <DishPhoto url={photoUrl} name={dish.name || 'this dish'} size="large" />
            <div className="stack">
              <button type="button" className="link" onClick={() => fileInput.current?.click()}>Replace photo</button>
              <button type="button" className="link danger" onClick={() => update({ photo: null, photo_path: null })}>Remove photo</button>
            </div>
          </div>
        ) : (
          <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>Add photo</button>
        )}
        <ErrorNote message={photoError} onDismiss={() => setPhotoError(null)} />
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={dish.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Too spicy, ask for extra sauce..." />
      </label>
    </Sheet>
  )
}
