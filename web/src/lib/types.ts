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
  created_at: string
}

export type Visit = {
  id: string
  owner_id: string
  restaurant_id: string
  visited_at: string
  notes: string | null
  owner: Profile | null
  visit_people: { person: Person | null }[]
  dishes: Dish[]
}

export type VisitedRestaurant = {
  restaurant: Restaurant
  lastVisit: string
  visitCount: number
}

/** A dish being entered on the log visit screen, before it's saved. */
export type DraftDish = {
  key: string
  person_id: string
  name: string
  rating: number
  would_order_again: boolean
  notes: string
}

/** A restaurant from OpenStreetMap, before it has a record in our database. */
export type Place = {
  /** "osm:node/123", "osm:way/456" or "osm:relation/789" */
  id: string
  name: string
  address: string | null
  cuisine: string | null
  latitude: number
  longitude: number
  distance: number | null
}

export type NewVisit = {
  restaurantId: string
  visitedAt: Date
  notes: string
  personIds: string[]
  dishes: DraftDish[]
}

export function visitPeople(visit: Visit): Person[] {
  return visit.visit_people.flatMap((vp) => (vp.person ? [vp.person] : []))
}

/** "You" when this person is the signed-in user, otherwise their name. */
export function displayName(person: Person | undefined, userId: string | null): string {
  if (!person) return 'Someone'
  if (person.linked_user_id && person.linked_user_id === userId) return 'You'
  return person.name
}
