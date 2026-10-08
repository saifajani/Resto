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
    id: `${id}-${i}`, person_id: p.id, name, rating, would_order_again: again, notes: null, photo_path: null, created_at: visitedAt,
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

describe('summarize across two circles', () => {
  // Saif and Sarah are linked both ways, and each logs a visit to the same place.
  const SARAH = 'user-sarah'
  const sarahInMine = { ...sarah, linked_user_id: SARAH }
  const sarahsMe: Person = { id: 's-me', owner_id: SARAH, name: 'Sarah K', is_me: true, linked_user_id: SARAH, invite_code: null }
  const meInSarahs: Person = { id: 's-saif', owner_id: SARAH, name: 'Hubby', is_me: false, linked_user_id: ME, invite_code: null }
  const withPhoto = (v: Visit, name: string, path: string): Visit => ({
    ...v, dishes: v.dishes.map((d) => (d.name === name ? { ...d, photo_path: path } : d)),
  })
  const both = [
    { ...visit('v3', '2026-09-25T23:00:00Z', [sarahsMe, meInSarahs], [[meInSarahs, 'Khao Soi', 3, false], [sarahsMe, 'Green Curry', 4, true]]), owner_id: SARAH },
    withPhoto(visit('v2', '2026-09-20T23:00:00Z', [me, sarahInMine], [[me, 'Khao Soi', 5, true], [sarahInMine, 'Green Curry', 5, true]]), 'Khao Soi', 'photo-v2'),
  ]

  it('shows each person once, whoever logged the visit', () => {
    expect(summarize(both, ME).map((g) => g.title)).toEqual(['Your dishes', "Sarah's dishes"])
  })

  it("uses the viewer's own name for someone", () => {
    expect(summarize(both, SARAH).map((g) => g.title)).toEqual(['Your dishes', "Hubby's dishes"])
  })

  it('merges the same dish from both circles, keeping the newest rating', () => {
    const khaoSoi = summarize(both, ME)[0].items.find((i) => i.name === 'Khao Soi')!
    expect(khaoSoi.timesOrdered).toBe(2)
    expect(khaoSoi.rating).toBe(3)
  })

  it('uses the newest photo of a dish, even from an older visit', () => {
    const khaoSoi = summarize(both, ME)[0].items.find((i) => i.name === 'Khao Soi')!
    expect(khaoSoi.photoPath).toBe('photo-v2')
  })

  it('keeps people without an account apart by person', () => {
    const kid = person('p-kid', 'Zayn')
    const withKid = [visit('v4', '2026-09-26T23:00:00Z', [me, kid], [[kid, 'Fries', 5, true]]), ...both]
    expect(summarize(withKid, ME).map((g) => g.title)).toEqual(['Your dishes', "Zayn's dishes", "Sarah's dishes"])
  })
})

describe('knownDishNames', () => {
  it('returns each dish once, in most recent order', () => {
    expect(knownDishNames(visits)).toEqual(['khao soi', 'Green Curry', 'Spring Rolls', 'Pad Thai'])
  })
})

describe('groupVisitedRestaurants', () => {
  const r = (id: string): Restaurant => ({ id, place_id: null, name: id, address: null, latitude: null, longitude: null })
  const withMe = [{ person: me }, { person: sarah }]
  const withoutMe = [{ person: sarah }]

  it('counts visits per restaurant and keeps the latest date', () => {
    const grouped = groupVisitedRestaurants(
      [
        { visited_at: '2026-09-20', restaurant: r('a'), visit_people: withMe },
        { visited_at: '2026-09-10', restaurant: r('b'), visit_people: withMe },
        { visited_at: '2026-08-01', restaurant: r('a'), visit_people: withMe },
      ],
      ME,
    )
    expect(grouped).toEqual([
      { restaurant: r('a'), lastVisit: '2026-09-20', beenThere: true, myLastVisit: '2026-09-20', visitCount: 2, visitedByCircle: false },
      { restaurant: r('b'), lastVisit: '2026-09-10', beenThere: true, myLastVisit: '2026-09-10', visitCount: 1, visitedByCircle: false },
    ])
  })

  it('marks a restaurant only your circle went to', () => {
    const [a] = groupVisitedRestaurants([{ visited_at: '2026-09-20', restaurant: r('a'), visit_people: withoutMe }], ME)
    expect(a.myLastVisit).toBe(null)
    expect(a.beenThere).toBe(false)
    expect(a.visitedByCircle).toBe(true)
  })

  it('counts a visit with no date as one you were on, without dating the list by it', () => {
    const [a] = groupVisitedRestaurants([{ visited_at: null, restaurant: r('a'), visit_people: withMe }], ME)
    expect(a).toMatchObject({ beenThere: true, myLastVisit: null, lastVisit: null, visitCount: 1 })
  })

  it('dates the list by a dated visit even when an undated one is listed', () => {
    // Undated visits come last, as the queries order them.
    const [a] = groupVisitedRestaurants(
      [
        { visited_at: '2026-08-01', restaurant: r('a'), visit_people: withMe },
        { visited_at: null, restaurant: r('a'), visit_people: withMe },
      ],
      ME,
    )
    expect(a).toMatchObject({ beenThere: true, myLastVisit: '2026-08-01', lastVisit: '2026-08-01', visitCount: 2 })
  })

  it('dates the list by your own latest visit, never someone else\'s', () => {
    const [a] = groupVisitedRestaurants(
      [
        { visited_at: '2026-09-20', restaurant: r('a'), visit_people: withoutMe },
        { visited_at: '2026-08-01', restaurant: r('a'), visit_people: withMe },
      ],
      ME,
    )
    expect(a.myLastVisit).toBe('2026-08-01')
    expect(a.lastVisit).toBe('2026-09-20')
    expect(a.visitedByCircle).toBe(true)
  })

  it('treats a visit with nobody on it as not yours', () => {
    const [a] = groupVisitedRestaurants([{ visited_at: '2026-09-20', restaurant: r('a'), visit_people: [] }], ME)
    expect(a.myLastVisit).toBe(null)
  })
})
