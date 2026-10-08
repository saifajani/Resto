import { groupVisitedRestaurants, type AuthListener, type Backend } from './backend'
import { demoPhotos } from './demoPhotoStore'
import { uuid } from './ids'
import { photoPath } from './photo'
import type { Dish, FeedVisit, NewVisit, PendingPhoto, Person, Profile, Restaurant, Visit, VisitChanges } from './types'

/**
 * A single-user backend that keeps everything in this browser's localStorage.
 * Used when no Supabase project is configured, so the app can be tried
 * without any setup. Sharing and invites need the real backend.
 */

/** created_at is missing on visits saved before the Feed existed. */
type StoredVisit = Omit<Visit, 'owner' | 'visit_people' | 'dishes'> & { person_ids: string[]; created_at?: string }
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

/**
 * Test hook: the UI tests set this to make the next N photo uploads fail, as
 * they would on a weak connection.
 */
declare global {
  var __restoFailPhotoUploads: number | undefined
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
  const store = load()
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
  /** Photo links handed out so far, so each photo gets one object URL. */
  const links = new Map<string, string>()
  /** A replaced or removed photo needs a fresh link next time. */
  const forgetLink = (path: string) => {
    const url = links.get(path)
    if (url) URL.revokeObjectURL(url)
    links.delete(path)
  }

  const uploadPhotos = async (visitId: string, pending: PendingPhoto[]): Promise<PendingPhoto[]> => {
    const failed: PendingPhoto[] = []
    for (const p of pending) {
      const dish = store.dishes.find((d) => d.id === p.dishId)
      if (!dish) continue
      try {
        if (globalThis.__restoFailPhotoUploads) {
          globalThis.__restoFailPhotoUploads -= 1
          throw new Error('Simulated upload failure')
        }
        const path = photoPath(me(), visitId, p.dishId)
        await demoPhotos.put(path, p.photo)
        forgetLink(path)
        dish.photo_path = path
      } catch {
        failed.push(p)
      }
    }
    save()
    return failed
  }

  /** As the Supabase queries order them: newest first, undated last, then by when they were logged. */
  const newestFirst = (a: StoredVisit, b: StoredVisit) =>
    (b.visited_at ?? '').localeCompare(a.visited_at ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? '')

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
        if (!restaurant) return []
        return [{ visited_at: v.visited_at, restaurant, visit_people: toVisit(v).visit_people }]
      })
      return groupVisitedRestaurants(rows, me())
    },

    async visits(restaurantId) {
      return store.visits.filter((v) => v.restaurant_id === restaurantId).sort(newestFirst).map(toVisit)
    },

    async visitsAt(restaurantIds) {
      const wanted = new Set(restaurantIds)
      return store.visits.filter((v) => wanted.has(v.restaurant_id)).sort(newestFirst).map(toVisit)
    },

    async feed(limit) {
      const loggedAt = (v: StoredVisit) => v.created_at ?? v.visited_at ?? ''
      return [...store.visits]
        .sort((a, b) => loggedAt(b).localeCompare(loggedAt(a)))
        .slice(0, limit)
        .map((v): FeedVisit => ({
          ...toVisit(v),
          created_at: loggedAt(v),
          restaurant: store.restaurants.find((r) => r.id === v.restaurant_id) ?? null,
        }))
    },

    async createVisit(visit: NewVisit) {
      const id = uuid()
      const pending: PendingPhoto[] = []
      const personIds = [...new Set([...visit.personIds, ...visit.dishes.map((d) => d.person_id)])]
      store.visits.push({
        id,
        owner_id: me(),
        restaurant_id: visit.restaurantId,
        visited_at: visit.visitedAt?.toISOString() ?? null,
        notes: visit.notes.trim() || null,
        person_ids: personIds,
        created_at: new Date().toISOString(),
      })
      const now = Date.now()
      visit.dishes.forEach((d, i) => {
        const dishId = uuid()
        if (d.photo) pending.push({ key: d.key, dishId, photo: d.photo })
        store.dishes.push({
          id: dishId,
          visit_id: id,
          person_id: d.person_id,
          name: d.name.trim(),
          rating: d.rating,
          would_order_again: d.would_order_again,
          notes: d.notes.trim() || null,
          photo_path: null,
          created_at: new Date(now + i).toISOString(),
        })
      })
      save()
      return { visitId: id, pendingPhotos: await uploadPhotos(id, pending) }
    },

    async updateVisit(id, visit: VisitChanges) {
      const stored = store.visits.find((v) => v.id === id && v.owner_id === me())
      if (!stored) throw new Error('You can only edit visits you logged')
      stored.visited_at = visit.visitedAt?.toISOString() ?? null
      stored.notes = visit.notes.trim() || null
      stored.person_ids = [...new Set([...visit.personIds, ...visit.dishes.map((d) => d.person_id)])]
      const before = store.dishes.filter((d) => d.visit_id === id)
      const pending: PendingPhoto[] = []
      const now = Date.now()
      const after = visit.dishes.map((d, i): StoredDish => {
        const old = before.find((b) => b.id === d.id)
        const dishId = old?.id ?? uuid()
        if (d.photo) pending.push({ key: d.key, dishId, photo: d.photo })
        return {
          id: dishId,
          visit_id: id,
          person_id: d.person_id,
          name: d.name.trim(),
          rating: d.rating,
          would_order_again: d.would_order_again,
          notes: d.notes.trim() || null,
          // As in Supabase: a replaced photo stays until the new one uploads.
          photo_path: d.photo_path ? (old?.photo_path ?? null) : null,
          created_at: old?.created_at ?? new Date(now + i).toISOString(),
        }
      })
      store.dishes = [...store.dishes.filter((d) => d.visit_id !== id), ...after]
      save()
      const kept = new Set(after.map((d) => d.photo_path))
      for (const old of before) {
        if (!old.photo_path || kept.has(old.photo_path)) continue
        forgetLink(old.photo_path)
        await demoPhotos.remove(old.photo_path).catch(() => undefined)
      }
      return { visitId: id, pendingPhotos: await uploadPhotos(id, pending) }
    },

    async retryPhotos(visitId, pending) {
      return uploadPhotos(visitId, pending)
    },

    async photoUrls(paths) {
      const urls: Record<string, string> = {}
      for (const path of paths) {
        let url = links.get(path)
        if (!url) {
          const blob = await demoPhotos.get(path).catch(() => undefined)
          if (!blob) continue
          url = URL.createObjectURL(blob)
          links.set(path, url)
        }
        urls[path] = url
      }
      return urls
    },

    async deleteVisit(id) {
      store.visits = store.visits.filter((v) => v.id !== id)
      store.dishes = store.dishes.filter((d) => d.visit_id !== id)
      save()
      if (store.userId) await demoPhotos.removeFolder(`${store.userId}/${id}`).catch(() => undefined)
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

    async linkBack() {
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
