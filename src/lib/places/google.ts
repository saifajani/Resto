import type { Place } from '../types'
import { distanceMeters } from './osm'

/**
 * Restaurant lookup using Google Places API (New), called straight from the
 * browser with a key restricted to this site (see README).
 *
 * Billing, per Google's per-SKU free caps (checked September 2026):
 *  - Nearby Search is a Pro SKU: 5,000 free calls a month. Cached below so
 *    reopening the app in the same spot doesn't call again.
 *  - Search uses Autocomplete with a session token. When a session ends in a
 *    Place Details call, the autocomplete keystrokes are free, and the Details
 *    call only asks for Essentials fields (10,000 free a month).
 */

const BASE = 'https://places.googleapis.com/v1'
const FOOD_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway']
const FOOD_TYPE_PATTERN = /restaurant|food|cafe|coffee|bar|pub|bakery|meal_|diner|bistro|brunch|dessert|ice_cream|pizza|sandwich|steak|sushi|tea_house|juice/
const CACHE_MINUTES = 15
/**
 * The widest circle Google allows. Nearby Search returns the 20 nearest inside
 * it, so a big radius costs nothing in a city and is what fills the list in a
 * small town. Every row shows its distance, so a far one is never misleading.
 */
const NEARBY_RADIUS = 50_000

type GooglePlace = {
  id: string
  displayName?: { text: string }
  shortFormattedAddress?: string
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  primaryTypeDisplayName?: { text: string }
}

type Suggestion = {
  placePrediction?: {
    placeId: string
    text?: { text: string }
    structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }
    types?: string[]
    distanceMeters?: number
  }
}

export function createGooglePlaces(apiKey: string) {
  const nearbyCache = new Map<string, { at: number; places: Place[] }>()
  let sessionToken: string | null = null

  const headers = (fieldMask?: string): HeadersInit => ({
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
  })

  async function call<T>(response: Promise<Response>): Promise<T> {
    const res = await response
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(body?.error?.message ?? `Google Places error ${res.status}`)
    }
    return (await res.json()) as T
  }

  const toPlaces = (p: GooglePlace, lat: number, lon: number): Place[] => {
    if (!p.location || !p.displayName) return []
    return [{
      id: `google:${p.id}`,
      name: p.displayName.text,
      address: p.shortFormattedAddress ?? null,
      cuisine: p.primaryTypeDisplayName?.text ?? null,
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      distance: distanceMeters(lat, lon, p.location.latitude, p.location.longitude),
    }]
  }

  return {
    /** `force` is a deliberate refresh by the user, which skips the cache. */
    async nearby(lat: number, lon: number, radius = NEARBY_RADIUS, signal?: AbortSignal, force = false): Promise<Place[]> {
      // About 110 m cells, so small moves reuse the last answer.
      const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)},${radius}`
      const cached = nearbyCache.get(cacheKey)
      if (!force && cached && Date.now() - cached.at < CACHE_MINUTES * 60_000) return cached.places

      const json = await call<{ places?: GooglePlace[] }>(
        fetch(`${BASE}/places:searchNearby`, {
          method: 'POST',
          signal,
          headers: headers('places.id,places.displayName,places.shortFormattedAddress,places.location,places.primaryTypeDisplayName'),
          body: JSON.stringify({
            includedTypes: FOOD_TYPES,
            maxResultCount: 20,
            rankPreference: 'DISTANCE',
            locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } },
          }),
        }),
      )
      const places = (json.places ?? []).flatMap((p) => toPlaces(p, lat, lon))
      nearbyCache.set(cacheKey, { at: Date.now(), places })
      return places
    },

    async search(text: string, near: { latitude: number; longitude: number } | null, signal?: AbortSignal): Promise<Place[]> {
      sessionToken ??= crypto.randomUUID()
      const json = await call<{ suggestions?: Suggestion[] }>(
        fetch(`${BASE}/places:autocomplete`, {
          method: 'POST',
          signal,
          headers: headers(),
          body: JSON.stringify({
            input: text,
            sessionToken,
            includeQueryPredictions: false,
            ...(near
              ? {
                  origin: near,
                  locationBias: { circle: { center: near, radius: 25_000 } },
                }
              : {}),
          }),
        }),
      )
      return (json.suggestions ?? []).flatMap((s): Place[] => {
        const p = s.placePrediction
        if (!p) return []
        // Autocomplete can't filter to "any kind of food place", so filter here.
        if (p.types && !p.types.some((t) => FOOD_TYPE_PATTERN.test(t))) return []
        return [{
          id: `google:${p.placeId}`,
          name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? 'Unknown',
          address: p.structuredFormat?.secondaryText?.text ?? null,
          cuisine: null,
          latitude: null,
          longitude: null,
          distance: p.distanceMeters ?? null,
        }]
      })
    },

    /** Fills in coordinates for a search suggestion, and closes the billing session. */
    async resolve(place: Place): Promise<Place> {
      if (place.latitude != null && place.longitude != null) return place
      const id = place.id.replace(/^google:/, '')
      const params = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''
      sessionToken = null
      const details = await call<GooglePlace>(
        fetch(`${BASE}/places/${encodeURIComponent(id)}${params}`, {
          headers: headers('id,location,shortFormattedAddress'),
        }),
      )
      return {
        ...place,
        address: details.shortFormattedAddress ?? place.address,
        latitude: details.location?.latitude ?? null,
        longitude: details.location?.longitude ?? null,
      }
    },
  }
}
