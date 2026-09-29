/**
 * Runs the real Supabase backend code against Postgres + PostgREST (the same
 * pieces Supabase uses), with the schema from supabase/migrations applied.
 * Three users: an owner, a companion who redeems an invite, and a stranger.
 * Photo uploads go through a small fake of the Storage API that writes to
 * storage.objects as the signed-in user, so the bucket's row-level security
 * is what decides.
 *
 * Needs: TEST_POSTGREST_URL (PostgREST base URL) and TEST_JWT_SECRET, plus the
 * three user IDs below present in auth.users. See tests/README.md.
 */
import { createHmac } from 'node:crypto'
import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseBackend } from '../src/lib/supabaseBackend'
import type { Place } from '../src/lib/types'

const OWNER = '11111111-1111-1111-1111-111111111111'
const WIFE = '22222222-2222-2222-2222-222222222222'
const STRANGER = '33333333-3333-3333-3333-333333333333'
/** Never joins a circle, so nothing should ever be visible to them. */
const OUTSIDER = '44444444-4444-4444-4444-444444444444'

const postgrestUrl = process.env.TEST_POSTGREST_URL ?? 'http://127.0.0.1:3900'
const secret = process.env.TEST_JWT_SECRET ?? 'test-secret-test-secret-test-secret-1234'

function jwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

/** The next N photo uploads fail, as they would on a weak connection. */
let failUploads = 0

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/**
 * Just enough of Supabase Storage for the app: upload, list, remove and signed
 * links. Each call reads or writes storage.objects through PostgREST with the
 * caller's token, so the policies from the migrations apply as they would in Supabase.
 */
async function fakeStorage(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await readBody(req)
  const json = () => JSON.parse(body.toString() || '{}')
  const objects = (query: string, init: RequestInit = {}) =>
    fetch(`${postgrestUrl}/objects?${query}`, {
      ...init,
      headers: {
        authorization: req.headers.authorization ?? '',
        'accept-profile': 'storage',
        'content-profile': 'storage',
        'content-type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    })
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  const denied = (message: string) => send(400, { statusCode: '403', error: 'Unauthorized', message })
  const path = decodeURIComponent(req.url!.replace(/^\/storage\/v1/, '').split('?')[0])
  let m: RegExpMatchArray | null

  if ((m = path.match(/^\/object\/list\/([^/]+)$/))) {
    const prefix = String(json().prefix ?? '')
    const rows = (await (await objects(`select=id,name&bucket_id=eq.${m[1]}&name=like.${encodeURIComponent(`${prefix}/*`)}`)).json()) as { id: string; name: string }[]
    return send(200, rows.map((r) => ({ id: r.id, name: r.name.slice(prefix.length + 1) })))
  }
  if ((m = path.match(/^\/object\/sign\/([^/]+)$/))) {
    const bucket = m[1]
    const signed = await Promise.all(
      (json().paths as string[]).map(async (p) => {
        const rows = (await (await objects(`select=name&bucket_id=eq.${bucket}&name=eq.${encodeURIComponent(p)}`)).json()) as unknown[]
        return rows.length
          ? { path: p, signedURL: `/object/sign/${bucket}/${p}?token=test`, error: null }
          : { path: p, signedURL: null, error: 'Either the object does not exist or you do not have access to it' }
      }),
    )
    return send(200, signed)
  }
  if (req.method === 'DELETE' && (m = path.match(/^\/object\/([^/]+)$/))) {
    const names = (json().prefixes as string[]).map((n) => `"${n}"`).join(',')
    const removed = await objects(`bucket_id=eq.${m[1]}&name=in.(${encodeURIComponent(names)})`, { method: 'DELETE', headers: { prefer: 'return=representation' } })
    return send(200, await removed.json())
  }
  if (req.method === 'POST' && (m = path.match(/^\/object\/([^/]+)\/(.+)$/))) {
    if (failUploads > 0) {
      failUploads--
      return send(503, { statusCode: '503', error: 'Unavailable', message: 'Simulated dropped connection' })
    }
    const upsert = req.headers['x-upsert'] === 'true'
    const inserted = await objects(upsert ? 'on_conflict=bucket_id,name' : '', {
      method: 'POST',
      headers: { prefer: upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal' },
      body: JSON.stringify({ bucket_id: m[1], name: m[2] }),
    })
    if (!inserted.ok) return denied(`new row violates row-level security policy (${inserted.status})`)
    return send(200, { Id: m[2], Key: `${m[1]}/${m[2]}` })
  }
  send(404, { statusCode: '404', error: 'Not found', message: `Fake storage has no ${req.method} ${path}` })
}

/** supabase-js calls /rest/v1/... and /storage/v1/...; plain PostgREST serves from /. */
function startProxy(): Promise<{ url: string; close: () => void }> {
  const target = new URL(postgrestUrl)
  const server = http.createServer((req, res) => {
    if (req.url!.startsWith('/storage/v1/')) {
      fakeStorage(req, res).catch((e) => {
        res.writeHead(500)
        res.end(String(e))
      })
      return
    }
    const upstream = http.request(
      { host: target.hostname, port: target.port, method: req.method, path: req.url!.replace(/^\/rest\/v1/, ''), headers: { ...req.headers, host: target.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    req.pipe(upstream)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number }
    resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })
  }))
}

function clientFor(url: string, userId: string) {
  const token = jwt(userId)
  return createClient(url, 'anon-key-unused', { accessToken: async () => token })
}

function backendFor(url: string, userId: string) {
  return createSupabaseBackend(clientFor(url, userId), { getUserId: () => userId })
}

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  -> ${JSON.stringify(detail)}`}`)
  if (!ok) failures++
}
async function rejects(name: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn()
    check(name, false, 'did not throw')
  } catch (e) {
    check(name, match.test((e as Error).message), (e as Error).message)
  }
}

const pai: Place = { id: 'osm:node/1001', name: 'Pai Northern Thai', address: '18 Duncan St, Toronto', cuisine: 'Thai', latitude: 43.6479, longitude: -79.3888, distance: 120 }

async function main() {
  const proxy = await startProxy()
  const owner = backendFor(proxy.url, OWNER)
  const wife = backendFor(proxy.url, WIFE)
  const stranger = backendFor(proxy.url, STRANGER)
  const outsider = backendFor(proxy.url, OUTSIDER)

  try {
    // Owner setup
    check('new user gets a profile', (await owner.myProfile()).display_name === 'Me')
    await owner.setDisplayName('Saif')
    const circle0 = await owner.myCircle()
    check('circle starts with me, renamed', circle0.length === 1 && circle0[0].is_me && circle0[0].name === 'Saif', circle0)
    const me = circle0[0]
    const sarah = await owner.addPerson('Sarah')
    const zayn = await owner.addPerson('Zayn')
    check('myCircle lists me first then by name', (await owner.myCircle()).map((p) => p.name).join() === 'Saif,Sarah,Zayn')

    // Restaurants
    const r1 = await owner.restaurantForPlace(pai)
    const r2 = await owner.restaurantForPlace(pai)
    check('same place returns same restaurant', r1.id === r2.id && r1.place_id === 'osm:node/1001')
    const fromApple = await owner.restaurantForPlace({ ...pai, id: 'apple:I9XYZ', latitude: 43.648, longitude: -79.3887 })
    check('same name nearby from another provider reuses the restaurant', fromApple.id === r1.id)
    const other = await owner.restaurantForPlace({ ...pai, id: 'osm:node/2002', name: 'Pai Northern Thai', latitude: 43.7, longitude: -79.4 })
    check('same name far away is a different restaurant', other.id !== r1.id)
    check('getRestaurant works', (await owner.getRestaurant(r1.id))?.name === 'Pai Northern Thai')

    // Visits
    await owner.createVisit({
      restaurantId: r1.id,
      visitedAt: new Date('2026-08-01T23:00:00Z'),
      notes: 'Busy Friday',
      personIds: [me.id, sarah.id],
      dishes: [
        { key: 'a', person_id: me.id, name: 'Khao Soi', rating: 5, would_order_again: true, notes: 'extra lime', photo: null },
        { key: 'b', person_id: sarah.id, name: 'Pad Thai', rating: 3, would_order_again: false, notes: '', photo: null },
      ],
    })
    await owner.createVisit({
      restaurantId: r1.id,
      visitedAt: new Date('2026-09-20T23:00:00Z'),
      notes: '',
      personIds: [me.id],
      dishes: [
        { key: 'c', person_id: me.id, name: 'khao soi ', rating: 4, would_order_again: true, notes: '', photo: null },
        { key: 'd', person_id: zayn.id, name: 'Fries', rating: 5, would_order_again: true, notes: '', photo: null },
      ],
    })
    const visits = await owner.visits(r1.id)
    check('owner sees both visits newest first', visits.length === 2 && visits[0].visited_at > visits[1].visited_at, visits.map((v) => v.visited_at))
    const latest = visits[0]
    check('person on a dish is added to the visit automatically', latest.visit_people.some((vp) => vp.person?.id === zayn.id), latest.visit_people)
    check('embedded dishes and owner come back', latest.dishes.length === 2 && latest.owner?.display_name === 'Saif', latest)
    check('empty notes are stored as null', latest.notes === null && visits[1].dishes.find((d) => d.name === 'Pad Thai')?.notes === null)
    const visited = await owner.visitedRestaurants()
    check('visitedRestaurants groups by restaurant', visited.length === 1 && visited[0].visitCount === 2, visited)

    await rejects('rating out of range is rejected', () =>
      owner.createVisit({ restaurantId: r1.id, visitedAt: new Date(), notes: '', personIds: [me.id], dishes: [{ key: 'x', person_id: me.id, name: 'X', rating: 9, would_order_again: false, notes: '', photo: null }] }),
      /rating/)
    check('failed visit left nothing behind', (await owner.visits(r1.id)).length === 2)
    await rejects('cannot delete a person with dishes', () => owner.deletePerson(sarah.id), /has dishes logged/)

    // Several restaurants at once, which is how a chain's other branches load
    const across = await owner.visitsAt([r1.id, other.id])
    check('visitsAt returns visits for every restaurant asked for', across.length === 2 && across.every((v) => v.restaurant_id === r1.id), across.map((v) => v.restaurant_id))
    check('visitsAt with no ids asks nothing', (await owner.visitsAt([])).length === 0)

    // Invites
    const code = await owner.createInvite(sarah.id)
    check('invite code looks right', /^[A-Z2-9]{6}$/.test(code), code)
    check('invite code is stable', (await owner.createInvite(sarah.id)) === code)
    await rejects('cannot invite yourself', () => owner.createInvite(me.id), /only invite/)

    // Companion before and after joining
    check('wife sees nothing before joining', (await wife.visits(r1.id)).length === 0)
    await rejects('wife cannot claim a bad code', () => wife.claimInvite('ZZZZZZ'), /not valid/)
    const linked = await wife.claimInvite(code.toLowerCase())
    check('wife claims invite as Sarah', linked.name === 'Sarah' && linked.linked_user_id === WIFE)
    const wifeVisits = await wife.visits(r1.id)
    check('wife sees every visit the owner logged, not just hers', wifeVisits.length === 2, wifeVisits.map((v) => v.notes))
    check('wife sees the dishes on a visit she was not on', wifeVisits[0].dishes.length === 2 && wifeVisits[0].notes === null, wifeVisits[0])
    check('wife sees who logged it', wifeVisits[0].owner?.display_name === 'Saif')
    check('wife sees names of everyone on the visit, including Zayn', wifeVisits[0].visit_people.every((vp) => vp.person !== null), wifeVisits[0].visit_people)
    const wifeVisited = await wife.visitedRestaurants()
    check('restaurant shows in wife\'s list', wifeVisited.length === 1)
    check(
      'wife counts both visits but is only dated by her own',
      wifeVisited[0].visitCount === 2 &&
        new Date(wifeVisited[0].myLastVisit!).toISOString() === '2026-08-01T23:00:00.000Z' &&
        wifeVisited[0].visitedByCircle,
      wifeVisited[0],
    )
    const circles = await wife.circlesImIn()
    check('circlesImIn shows owner name', circles.length === 1 && circles[0].owner?.display_name === 'Saif', circles)
    await wife.deleteVisit(wifeVisits[0].id)
    check('wife cannot delete owner\'s visit', (await owner.visits(r1.id)).length === 2)
    await rejects('invite code is single use', () => stranger.claimInvite(code), /not valid/)

    // Sharing back: the companion links the owner into her own circle
    await rejects('stranger cannot share back without an invite', () => stranger.linkBack(OWNER, null), /whose invite/)
    const wifeMe = (await wife.myCircle()).find((p) => p.is_me)!
    await rejects('cannot share back as your own "me"', () => wife.linkBack(OWNER, wifeMe.id), /not joined yet/)
    const hubby = await wife.addPerson('Hubby')
    await wife.createVisit({ restaurantId: other.id, visitedAt: new Date('2026-09-01T23:00:00Z'), notes: 'Date night', personIds: [wifeMe.id, hubby.id], dishes: [] })
    check('owner cannot see wife\'s visit before she shares back', (await owner.visits(other.id)).length === 0)
    const back = await wife.linkBack(OWNER, hubby.id)
    check('wife links the owner as Hubby', back.id === hubby.id && back.linked_user_id === OWNER, back)
    const ownerSees = await owner.visits(other.id)
    check('owner now sees wife\'s past visit with him', ownerSees.length === 1 && ownerSees[0].notes === 'Date night', ownerSees)
    await owner.deleteVisit(ownerSees[0].id)
    check('owner cannot delete wife\'s visit', (await wife.visits(other.id)).length === 1)
    check('sharing back again is a no-op', (await wife.linkBack(OWNER, null)).id === hubby.id)
    check('owner\'s circle shows wife\'s circle', (await owner.circlesImIn()).some((p) => p.id === hubby.id))

    // Future visits flow through
    await owner.createVisit({ restaurantId: r1.id, visitedAt: new Date(), notes: 'Birthday', personIds: [sarah.id], dishes: [{ key: 'e', person_id: sarah.id, name: 'Green Curry', rating: 5, would_order_again: true, notes: '', photo: null }] })
    check('a new visit shows up for the wife straight away', (await wife.visits(r1.id)).length === 3)

    // Nobody outside a circle sees anything
    check('stranger sees no visits before joining', (await stranger.visits(r1.id)).length === 0 && (await stranger.visitedRestaurants()).length === 0)
    check('stranger sees only their own person', (await stranger.myCircle()).length === 1)
    check('outsider sees nothing at all', (await outsider.visits(r1.id)).length === 0 && (await outsider.visitedRestaurants()).length === 0)

    // Sharing back as a new person
    const zaynCode = await owner.createInvite(zayn.id)
    await stranger.claimInvite(zaynCode)
    const added = await stranger.linkBack(OWNER, null)
    check('sharing back adds the owner under their name', added.name === 'Saif' && added.linked_user_id === OWNER && !added.is_me, added)

    // Circle sharing follows one invite at a time, and is not transitive. The
    // wife and the stranger are both in the owner's circle, and still see
    // nothing of each other.
    const strangerMe = (await stranger.myCircle()).find((p) => p.is_me)!
    const solo = await stranger.restaurantForPlace({ ...pai, id: 'osm:node/9009', name: 'Solo Diner', latitude: 43.66, longitude: -79.41 })
    await stranger.createVisit({ restaurantId: solo.id, visitedAt: new Date('2026-07-01T23:00:00Z'), notes: 'Solo lunch', personIds: [strangerMe.id], dishes: [] })
    check('one circle member cannot see another member\'s own visits', (await wife.visits(solo.id)).length === 0)
    check('the owner sees them, because the stranger shared back', (await owner.visits(solo.id)).length === 1)

    // Photos: attached to the visit, visible to whoever can see the visit
    const terroni = await owner.restaurantForPlace({ ...pai, id: 'osm:node/3003', name: 'Terroni', latitude: 43.6455, longitude: -79.395 })
    const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' })
    failUploads = 1
    const saved = await owner.createVisit({
      restaurantId: terroni.id,
      visitedAt: new Date(),
      notes: '',
      personIds: [me.id, sarah.id],
      dishes: [
        { key: 'p1', person_id: me.id, name: 'Margherita', rating: 5, would_order_again: true, notes: '', photo: jpeg('pizza') },
        { key: 'p2', person_id: sarah.id, name: 'Tiramisu', rating: 4, would_order_again: true, notes: '', photo: jpeg('cake') },
        { key: 'p3', person_id: sarah.id, name: 'Sparkling Water', rating: 3, would_order_again: false, notes: '', photo: null },
      ],
    })
    check('visit is saved even when a photo upload fails', saved.pendingPhotos.length === 1 && (await owner.visits(terroni.id)).length === 1, saved.pendingPhotos)
    const withPhotos = async () => (await owner.visits(terroni.id))[0].dishes.filter((d) => d.photo_path)
    check('only the photo that uploaded is attached', (await withPhotos()).length === 1)
    check('retrying uploads the rest', (await owner.retryPhotos(saved.visitId, saved.pendingPhotos)).length === 0)
    const photoDishes = await withPhotos()
    check('photos live in the visit folder', photoDishes.length === 2 && photoDishes.every((d) => d.photo_path === `${OWNER}/${saved.visitId}/${d.id}.jpg`), photoDishes)
    const paths = photoDishes.map((d) => d.photo_path!)
    check('owner gets photo links', Object.keys(await owner.photoUrls(paths)).length === 2)
    const wifeTerroni = await wife.visits(terroni.id)
    check('companion on the visit sees its photos', wifeTerroni[0]?.dishes.filter((d) => d.photo_path).length === 2 && Object.keys(await wife.photoUrls(paths)).length === 2)
    check('a circle member who was not on the visit still sees its photos', Object.keys(await stranger.photoUrls(paths)).length === 2)
    check('someone outside the circle gets no photo links', Object.keys(await outsider.photoUrls(paths)).length === 0)

    const ownerClient = clientFor(proxy.url, OWNER)
    const wifeClient = clientFor(proxy.url, WIFE)
    const water = (await owner.visits(terroni.id))[0].dishes.find((d) => d.name === 'Sparkling Water')!
    const moved = await ownerClient.from('dishes').update({ photo_path: `${OWNER}/${visits[1].id}/${water.id}.jpg` }).eq('id', water.id)
    check("a dish can't point at a photo in another visit's folder", /photo_path_in_visit_folder/.test(moved.error?.message ?? ''), moved.error)
    const intoOwners = await wifeClient.storage.from('dish-photos').upload(`${OWNER}/${saved.visitId}/${water.id}.jpg`, jpeg('x'))
    const intoOwn = await wifeClient.storage.from('dish-photos').upload(`${WIFE}/${saved.visitId}/${water.id}.jpg`, jpeg('x'))
    check("companion can't add photos to someone else's visit", intoOwners.error !== null && intoOwn.error !== null)
    const wifeRemove = await wifeClient.storage.from('dish-photos').remove(paths)
    check("companion can't remove the owner's photos", (wifeRemove.data ?? []).length === 0 && Object.keys(await owner.photoUrls(paths)).length === 2)

    await owner.deleteVisit(saved.visitId)
    const left = await ownerClient.schema('storage').from('objects').select('name').like('name', `${OWNER}/${saved.visitId}/%`)
    check('deleting a visit removes its photos', left.error === null && left.data.length === 0, left)

    // Delete
    await owner.deleteVisit(visits[0].id)
    check('owner can delete a visit', (await owner.visits(r1.id)).length === 2)
  } finally {
    proxy.close()
  }

  console.log(failures ? `\n${failures} FAILED` : '\nAll database checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
