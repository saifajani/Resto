import type { FeedVisit, NewVisit, PendingPhoto, Person, Place, Profile, Restaurant, SavedVisit, Visit, VisitChanges, VisitedRestaurant } from './types'

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
  /** Visits at several restaurants at once, for the other branches of a chain. */
  visitsAt(restaurantIds: string[]): Promise<Visit[]>
  /** The newest visits you can see, yours and your circle's, most recently logged first. */
  feed(limit: number): Promise<FeedVisit[]>
  /** Saves the visit, then uploads its photos. Photos that fail come back in pendingPhotos. */
  createVisit(visit: NewVisit): Promise<SavedVisit>
  /**
   * Replaces a visit you logged with its edited version, then uploads new and
   * replaced photos and removes the files of photos that are gone. Like
   * createVisit, photos that fail come back in pendingPhotos.
   */
  updateVisit(id: string, visit: VisitChanges): Promise<SavedVisit>
  /** Uploads photos for a saved visit again. Returns the ones that still failed. */
  retryPhotos(visitId: string, photos: PendingPhoto[]): Promise<PendingPhoto[]>
  /** Short-lived links for showing photos, keyed by photo_path. Missing ones are left out. */
  photoUrls(paths: string[]): Promise<Record<string, string>>
  /** Also removes the visit's photos. */
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

/** A visit as the restaurant list needs it: when, where, and who was there. */
export type VisitedRow = {
  visited_at: string | null
  restaurant: Restaurant
  /** Every person on the visit. The one standing for you has linked_user_id = your id. */
  visit_people: { person: { linked_user_id: string | null } | null }[]
}

/**
 * Collapses a newest-first list of visits (undated ones last) into one entry per restaurant, and
 * works out whether you were there yourself or only someone else in your
 * circle was. Attendance, not who logged it: a visit you recorded for other
 * people is one you haven't been on. Dates of visits you weren't on are not
 * shown, so `myLastVisit` is the only date the list can print.
 */
export function groupVisitedRestaurants(rows: VisitedRow[], userId: string): VisitedRestaurant[] {
  const byId = new Map<string, VisitedRestaurant>()
  for (const row of rows) {
    const wasThere = row.visit_people.some((vp) => vp.person?.linked_user_id === userId)
    const existing = byId.get(row.restaurant.id)
    if (existing) {
      existing.visitCount += 1
      // Rows are newest first, so the first one you were on is your latest.
      if (wasThere) existing.myLastVisit ??= row.visited_at
      existing.beenThere ||= wasThere
      existing.lastVisit ??= row.visited_at
      existing.visitedByCircle ||= !wasThere
    } else {
      byId.set(row.restaurant.id, {
        restaurant: row.restaurant,
        lastVisit: row.visited_at,
        visitCount: 1,
        beenThere: wasThere,
        myLastVisit: wasThere ? row.visited_at : null,
        visitedByCircle: !wasThere,
      })
    }
  }
  return [...byId.values()]
}
