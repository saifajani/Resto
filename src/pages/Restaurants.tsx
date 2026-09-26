import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../lib/config'
import { useLocation } from '../lib/location'
import { formatDistance, nearbyPlaces, placesProvider, resolvePlace, searchPlaces } from '../lib/places'
import type { Place, VisitedRestaurant } from '../lib/types'
import { ErrorNote, Spinner } from '../components/ui'
import { errorMessage, formatDate } from '../lib/format'

export default function Restaurants() {
  const navigate = useNavigate()
  const { coords, status, refresh } = useLocation()
  const [mine, setMine] = useState<VisitedRestaurant[]>([])
  const [nearby, setNearby] = useState<Place[] | null>(null)
  const [nearbyFailed, setNearbyFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmed = query.trim()
  const visitedPlaceIds = useMemo(() => new Set(mine.map((m) => m.restaurant.place_id)), [mine])

  useEffect(() => {
    backend.visitedRestaurants().then(setMine, (e) => setError(errorMessage(e)))
  }, [])

  useEffect(() => {
    if (!coords) return
    const controller = new AbortController()
    setNearbyFailed(false)
    nearbyPlaces(coords.latitude, coords.longitude, 800, controller.signal).then(setNearby, () => {
      if (!controller.signal.aborted) setNearbyFailed(true)
    })
    return () => controller.abort()
  }, [coords])

  useEffect(() => {
    if (!trimmed) {
      setResults(null)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(() => {
      searchPlaces(trimmed, coords, controller.signal)
        .then(setResults, () => !controller.signal.aborted && setResults([]))
        .finally(() => !controller.signal.aborted && setSearching(false))
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, coords])

  const open = async (place: Place) => {
    setOpening(place.id)
    try {
      const restaurant = await backend.restaurantForPlace(await resolvePlace(place))
      navigate(`/r/${restaurant.id}`, { state: { restaurant } })
    } catch (e) {
      setError(errorMessage(e))
      setOpening(null)
    }
  }

  const placeRow = (place: Place) => (
    <li key={place.id}>
      <button className="row" onClick={() => open(place)} disabled={opening !== null}>
        <div className="row-main">
          <div className="row-title">
            {place.name}
            {visitedPlaceIds.has(place.id) && <span className="been" title="You've been here">✓</span>}
          </div>
          <div className="row-sub">{[place.cuisine, place.address].filter(Boolean).join(' · ')}</div>
        </div>
        {opening === place.id ? <Spinner /> : place.distance != null && <span className="row-meta">{formatDistance(place.distance)}</span>}
      </button>
    </li>
  )

  const visitedRow = (v: VisitedRestaurant) => (
    <li key={v.restaurant.id}>
      <button className="row" onClick={() => navigate(`/r/${v.restaurant.id}`, { state: { restaurant: v.restaurant } })}>
        <div className="row-main">
          <div className="row-title">{v.restaurant.name}</div>
          <div className="row-sub">
            {v.visitCount} visit{v.visitCount === 1 ? '' : 's'} · last {formatDate(v.lastVisit)}
          </div>
        </div>
        <span className="chevron" aria-hidden="true">›</span>
      </button>
    </li>
  )

  const beenHere = (nearby ?? []).filter((p) => visitedPlaceIds.has(p.id))
  const others = (nearby ?? []).filter((p) => !visitedPlaceIds.has(p.id))
  const myMatches = mine.filter((m) => m.restaurant.name.toLowerCase().includes(trimmed.toLowerCase()))

  return (
    <>
      <header className="page-header">
        <h1>Restaurants</h1>
      </header>
      <div className="search-bar">
        <input
          type="search"
          placeholder="Search restaurants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search restaurants"
        />
      </div>
      <ErrorNote message={error} onDismiss={() => setError(null)} />

      {trimmed ? (
        <>
          {myMatches.length > 0 && (
            <section>
              <h2>Your restaurants</h2>
              <ul className="list">{myMatches.map(visitedRow)}</ul>
            </section>
          )}
          <section>
            <h2>Places</h2>
            {searching && !results ? (
              <div className="list-empty"><Spinner /></div>
            ) : results && results.length === 0 ? (
              <p className="list-empty">No places match “{trimmed}”.</p>
            ) : (
              <ul className="list">{(results ?? []).map(placeRow)}</ul>
            )}
          </section>
        </>
      ) : (
        <>
          {status === 'denied' && (
            <p className="notice">
              Location is off for this site, so we can't show what's nearby. Turn it on in your browser settings, or search by name above.
            </p>
          )}
          {beenHere.length > 0 && (
            <section>
              <h2>You've been here</h2>
              <ul className="list">{beenHere.map(placeRow)}</ul>
            </section>
          )}
          {status !== 'denied' && (
            <section>
              <h2>
                Nearby
                {coords && (
                  <button className="link small" onClick={refresh}>Refresh</button>
                )}
              </h2>
              {nearbyFailed ? (
                <p className="list-empty">Couldn't load nearby places. Try again in a moment, or search by name.</p>
              ) : nearby === null ? (
                status === 'unavailable' ? (
                  <p className="list-empty">Couldn't get your location. Search by name above instead.</p>
                ) : (
                  <div className="list-empty loading-line"><Spinner /> Finding restaurants near you</div>
                )
              ) : others.length === 0 ? (
                <p className="list-empty">No restaurants found within 800 m.</p>
              ) : (
                <ul className="list">{others.map(placeRow)}</ul>
              )}
            </section>
          )}
          {mine.length > 0 && (
            <section>
              <h2>Your restaurants</h2>
              <ul className="list">{mine.map(visitedRow)}</ul>
            </section>
          )}
        </>
      )}
      <p className="attribution">
        {placesProvider === 'google' ? (
          'Places data from Google Maps'
        ) : (
          <>Restaurant data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</>
        )}
      </p>
    </>
  )
}
