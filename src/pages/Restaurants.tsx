import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../lib/config'
import { useLocation, type Coords } from '../lib/location'
import { formatDistance, nearbyPlaces, placesProvider, resolvePlace, searchPlaces } from '../lib/places'
import type { Place, VisitedRestaurant } from '../lib/types'
import { ErrorNote, Spinner, VisitedMark, type Been } from '../components/ui'
import { errorMessage, formatDate } from '../lib/format'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { sameChain } from '../lib/chain'

/** How many nearby places to show before the "Show more" button. */
const NEARBY_PAGE = 8

/** Nearest first, with anything missing a distance last. */
const byDistance = (a: Place, b: Place) => (a.distance ?? Infinity) - (b.distance ?? Infinity)

export default function Restaurants() {
  const navigate = useNavigate()
  const { coords, status, refresh } = useLocation()
  const [mine, setMine] = useState<VisitedRestaurant[]>([])
  const [nearby, setNearby] = useState<Place[] | null>(null)
  const [nearbyFailed, setNearbyFailed] = useState(false)
  const [shown, setShown] = useState(NEARBY_PAGE)
  const searchBox = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmed = query.trim()
  /** place id -> whether you were there yourself, or only someone else in your circle. */
  const visitedPlaces = useMemo(() => {
    const map = new Map<string, Been>()
    for (const m of mine) {
      if (!m.restaurant.place_id) continue
      if (m.beenThere) map.set(m.restaurant.place_id, 'me')
      else if (m.visitedByCircle && !map.has(m.restaurant.place_id)) map.set(m.restaurant.place_id, 'circle')
    }
    return map
  }, [mine])

  const loadVisited = useCallback(
    () => backend.visitedRestaurants().then(setMine, (e: unknown) => setError(errorMessage(e))),
    [],
  )
  useEffect(() => {
    void loadVisited()
  }, [loadVisited])

  const nearbyRequest = useRef<AbortController | null>(null)
  const loadNearby = useCallback(async (at: Coords, force = false) => {
    nearbyRequest.current?.abort()
    const controller = new AbortController()
    nearbyRequest.current = controller
    setNearbyFailed(false)
    setShown(NEARBY_PAGE)
    try {
      const places = await nearbyPlaces(at.latitude, at.longitude, controller.signal, force)
      if (!controller.signal.aborted) setNearby(places)
    } catch {
      if (!controller.signal.aborted) setNearbyFailed(true)
    }
  }, [])

  useEffect(() => {
    if (!coords) return
    void loadNearby(coords)
    return () => nearbyRequest.current?.abort()
  }, [coords, loadNearby])

  /** What both the Refresh button and the pull-down gesture do. */
  const reload = useCallback(async () => {
    refresh()
    await Promise.all([loadVisited(), coords ? loadNearby(coords, true) : Promise.resolve()])
  }, [coords, loadNearby, loadVisited, refresh])

  const { pull, refreshing, ready } = usePullToRefresh(reload)

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

  /** The nearby list is as long as the provider will make it, so past its end
   * the only way on is to search by name. */
  const searchByName = () => {
    searchBox.current?.scrollIntoView({ block: 'center' })
    searchBox.current?.focus()
  }

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

  /**
   * The mark on a row: where you've been wins, then your circle, and failing
   * both, another branch of the same chain, whose menu is probably the same.
   */
  const markFor = (place: Place): Been | undefined =>
    visitedPlaces.get(place.id) ??
    (mine.some((m) => sameChain(m.restaurant.name, place.name)) ? 'chain' : undefined)

  const placeRow = (place: Place) => (
    <li key={place.id}>
      <button className="row" onClick={() => open(place)} disabled={opening !== null}>
        <div className="row-main">
          <div className="row-title">
            {place.name}
            {markFor(place) && <VisitedMark who={markFor(place)!} />}
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
            {v.visitCount} visit{v.visitCount === 1 ? '' : 's'}
            {!v.beenThere ? ' · from your circle' : v.myLastVisit ? ` · last ${formatDate(v.myLastVisit)}` : ''}
          </div>
        </div>
        <span className="chevron" aria-hidden="true">›</span>
      </button>
    </li>
  )

  // Places you or your circle have been to stay in distance order with a mark on
  // the row, rather than pinned above in a list of their own that repeated them.
  const others = [...(nearby ?? [])].sort(byDistance)
  const myMatches = mine.filter((m) => m.restaurant.name.toLowerCase().includes(trimmed.toLowerCase()))

  return (
    <>
      {(pull > 0 || refreshing) && (
        <div
          className={`pull-refresh${ready || refreshing ? ' ready' : ''}`}
          style={{ transform: `translateY(${pull}px)`, opacity: Math.min(pull / 24, 1) }}
          aria-hidden={!refreshing}
        >
          <div className="spinner" aria-label={refreshing ? 'Refreshing' : undefined} />
        </div>
      )}
      <header className="page-header">
        <h1>Restaurants</h1>
      </header>
      <div className="search-bar">
        <input
          ref={searchBox}
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
          {status !== 'denied' && (
            <section>
              <h2>
                Where are you?
                {coords && (
                  <button className="link small" onClick={reload}>Refresh</button>
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
                <p className="list-empty">No restaurants found near you. Try searching by name.</p>
              ) : (
                <ul className="list">
                  {others.slice(0, shown).map(placeRow)}
                  <li>
                    {others.length > shown ? (
                      <button className="row show-more" onClick={() => setShown((n) => n + NEARBY_PAGE)}>
                        Show more
                      </button>
                    ) : (
                      <button className="row show-more" onClick={searchByName}>
                        Search by name
                      </button>
                    )}
                  </li>
                </ul>
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
