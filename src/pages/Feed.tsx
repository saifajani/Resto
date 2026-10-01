import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../lib/config'
import { displayName, visitPeople, type FeedVisit } from '../lib/types'
import { useUserId } from '../session'
import { DishPhoto, ErrorNote, PhotoViewer, ReorderBadge, Spinner, Stars } from '../components/ui'
import { errorMessage, formatDate } from '../lib/format'

/** How many visits to load at a time. */
const FEED_PAGE = 20

/** The newest visits logged by you and everyone whose circle you're in, newest first. */
export default function Feed() {
  const userId = useUserId()
  const [visits, setVisits] = useState<FeedVisit[] | null>(null)
  const [limit, setLimit] = useState(FEED_PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [viewing, setViewing] = useState<{ url: string; name: string } | null>(null)

  const load = useCallback(async (count: number) => {
    try {
      const v = await backend.feed(count)
      setVisits(v)
      const paths = v.flatMap((visit) => visit.dishes.flatMap((d) => (d.photo_path ? [d.photo_path] : [])))
      // Photos are extra: the feed works without them if the links can't be fetched.
      backend.photoUrls(paths).then(setPhotoUrls, () => {})
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    load(FEED_PAGE)
  }, [load])

  const showMore = async () => {
    const next = limit + FEED_PAGE
    setLoadingMore(true)
    await load(next)
    setLimit(next)
    setLoadingMore(false)
  }

  const photo = (path: string | null, name: string) => {
    const url = path ? photoUrls[path] : undefined
    return <DishPhoto url={url} name={name} onOpen={url ? () => setViewing({ url, name }) : undefined} />
  }

  return (
    <>
      <header className="page-header">
        <h1>Feed</h1>
        <p className="muted small">The latest visits from you and your circle.</p>
      </header>
      <ErrorNote message={error} onDismiss={() => setError(null)} />

      {visits === null ? (
        !error && <div className="list-empty"><Spinner /></div>
      ) : visits.length === 0 ? (
        <p className="empty-state">
          Nothing here yet. Visits that you and your circle log will show up here.
        </p>
      ) : (
        <>
          {visits.map((visit) => {
            const people = visitPeople(visit)
            const personById = new Map(people.map((p) => [p.id, p]))
            const mine = visit.owner_id === userId
            // Same courtesy as the restaurant screen: you see the date of a
            // visit you logged or were on, and only what was ordered on the rest.
            const wasThere = mine || people.some((p) => p.linked_user_id === userId)
            const dishes = [...visit.dishes].sort((a, b) => a.created_at.localeCompare(b.created_at))
            const who = people.map((p) => displayName(p, userId)).join(', ')
            return (
              <section key={visit.id} className="card visit feed-item">
                <div className="visit-header">
                  <div>
                    {visit.restaurant ? (
                      <Link className="feed-restaurant" to={`/r/${visit.restaurant.id}`} state={{ restaurant: visit.restaurant }}>
                        {visit.restaurant.name}
                      </Link>
                    ) : (
                      <span className="feed-restaurant">A restaurant</span>
                    )}
                    <div className="muted small">
                      {wasThere && <>{formatDate(visit.visited_at)} · </>}
                      {who || 'Nobody listed'}
                      {!mine && visit.owner && <> · logged by {visit.owner.display_name}</>}
                    </div>
                  </div>
                </div>
                {dishes.length > 0 && (
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
                )}
                {visit.notes && <p className="visit-notes">{visit.notes}</p>}
              </section>
            )
          })}
          {visits.length >= limit && (
            <div className="page-actions">
              <button className="secondary feed-more" onClick={showMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </>
      )}

      {viewing && <PhotoViewer url={viewing.url} name={viewing.name} onClose={() => setViewing(null)} />}
    </>
  )
}
