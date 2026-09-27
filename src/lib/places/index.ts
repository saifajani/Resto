import type { Place } from '../types'
import { createGooglePlaces } from './google'
import { nearbyPlaces as osmNearby, searchPlaces as osmSearch } from './osm'

export { distanceMeters, formatDistance } from './osm'

/**
 * Google Places when VITE_GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap
 * (free, no key), which keeps the demo working with no setup.
 */
const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const google = googleKey && !googleKey.startsWith('your-') ? createGooglePlaces(googleKey) : null

export const placesProvider: 'google' | 'osm' = google ? 'google' : 'osm'

/** Each provider picks its own radius: see the note by NEARBY_RADIUS in both. */
export function nearbyPlaces(lat: number, lon: number, signal?: AbortSignal): Promise<Place[]> {
  return google ? google.nearby(lat, lon, undefined, signal) : osmNearby(lat, lon, undefined, signal)
}

export function searchPlaces(text: string, near: { latitude: number; longitude: number } | null, signal?: AbortSignal): Promise<Place[]> {
  return google ? google.search(text, near, signal) : osmSearch(text, near, signal)
}

/** Makes sure a place has coordinates before it's saved. */
export function resolvePlace(place: Place): Promise<Place> {
  return google ? google.resolve(place) : Promise.resolve(place)
}
