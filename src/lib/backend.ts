import type { NewVisit, Person, Place, Profile, Restaurant, Visit, VisitedRestaurant } from './types'

export type AuthListener = (userId: string | null) => void

/** Everything the screens need from storage. Two implementations: Supabase and a local demo. */
export interface Backend {
  mode: 'supabase' | 'demo'

  onAuthChange(listener: AuthListener): () => void
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  startDemo(name: string): Promise<void>
  signOut(): Promise<void>

  restaurantForPlace(place: Place): Promise<Restaurant>
  getRestaurant(id: string): Promise<Restaurant | null>
  visitedRestaurants(): Promise<VisitedRestaurant[]>

  visits(restaurantId: string): Promise<Visit[]>
  createVisit(visit: NewVisit): Promise<void>
  deleteVisit(id: string): Promise<void>

  myCircle(): Promise<Person[]>
  circlesImIn(): Promise<Person[]>
  addPerson(name: string): Promise<Person>
  deletePerson(id: string): Promise<void>
  createInvite(personId: string): Promise<string>
  claimInvite(code: string): Promise<Person>
  /** After redeeming an invite, links its sender into your circle: an existing person, or a new one when personId is null. */
  linkBack(ownerId: string, personId: string | null): Promise<Person>

  myProfile(): Promise<Profile>
  setDisplayName(name: string): Promise<void>
}

/** Collapses a newest-first list of visits into one entry per restaurant. */
export function groupVisitedRestaurants(rows: { visited_at: string; restaurant: Restaurant }[]): VisitedRestaurant[] {
  const byId = new Map<string, VisitedRestaurant>()
  for (const row of rows) {
    const existing = byId.get(row.restaurant.id)
    if (existing) existing.visitCount += 1
    else byId.set(row.restaurant.id, { restaurant: row.restaurant, lastVisit: row.visited_at, visitCount: 1 })
  }
  return [...byId.values()]
}
