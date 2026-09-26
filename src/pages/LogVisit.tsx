import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { backend } from '../lib/config'
import { knownDishNames } from '../lib/summary'
import { displayName, type DraftDish, type Person, type Restaurant } from '../lib/types'
import { useUserId } from '../session'
import { ErrorNote, ReorderBadge, Sheet, StarPicker, Stars } from '../components/ui'
import { errorMessage } from '../lib/format'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let keyCounter = 0
const newKey = () => `dish-${Date.now()}-${keyCounter++}`

export default function LogVisit() {
  const { id = '' } = useParams()
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

  useEffect(() => {
    const known = passed?.id === id ? passed : null
    Promise.all([backend.myCircle(), backend.visits(id), known ? Promise.resolve(known) : backend.getRestaurant(id)])
      .then(([people, visits, r]) => {
        setCircle(people)
        const me = people.find((p) => p.is_me)
        if (me) setSelected((s) => (s.size ? s : new Set([me.id])))
        setSuggestions(knownDishNames(visits))
        if (r) setRestaurant(r)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [id, passed])

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
    setEditing({ key: newKey(), person_id: personId, name: '', rating: 0, would_order_again: false, notes: '' })
  }

  const saveDish = (dish: DraftDish) => {
    setDishes((ds) => (ds.some((d) => d.key === dish.key) ? ds.map((d) => (d.key === dish.key ? dish : d)) : [...ds, dish]))
    setEditing(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await backend.createVisit({
        restaurantId: id,
        visitedAt: date === today() ? new Date() : new Date(`${date}T19:00:00`),
        notes,
        personIds: [...selected],
        dishes,
      })
      navigate(`/r/${id}`, { replace: true, state: { restaurant } })
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const cancel = () => {
    if (dishes.length && !confirm('Discard this visit?')) return
    navigate(-1)
  }

  return (
    <>
      <header className="page-header with-back">
        <button className="back" onClick={cancel} aria-label="Cancel">‹</button>
        <div>
          <p className="muted small">Log a visit</p>
          <h1>{restaurant?.name ?? ' '}</h1>
        </div>
      </header>

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

      <ErrorNote message={error} onDismiss={() => setError(null)} />

      <div className="save-bar">
        <button className="primary wide" onClick={save} disabled={saving || dishes.length === 0 || selected.size === 0}>
          {saving ? 'Saving…' : dishes.length === 0 ? 'Add a dish to save' : `Save visit (${dishes.length} dish${dishes.length === 1 ? '' : 'es'})`}
        </button>
      </div>

      {editing && (
        <DishEditor
          dish={editing}
          people={selectedPeople}
          userId={userId}
          suggestions={suggestions}
          onCancel={() => setEditing(null)}
          onSave={saveDish}
        />
      )}
    </>
  )
}

function DishEditor(props: {
  dish: DraftDish
  people: Person[]
  userId: string | null
  suggestions: string[]
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

  return (
    <Sheet
      title={props.dish.name ? 'Edit dish' : 'Add a dish'}
      onClose={props.onCancel}
      footer={
        <>
          <button className="primary wide" disabled={!valid} onClick={() => props.onSave({ ...dish, name: dish.name.trim(), notes: dish.notes.trim() })}>
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

      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={dish.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Too spicy, ask for extra sauce..." />
      </label>
    </Sheet>
  )
}
