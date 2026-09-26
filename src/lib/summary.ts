import { displayName, visitPeople, type Person, type Visit } from './types'

export type DishSummary = {
  key: string
  name: string
  rating: number
  wouldOrderAgain: boolean
  timesOrdered: number
  notes: string | null
}

export type SummaryGroup = {
  personId: string
  title: string
  isYou: boolean
  items: DishSummary[]
}

/**
 * The "what to order" view: one group per person (you first), one row per
 * distinct dish, using the most recent rating. `visits` must be newest first.
 */
export function summarize(visits: Visit[], userId: string | null): SummaryGroup[] {
  const people = new Map<string, Person>()
  const order: string[] = []
  const byPerson = new Map<string, Map<string, DishSummary>>()

  for (const visit of visits) {
    for (const person of visitPeople(visit)) if (!people.has(person.id)) people.set(person.id, person)
    for (const dish of visit.dishes) {
      const key = dish.name.trim().toLowerCase()
      let dishes = byPerson.get(dish.person_id)
      if (!dishes) {
        dishes = new Map()
        byPerson.set(dish.person_id, dishes)
        order.push(dish.person_id)
      }
      const existing = dishes.get(key)
      if (existing) existing.timesOrdered += 1
      else
        dishes.set(key, {
          key: `${dish.person_id}-${key}`,
          name: dish.name,
          rating: dish.rating,
          wouldOrderAgain: dish.would_order_again,
          timesOrdered: 1,
          notes: dish.notes,
        })
    }
  }

  const isYou = (id: string) => displayName(people.get(id), userId) === 'You'
  const sorted = [...order.filter(isYou), ...order.filter((id) => !isYou(id))]

  return sorted.map((personId) => {
    const items = [...byPerson.get(personId)!.values()].sort(
      (a, b) =>
        Number(b.wouldOrderAgain) - Number(a.wouldOrderAgain) ||
        b.rating - a.rating ||
        b.timesOrdered - a.timesOrdered ||
        a.name.localeCompare(b.name),
    )
    const you = isYou(personId)
    const name = people.get(personId)?.name ?? 'Someone'
    return { personId, isYou: you, title: you ? 'Your dishes' : `${name}'s dishes`, items }
  })
}

/** Unique dish names from past visits, for autocomplete. */
export function knownDishNames(visits: Visit[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const dish of visits.flatMap((v) => v.dishes)) {
    const key = dish.name.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      names.push(dish.name.trim())
    }
  }
  return names
}
