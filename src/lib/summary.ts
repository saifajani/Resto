import { visitPeople, type Person, type Visit } from './types'

export type DishSummary = {
  key: string
  name: string
  rating: number
  wouldOrderAgain: boolean
  timesOrdered: number
  notes: string | null
  /** The newest photo of this dish, if any visit has one. */
  photoPath: string | null
}

export type SummaryGroup = {
  /** The person's account id when they have one, otherwise their person id. */
  key: string
  title: string
  isYou: boolean
  items: DishSummary[]
}

/**
 * The same human can be a different person row in each circle: "Sarah" in
 * yours, and Sarah's own "me" in hers. Once someone has an account, their
 * dishes are grouped by that account so they show up as one person.
 */
const groupKey = (person: Person | undefined, personId: string) => person?.linked_user_id ?? personId

/**
 * The "what to order" view: one group per person (you first), one row per
 * distinct dish, using the most recent rating. `visits` must be newest first.
 */
export function summarize(visits: Visit[], userId: string | null): SummaryGroup[] {
  const people = new Map<string, Person>()
  /** The name to show for each group, preferring the one from your own circle. */
  const names = new Map<string, Person>()
  const order: string[] = []
  const byGroup = new Map<string, Map<string, DishSummary>>()

  for (const visit of visits) {
    for (const person of visitPeople(visit)) {
      if (!people.has(person.id)) people.set(person.id, person)
      const group = groupKey(person, person.id)
      const named = names.get(group)
      if (!named || (named.owner_id !== userId && person.owner_id === userId)) names.set(group, person)
    }
    for (const dish of visit.dishes) {
      const group = groupKey(people.get(dish.person_id), dish.person_id)
      const key = dish.name.trim().toLowerCase()
      let dishes = byGroup.get(group)
      if (!dishes) {
        dishes = new Map()
        byGroup.set(group, dishes)
        order.push(group)
      }
      const existing = dishes.get(key)
      if (existing) {
        existing.timesOrdered += 1
        existing.photoPath ??= dish.photo_path
      } else
        dishes.set(key, {
          key: `${group}-${key}`,
          name: dish.name,
          rating: dish.rating,
          wouldOrderAgain: dish.would_order_again,
          timesOrdered: 1,
          notes: dish.notes,
          photoPath: dish.photo_path,
        })
    }
  }

  const isYou = (group: string) => userId !== null && group === userId
  const sorted = [...order.filter(isYou), ...order.filter((group) => !isYou(group))]

  return sorted.map((group) => {
    const items = [...byGroup.get(group)!.values()].sort(
      (a, b) =>
        Number(b.wouldOrderAgain) - Number(a.wouldOrderAgain) ||
        b.rating - a.rating ||
        b.timesOrdered - a.timesOrdered ||
        a.name.localeCompare(b.name),
    )
    const you = isYou(group)
    const name = names.get(group)?.name ?? 'Someone'
    return { key: group, isYou: you, title: you ? 'Your dishes' : `${name}'s dishes`, items }
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
