import type { SupabaseClient } from '@supabase/supabase-js'
import { groupVisitedRestaurants, type AuthListener, type Backend } from './backend'
import { uuid } from './ids'
import { PHOTO_BUCKET, photoPath } from './photo'
import type { NewVisit, PendingPhoto, Person, Place, Profile, Restaurant, Visit } from './types'

const PERSON_COLUMNS = 'id, owner_id, name, is_me, linked_user_id, invite_code'
/** How long a photo link works. The restaurant screen asks for fresh ones on every load. */
const PHOTO_LINK_SECONDS = 60 * 60

const VISIT_COLUMNS = `
  id, owner_id, restaurant_id, visited_at, notes,
  owner:profiles(display_name),
  visit_people(person:people(${PERSON_COLUMNS})),
  dishes(id, person_id, name, rating, would_order_again, notes, photo_path, created_at)
`

/** Turns Postgres errors into something a person can read. */
function check<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    if (result.error.code === '23503') throw new Error("That person has dishes logged, so they can't be removed.")
    throw new Error(result.error.message)
  }
  return result.data as T
}

/**
 * Row-level security in Postgres decides what each user can see, so these
 * queries don't filter by sharing themselves.
 * `getUserId` is injectable so tests can run against a plain PostgREST server.
 */
export function createSupabaseBackend(
  client: SupabaseClient,
  options: { getUserId?: () => string | null } = {},
): Backend {
  let currentUserId: string | null = null
  const userId = () => {
    const id = options.getUserId ? options.getUserId() : currentUserId
    if (!id) throw new Error('Not signed in')
    return id
  }
  const photos = () => client.storage.from(PHOTO_BUCKET)

  /** Uploads each photo, then points its dish at it. Returns the ones that failed. */
  const uploadPhotos = async (visitId: string, pending: PendingPhoto[]): Promise<PendingPhoto[]> => {
    const owner = userId()
    const failed = await Promise.all(
      pending.map(async (p) => {
        const path = photoPath(owner, visitId, p.dishId)
        try {
          const upload = await photos().upload(path, p.photo, { contentType: 'image/jpeg', upsert: true })
          if (upload.error) return p
          const update = await client.from('dishes').update({ photo_path: path }).eq('id', p.dishId)
          return update.error ? p : null
        } catch {
          return p
        }
      }),
    )
    return failed.filter((p): p is PendingPhoto => p !== null)
  }

  return {
    mode: 'supabase',

    onAuthChange(listener: AuthListener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        currentUserId = session?.user.id ?? null
        // Defer so the listener can call back into Supabase without deadlocking its auth lock.
        setTimeout(() => listener(currentUserId), 0)
      })
      return () => data.subscription.unsubscribe()
    },

    async sendCode(email) {
      check(await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }))
    },

    async verifyCode(email, code) {
      check(await client.auth.verifyOtp({ email, token: code.trim(), type: 'email' }))
    },

    async startDemo() {
      throw new Error('Demo mode is off because this app is connected to Supabase.')
    },

    async signOut() {
      await client.auth.signOut()
    },

    async restaurantForPlace(place: Place) {
      return check(
        await client
          .rpc('get_or_create_restaurant', {
            p_place_id: place.id,
            p_name: place.name,
            p_address: place.address,
            p_latitude: place.latitude,
            p_longitude: place.longitude,
          })
          .single<Restaurant>(),
      )
    },

    async getRestaurant(id) {
      const result = await client.from('restaurants').select('*').eq('id', id).maybeSingle<Restaurant>()
      if (result.error) throw new Error(result.error.message)
      return result.data
    },

    async visitedRestaurants() {
      const rows = check(
        await client
          .from('visits')
          .select('visited_at, restaurant:restaurants(*)')
          .order('visited_at', { ascending: false })
          .returns<{ visited_at: string; restaurant: Restaurant }[]>(),
      )
      return groupVisitedRestaurants(rows)
    },

    async visits(restaurantId) {
      return check(
        await client
          .from('visits')
          .select(VISIT_COLUMNS)
          .eq('restaurant_id', restaurantId)
          .order('visited_at', { ascending: false })
          .returns<Visit[]>(),
      )
    },

    async createVisit(visit: NewVisit) {
      // Ids are chosen here so each photo's folder is known before it uploads.
      const visitId = uuid()
      const dishes = visit.dishes.map((d) => ({ ...d, id: uuid() }))
      check(
        await client.rpc('create_visit', {
          p_id: visitId,
          p_restaurant_id: visit.restaurantId,
          p_visited_at: visit.visitedAt.toISOString(),
          p_person_ids: visit.personIds,
          p_dishes: dishes.map(({ id, person_id, name, rating, would_order_again, notes }) => ({
            id,
            person_id,
            name,
            rating,
            would_order_again,
            notes,
          })),
          p_notes: visit.notes,
        }),
      )
      const pending = dishes.flatMap((d) => (d.photo ? [{ key: d.key, dishId: d.id, photo: d.photo }] : []))
      return { visitId, pendingPhotos: await uploadPhotos(visitId, pending) }
    },

    async retryPhotos(visitId, pending) {
      return uploadPhotos(visitId, pending)
    },

    async photoUrls(paths) {
      if (paths.length === 0) return {}
      // Photos are extra, so a failure here leaves them out rather than breaking the page.
      const { data, error } = await photos().createSignedUrls(paths, PHOTO_LINK_SECONDS)
      if (error || !data) return {}
      return Object.fromEntries(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])))
    },

    async deleteVisit(id) {
      const deleted = check(await client.from('visits').delete().eq('id', id).select('id'))
      if (deleted.length === 0) return
      // Storage files don't cascade with the row. Best effort: a leftover file only costs space.
      const folder = `${userId()}/${id}`
      try {
        const { data } = await photos().list(folder)
        if (data?.length) await photos().remove(data.map((f) => `${folder}/${f.name}`))
      } catch {
        // The visit is already gone, which is what the person asked for.
      }
    },

    async myCircle() {
      return check(
        await client
          .from('people')
          .select(PERSON_COLUMNS)
          .eq('owner_id', userId())
          .order('is_me', { ascending: false })
          .order('name')
          .returns<Person[]>(),
      )
    },

    async circlesImIn() {
      const me = userId()
      return check(
        await client
          .from('people')
          .select(`${PERSON_COLUMNS}, owner:profiles!people_owner_id_fkey(display_name)`)
          .eq('linked_user_id', me)
          .neq('owner_id', me)
          .returns<Person[]>(),
      )
    },

    async addPerson(name) {
      return check(await client.from('people').insert({ name }).select(PERSON_COLUMNS).single<Person>())
    },

    async deletePerson(id) {
      check(await client.from('people').delete().eq('id', id))
    },

    async createInvite(personId) {
      return check(await client.rpc('create_invite', { p_person_id: personId })) as string
    },

    async claimInvite(code) {
      return check(await client.rpc('claim_invite', { p_code: code }).single<Person>())
    },

    async linkBack(ownerId, personId) {
      return check(await client.rpc('link_back', { p_owner_id: ownerId, p_person_id: personId }).single<Person>())
    },

    async myProfile() {
      return check(await client.from('profiles').select('display_name').eq('id', userId()).single<Profile>())
    },

    async setDisplayName(name) {
      check(await client.rpc('set_display_name', { p_name: name }))
    },
  }
}
