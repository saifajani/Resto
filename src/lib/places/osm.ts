import type { Place } from '../types'

/**
 * Restaurant lookup using OpenStreetMap, which is open data and free to query:
 *  - Overpass API for "what's near me"
 *  - Photon (by Komoot) for searching by name
 * Neither needs an API key. Both ask for light, reasonable use, which a
 * personal app easily stays within.
 */

// Tried in order. Public mirrors come and go (in September 2026 overpass-api.de
// answered every browser request with 406 and private.coffee stopped
// responding), so keep several, and give each only a few seconds.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const OVERPASS_TIMEOUT_MS = 8000
const PHOTON_URL = 'https://photon.komoot.io/api/'
const FOOD_AMENITIES = ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten']

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function formatCuisine(raw: string | undefined): string | null {
  if (!raw) return null
  return raw
    .split(';')
    .slice(0, 2)
    .map((c) => c.trim().replace(/_/g, ' '))
    .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
    .join(', ')
}

function joinAddress(houseNumber?: string, street?: string, city?: string): string | null {
  const line = [houseNumber, street].filter(Boolean).join(' ')
  const parts = [line, city].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export async function nearbyPlaces(lat: number, lon: number, radius = 800, signal?: AbortSignal): Promise<Place[]> {
  const query = `[out:json][timeout:20];nwr(around:${radius},${lat},${lon})["amenity"~"^(${FOOD_AMENITIES.join('|')})$"]["name"];out center tags 80;`
  let lastError: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    // A mirror that never answers would otherwise hang the list until the phone gives up.
    const attempt = new AbortController()
    const timer = setTimeout(() => attempt.abort(), OVERPASS_TIMEOUT_MS)
    const onAbort = () => attempt.abort()
    signal?.addEventListener('abort', onAbort)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: attempt.signal,
      })
      if (!response.ok) throw new Error(`Overpass ${response.status}`)
      const json = (await response.json()) as { elements: OverpassElement[] }
      return json.elements
        .map((el): Place | null => {
          const pLat = el.lat ?? el.center?.lat
          const pLon = el.lon ?? el.center?.lon
          const tags = el.tags ?? {}
          if (pLat == null || pLon == null || !tags.name) return null
          return {
            id: `osm:${el.type}/${el.id}`,
            name: tags.name,
            address: joinAddress(tags['addr:housenumber'], tags['addr:street'], tags['addr:city']),
            cuisine: formatCuisine(tags.cuisine),
            latitude: pLat,
            longitude: pLon,
            distance: distanceMeters(lat, lon, pLat, pLon),
          }
        })
        .filter((p): p is Place => p !== null)
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_type: 'N' | 'W' | 'R'
    osm_id: number
    name?: string
    housenumber?: string
    street?: string
    city?: string
    osm_value?: string
  }
}

const OSM_TYPES = { N: 'node', W: 'way', R: 'relation' } as const

export async function searchPlaces(
  text: string,
  near: { latitude: number; longitude: number } | null,
  signal?: AbortSignal,
): Promise<Place[]> {
  const params = new URLSearchParams({ q: text, limit: '20', lang: 'en' })
  if (near) {
    params.set('lat', String(near.latitude))
    params.set('lon', String(near.longitude))
  }
  FOOD_AMENITIES.forEach((a) => params.append('osm_tag', `amenity:${a}`))
  const response = await fetch(`${PHOTON_URL}?${params}`, { signal })
  if (!response.ok) throw new Error(`Search failed (${response.status})`)
  const json = (await response.json()) as { features: PhotonFeature[] }
  return json.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const [pLon, pLat] = f.geometry.coordinates
      const p = f.properties
      return {
        id: `osm:${OSM_TYPES[p.osm_type]}/${p.osm_id}`,
        name: p.name!,
        address: joinAddress(p.housenumber, p.street, p.city),
        cuisine: null,
        latitude: pLat,
        longitude: pLon,
        distance: near ? distanceMeters(near.latitude, near.longitude, pLat, pLon) : null,
      }
    })
}
