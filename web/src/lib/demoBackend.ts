import { groupVisitedRestaurants, type AuthListener, type Backend } from './backend'
import type { Dish, NewVisit, Person, Profile, Restaurant, Visit } from './types'

/**
 * A single-user backend that keeps everything in this browser's localStorage.
 * Used when no Supabase project is configured, so the app can be tried
 * without any setup. Sharing and invites need the real backend.
 */

type StoredVisit = Omit<Visit, 'owner' | 'visit_people' | 'dishes'> & { person_ids: string[] }
type StoredDish = Dish & { visit_id: string }

type Store = {
  userId: string | null
  profile: Profile
  people: Person[]
  restaurants: Restaurant[]
  visits: StoredVisit[]
  dishes: StoredDish[]
}

const KEY = 'resto-demo-v1'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function emptyStore(): Store {
  return { userId: null, profile: { display_name: 'Me' }, people: [], restaurants: [], visits: [], dishes: [] }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...emptyStore(), ...JSON.parse(raw) } : emptyStore()
  } catch {
    return emptyStore()
  }
}

export function createDemoBackend(): Backend {
  let store = load()
  const listeners = new Set<AuthListener>()

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      // Storage can be unavailable (private mode). The session still works in memory.
    }
  }
  const notify = () => listeners.forEach((l) => l(store.userId))
  const me = () => {
    if (!store.userId) throw new Error('Not signed in')
    return store.userId
  }
  const toVisit = (v: StoredVisit): Visit => ({
    id: v.id,
    owner_id: v.owner_id,
    restaurant_id: v.restaurant_id,
    visited_at: v.visited_at,
    notes: v.notes,
    owner: store.profile,
    visit_people: v.person_ids.map((id) => ({ person: store.people.find((p) => p.id === id) ?? null })),
    dishes: store.dishes.filter((d) => d.visit_id === v.id).map(({ visit_id: _visitId, ...dish }) => dish),
  })
  const newestFirst = (a: { visited_at: string }, b: { visited_at: string }) => b.visited_at.localeCompare(a.visited_at)

  return {
    mode: 'demo',

    onAuthChange(listener) {
      listeners.add(listener)
      setTimeout(() => listener(store.userId), 0)
      return () => listeners.delete(listener)
    },

    async sendCode() {
      throw new Error('Email sign-in needs Supabase. Use the demo instead.')
    },

    async verifyCode() {
      throw new Error('Email sign-in needs Supabase. Use the demo instead.')
    },

    async startDemo(name) {
      const userId = store.userId ?? uuid()
      const displayName = name.trim() || 'Me'
      store.userId = userId
      store.profile = { display_name: displayName }
      if (!store.people.some((p) => p.is_me)) {
        store.people.push({ id: uuid(), owner_id: userId, name: displayName, is_me: true, linked_user_id: userId, invite_code: null })
      }
      save()
      notify()
    },

    async signOut() {
      store.userId = null
      save()
      notify()
    },

    async restaurantForPlace(place) {
      let restaurant = store.restaurants.find((r) => r.place_id === place.id)
      if (!restaurant) {
        restaurant = {
          id: uuid(),
          place_id: place.id,
          name: place.name,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        }
        store.restaurants.push(restaurant)
        save()
      }
      return restaurant
    },

    async getRestaurant(id) {
      return store.restaurants.find((r) => r.id === id) ?? null
    },

    async visitedRestaurants() {
      const rows = [...store.visits].sort(newestFirst).flatMap((v) => {
        const restaurant = store.restaurants.find((r) => r.id === v.restaurant_id)
        return restaurant ? [{ visited_at: v.visited_at, restaurant }] : []
      })
      return groupVisitedRestaurants(rows)
    },

    async visits(restaurantId) {
      return store.visits.filter((v) => v.restaurant_id === restaurantId).sort(newestFirst).map(toVisit)
    },

    async createVisit(visit: NewVisit) {
      const id = uuid()
      const personIds = [...new Set([...visit.personIds, ...visit.dishes.map((d) => d.person_id)])]
      store.visits.push({
        id,
        owner_id: me(),
        restaurant_id: visit.restaurantId,
        visited_at: visit.visitedAt.toISOString(),
        notes: visit.notes.trim() || null,
        person_ids: personIds,
      })
      const now = Date.now()
      visit.dishes.forEach((d, i) => {
        store.dishes.push({
          id: uuid(),
          visit_id: id,
          person_id: d.person_id,
          name: d.name.trim(),
          rating: d.rating,
          would_order_again: d.would_order_again,
          notes: d.notes.trim() || null,
          created_at: new Date(now + i).toISOString(),
        })
      })
      save()
    },

    async deleteVisit(id) {
      store.visits = store.visits.filter((v) => v.id !== id)
      store.dishes = store.dishes.filter((d) => d.visit_id !== id)
      save()
    },

    async myCircle() {
      const people = store.people.filter((p) => p.owner_id === me())
      return people.sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.name.localeCompare(b.name))
    },

    async circlesImIn() {
      return []
    },

    async addPerson(name) {
      const person: Person = { id: uuid(), owner_id: me(), name: name.trim(), is_me: false, linked_user_id: null, invite_code: null }
      store.people.push(person)
      save()
      return person
    },

    async deletePerson(id) {
      if (store.dishes.some((d) => d.person_id === id)) {
        throw new Error("That person has dishes logged, so they can't be removed.")
      }
      store.people = store.people.filter((p) => p.id !== id || p.is_me)
      store.visits.forEach((v) => (v.person_ids = v.person_ids.filter((pid) => pid !== id)))
      save()
    },

    async createInvite() {
      throw new Error('Invites need the real backend. The demo only keeps data on this device.')
    },

    async claimInvite() {
      throw new Error('Invites need the real backend. The demo only keeps data on this device.')
    },

    async myProfile() {
      return store.profile
    },

    async setDisplayName(name) {
      store.profile = { display_name: name.trim() }
      store.people.forEach((p) => {
        if (p.is_me && p.owner_id === store.userId) p.name = name.trim()
      })
      save()
    },
  }
}
