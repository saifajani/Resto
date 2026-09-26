import { useCallback, useEffect, useState } from 'react'

export type Coords = { latitude: number; longitude: number }
export type LocationStatus = 'locating' | 'ok' | 'denied' | 'unavailable'

let cached: Coords | null = null

/** Current position, requested on mount. `refresh` asks again. */
export function useLocation() {
  const [coords, setCoords] = useState<Coords | null>(cached)
  const [status, setStatus] = useState<LocationStatus>(cached ? 'ok' : 'locating')

  const refresh = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }
    setStatus((s) => (s === 'ok' ? s : 'locating'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        // Ignore tiny moves so the nearby list doesn't reload for GPS jitter.
        if (!cached || Math.abs(cached.latitude - next.latitude) > 0.0005 || Math.abs(cached.longitude - next.longitude) > 0.0005) {
          cached = next
          setCoords(next)
        }
        setStatus('ok')
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : cached ? 'ok' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    )
  }, [])

  useEffect(refresh, [refresh])

  return { coords, status, refresh }
}
