import { describe, expect, it } from 'vitest'
import { groupVisitedRestaurants } from './backend'
import { knownDishNames, summarize } from './summary'
import type { Person, Restaurant, Visit } from './types'

const ME = 'user-me'
const person = (id: string, name: string, linked: string | null = null): Person => ({
  id, owner_id: ME, name, is_me: linked === ME, linked_user_id: linked, invite_code: null,
})
const me = person('p-me', 'Saif', ME)
const sarah = person('p-sarah', 'Sarah')

const visit = (id: string, visitedAt: string, people: Person[], dishes: [Person, string, number, boolean][]): Visit => ({
  id, owner_id: ME, restaurant_id: 'r1', visited_at: visitedAt, notes: null, owner: { display_name: 'Saif' },
  visit_people: people.map((p) => ({ person: p })),
  dishes: dishes.map(([p, name, rating, again], i) => ({
    id: `${id}-${i}`, person_id: p.id, name, rating, would_order_again: again, notes: null, created_at: visitedAt,
  })),
})

// Newest first, as the API returns them.
const visits = [
  visit('v2', '2026-09-20T23:00:00Z', [me, sarah], [[me, 'khao soi ', 4, true], [sarah, 'Green Curry', 5, true]]),
  visit('v1', '2026-08-01T23:00:00Z', [me, sarah], [[me, 'Khao Soi', 5, true], [me, 'Spring Rolls', 2, false], [sarah, 'Pad Thai', 3, false]]),
]

describe('summarize', () => {
  const groups = summarize(visits, ME)

  it('puts you first, then others', () => {
    expect(groups.map((g) => g.title)).toEqual(['Your dishes', "Sarah's dishes"])
  })

  it('merges repeat dishes regardless of case and spacing, keeping the latest rating', () => {
    const khaoSoi = groups[0].items.find((i) => i.name.trim().toLowerCase() === 'khao soi')!
    expect(khaoSoi.timesOrdered).toBe(2)
    expect(khaoSoi.rating).toBe(4)
  })

  it('lists order-again dishes first, then by rating', () => {
    expect(groups[1].items.map((i) => i.name)).toEqual(['Green Curry', 'Pad Thai'])
    expect(groups[0].items.at(-1)!.name).toBe('Spring Rolls')
  })

  it('shows another user as "Your dishes" for the linked companion', () => {
    const linkedSarah = { ...sarah, linked_user_id: 'user-sarah' }
    const shared = visits.map((v) => ({ ...v, visit_people: [{ person: me }, { person: linkedSarah }] }))
    expect(summarize(shared, 'user-sarah').map((g) => g.title)).toEqual(['Your dishes', "Saif's dishes"])
  })
})

describe('knownDishNames', () => {
  it('returns each dish once, in most recent order', () => {
    expect(knownDishNames(visits)).toEqual(['khao soi', 'Green Curry', 'Spring Rolls', 'Pad Thai'])
  })
})

describe('groupVisitedRestaurants', () => {
  it('counts visits per restaurant and keeps the latest date', () => {
    const r = (id: string): Restaurant => ({ id, place_id: null, name: id, address: null, latitude: null, longitude: null })
    const grouped = groupVisitedRestaurants([
      { visited_at: '2026-09-20', restaurant: r('a') },
      { visited_at: '2026-09-10', restaurant: r('b') },
      { visited_at: '2026-08-01', restaurant: r('a') },
    ])
    expect(grouped).toEqual([
      { restaurant: r('a'), lastVisit: '2026-09-20', visitCount: 2 },
      { restaurant: r('b'), lastVisit: '2026-09-10', visitCount: 1 },
    ])
  })
})
