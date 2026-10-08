export type Profile = { display_name: string }

export type Restaurant = {
  id: string
  place_id: string | null
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
}

/** Someone in a user's circle. `is_me` marks the user themselves. */
export type Person = {
  id: string
  owner_id: string
  name: string
  is_me: boolean
  linked_user_id: string | null
  invite_code: string | null
  owner?: Profile | null
}

export type Dish = {
  id: string
  person_id: string
  name: string
  rating: number
  would_order_again: boolean
  notes: string | null
  /** In the dish-photos bucket: <owner id>/<visit id>/<dish id>.jpg */
  photo_path: string | null
  created_at: string
}

export type Visit = {
  id: string
  owner_id: string
  restaurant_id: string
  /** Null when nobody remembers the date. */
  visited_at: string | null
  notes: string | null
  owner: Profile | null
  visit_people: { person: Person | null }[]
  dishes: Dish[]
}

/** A visit in the Feed: where it was, and when it was logged, which is what the Feed is ordered by. */
export type FeedVisit = Visit & {
  created_at: string
  restaurant: Restaurant | null
}

export type VisitedRestaurant = {
  restaurant: Restaurant
  /** Null when no visit here has a date. */
  lastVisit: string | null
  visitCount: number
  /** You were on at least one visit here yourself. */
  beenThere: boolean
  /** The newest dated visit you were on yourself, or null if there's none. */
  myLastVisit: string | null
  /** Someone in your circle was here on a visit you weren't on. */
  visitedByCircle: boolean
}

/** A dish being entered on the log visit screen, before it's saved. */
export type DraftDish = {
  key: string
  /** Set when editing a dish that's already saved. */
  id?: string
  person_id: string
  name: string
  rating: number
  would_order_again: boolean
  notes: string
  /** Already shrunk to a small JPEG. Held in memory until the visit is saved. */
  photo: Blob | null
  /** The saved dish's photo, kept unless removed. A new `photo` replaces it. */
  photo_path?: string | null
}

/** A dish photo that hasn't uploaded yet, kept so the upload can be retried. */
export type PendingPhoto = {
  /** The draft dish's key */
  key: string
  dishId: string
  photo: Blob
}

/** The visit is always saved; photos that didn't upload come back to retry. */
export type SavedVisit = {
  visitId: string
  pendingPhotos: PendingPhoto[]
}

/** A restaurant from the map provider, before it has a record in our database. */
export type Place = {
  /** Prefixed by source: "google:ChIJ...", or "osm:node/123" for OpenStreetMap */
  id: string
  name: string
  address: string | null
  cuisine: string | null
  /** Null for search suggestions until resolvePlace() looks up the details. */
  latitude: number | null
  longitude: number | null
  distance: number | null
}

export type NewVisit = {
  restaurantId: string
  /** Null for "don't remember". */
  visitedAt: Date | null
  notes: string
  personIds: string[]
  dishes: DraftDish[]
}

/** Everything about a saved visit that can be edited. Its restaurant stays put. */
export type VisitChanges = Omit<NewVisit, 'restaurantId'>

export function visitPeople(visit: Visit): Person[] {
  return visit.visit_people.flatMap((vp) => (vp.person ? [vp.person] : []))
}

/** "You" when this person is the signed-in user, otherwise their name. */
export function displayName(person: Person | undefined, userId: string | null): string {
  if (!person) return 'Someone'
  if (person.linked_user_id && person.linked_user_id === userId) return 'You'
  return person.name
}
