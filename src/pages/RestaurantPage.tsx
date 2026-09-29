import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { backend } from '../lib/config'
import { sameChain } from '../lib/chain'
import { summarize, type DishSummary, type SummaryGroup } from '../lib/summary'
import { displayName, visitPeople, type Restaurant, type Visit } from '../lib/types'
import { useUserId } from '../session'
import { DishPhoto, ErrorNote, PhotoViewer, ReorderBadge, Spinner, Stars } from '../components/ui'
import { errorMessage, formatDate } from '../lib/format'

export default function RestaurantPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const userId = useUserId()
  const passed = (useLocation().state as { restaurant?: Restaurant } | null)?.restaurant
  const [restaurant, setRestaurant] = useState<Restaurant | null>(passed?.id === id ? passed : null)
  const [visits, setVisits] = useState<Visit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null)
  /** The same chain, somewhere else: what was ordered at each other branch. */
  const [elsewhere, setElsewhere] = useState<{ restaurant: Restaurant; groups: SummaryGroup[] }[]>([])

  const load = useCallback(async () => {
    try {
      const [r, v] = await Promise.all([backend.getRestaurant(id), backend.visits(id)])
      if (!r) {
        navigate('/', { replace: true })
        return
      }
      setRestaurant(r)
      setVisits(v)
      const paths = v.flatMap((visit) => visit.dishes.flatMap((d) => (d.photo_path ? [d.photo_path] : [])))
      // Photos are extra: the page works without them if the links can't be fetched.
      backend.photoUrls(paths).then(setPhotoUrls, () => {})
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [id, navigate])

  useEffect(() => {
    load()
  }, [load])

  // Branches of the same chain share a menu, so a dish rated at one is worth
  // knowing about at another. Kept apart from this location's own history: it
  // is a different restaurant, however similar the menu.
  useEffect(() => {
    if (!restaurant) return
    let cancelled = false
    const run = async () => {
      const others = (await backend.visitedRestaurants())
        .map((v) => v.restaurant)
        .filter((r) => r.id !== restaurant.id && sameChain(r.name, restaurant.name))
      if (!others.length || cancelled) return
      const visitsThere = await backend.visitsAt(others.map((r) => r.id))
      if (cancelled) return
      setElsewhere(
        others
          .map((r) => ({ restaurant: r, groups: summarize(visitsThere.filter((v) => v.restaurant_id === r.id), userId) }))
          .filter((branch) => branch.groups.length > 0),
      )
      const paths = visitsThere.flatMap((v) => v.dishes.flatMap((d) => (d.photo_path ? [d.photo_path] : [])))
      backend.photoUrls(paths).then((urls) => setPhotoUrls((p) => ({ ...p, ...urls })), () => {})
    }
    // Extra context, so a failure here must not take the page down with it.
    run().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [restaurant, userId])

  const photo = (path: string | null, name: string) => {
    const url = path ? photoUrls[path] : undefined
    return <DishPhoto url={url} name={name} onOpen={url ? () => setViewing({ url, name }) : undefined} />
  }

  const groups = useMemo(() => summarize(visits ?? [], userId), [visits, userId])

  const summaryRow = (item: DishSummary) => (
    <li key={item.key}>
      {photo(item.photoPath, item.name)}
      <div className="dish-main">
        <div className="dish-name">
          {item.name}
          {item.timesOrdered > 1 && <span className="times">×{item.timesOrdered}</span>}
        </div>
        {item.notes && <div className="dish-notes">{item.notes}</div>}
      </div>
      <Stars rating={item.rating} />
      <ReorderBadge yes={item.wouldOrderAgain} />
    </li>
  )

  const deleteVisit = async (visit: Visit) => {
    if (!confirm(`Delete the visit on ${formatDate(visit.visited_at)}? This removes every dish logged on it.`)) return
    try {
      await backend.deleteVisit(visit.id)
      setVisits((vs) => (vs ?? []).filter((v) => v.id !== visit.id))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const mapsUrl =
    restaurant?.latitude != null && restaurant.longitude != null
      ? `https://maps.apple.com/?q=${encodeURIComponent(restaurant.name)}&ll=${restaurant.latitude},${restaurant.longitude}`
      : null

  return (
    <>
      <header className="page-header with-back">
        <button className="back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <div>
          <h1>{restaurant?.name ?? ' '}</h1>
          {restaurant?.address && (
            <p className="muted small">
              {restaurant.address}
              {mapsUrl && (
                <> · <a href={mapsUrl} target="_blank" rel="noreferrer">Map</a></>
              )}
            </p>
          )}
        </div>
      </header>

      <div className="page-actions">
        <Link className="primary button" to={`/r/${id}/log`} state={{ restaurant }}>+ Log a visit</Link>
      </div>
      <ErrorNote message={error} onDismiss={() => setError(null)} />

      {visits === null ? (
        <div className="list-empty"><Spinner /></div>
      ) : visits.length === 0 ? (
        <p className="empty-state">No visits yet. Log what everyone ate so you remember next time.</p>
      ) : (
        <>
          <h2 className="section-title">What to order</h2>
          {groups.map((group) => (
            <section key={group.key} className="card">
              <h3>{group.title}</h3>
              <ul className="dish-list">{group.items.map(summaryRow)}</ul>
            </section>
          ))}

          <h2 className="section-title">Past visits</h2>
          {visits.map((visit) => {
            const people = visitPeople(visit)
            const personById = new Map(people.map((p) => [p.id, p]))
            const mine = visit.owner_id === userId
            // You see the date of a visit you logged or were on. For the rest,
            // the circle shares what was ordered, not when they went.
            const wasThere = mine || people.some((p) => p.linked_user_id === userId)
            const dishes = [...visit.dishes].sort((a, b) => a.created_at.localeCompare(b.created_at))
            return (
              <section key={visit.id} className="card visit">
                <div className="visit-header">
                  <div>
                    <div className="visit-date">{wasThere ? formatDate(visit.visited_at) : 'Earlier visit'}</div>
                    <div className="muted small">
                      {people.map((p) => displayName(p, userId)).join(', ')}
                      {!mine && visit.owner && <> · logged by {visit.owner.display_name}</>}
                    </div>
                  </div>
                  {mine && (
                    <button className="link danger small" onClick={() => deleteVisit(visit)}>Delete</button>
                  )}
                </div>
                <ul className="dish-list">
                  {dishes.map((dish) => (
                    <li key={dish.id}>
                      {photo(dish.photo_path, dish.name)}
                      <div className="dish-main">
                        <div className="dish-name">{dish.name}</div>
                        <div className="dish-who">{displayName(personById.get(dish.person_id), userId)}</div>
                        {dish.notes && <div className="dish-notes">{dish.notes}</div>}
                      </div>
                      <Stars rating={dish.rating} />
                      <ReorderBadge yes={dish.would_order_again} />
                    </li>
                  ))}
                </ul>
                {visit.notes && <p className="visit-notes">{visit.notes}</p>}
              </section>
            )
          })}
        </>
      )}

      {elsewhere.length > 0 && (
        <>
          <h2 className="section-title">Other locations</h2>
          <p className="fine-print padded">Same chain, so the menu is probably the same. These visits were somewhere else.</p>
          {elsewhere.map((branch) => (
            <section key={branch.restaurant.id} className="card">
              <h3>{branch.restaurant.name}</h3>
              {branch.restaurant.address && <p className="muted small">{branch.restaurant.address}</p>}
              {branch.groups.map((group) => (
                <div key={group.key}>
                  <p className="dish-who">{group.title}</p>
                  <ul className="dish-list">{group.items.map(summaryRow)}</ul>
                </div>
              ))}
            </section>
          ))}
        </>
      )}

      {viewing && <PhotoViewer url={viewing.url} name={viewing.name} onClose={() => setViewing(null)} />}
    </>
  )
}
