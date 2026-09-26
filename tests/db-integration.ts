/**
 * Runs the real Supabase backend code against Postgres + PostgREST (the same
 * pieces Supabase uses), with the schema from supabase/migrations applied.
 * Three users: an owner, a companion who redeems an invite, and a stranger.
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

const postgrestUrl = process.env.TEST_POSTGREST_URL ?? 'http://127.0.0.1:3900'
const secret = process.env.TEST_JWT_SECRET ?? 'test-secret-test-secret-test-secret-1234'

function jwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

/** supabase-js calls /rest/v1/...; plain PostgREST serves from /. */
function startProxy(): Promise<{ url: string; close: () => void }> {
  const target = new URL(postgrestUrl)
  const server = http.createServer((req, res) => {
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

function backendFor(url: string, userId: string) {
  const token = jwt(userId)
  const client = createClient(url, 'anon-key-unused', { accessToken: async () => token })
  return createSupabaseBackend(client, { getUserId: () => userId })
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
        { key: 'a', person_id: me.id, name: 'Khao Soi', rating: 5, would_order_again: true, notes: 'extra lime' },
        { key: 'b', person_id: sarah.id, name: 'Pad Thai', rating: 3, would_order_again: false, notes: '' },
      ],
    })
    await owner.createVisit({
      restaurantId: r1.id,
      visitedAt: new Date('2026-09-20T23:00:00Z'),
      notes: '',
      personIds: [me.id],
      dishes: [
        { key: 'c', person_id: me.id, name: 'khao soi ', rating: 4, would_order_again: true, notes: '' },
        { key: 'd', person_id: zayn.id, name: 'Fries', rating: 5, would_order_again: true, notes: '' },
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
      owner.createVisit({ restaurantId: r1.id, visitedAt: new Date(), notes: '', personIds: [me.id], dishes: [{ key: 'x', person_id: me.id, name: 'X', rating: 9, would_order_again: false, notes: '' }] }),
      /rating/)
    check('failed visit left nothing behind', (await owner.visits(r1.id)).length === 2)
    await rejects('cannot delete a person with dishes', () => owner.deletePerson(sarah.id), /has dishes logged/)

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
    check('wife sees only the visit Sarah was on', wifeVisits.length === 1 && wifeVisits[0].notes === 'Busy Friday', wifeVisits.map((v) => v.notes))
    check('wife sees every dish on that visit', wifeVisits[0].dishes.length === 2)
    check('wife sees who logged it', wifeVisits[0].owner?.display_name === 'Saif')
    check('wife sees names of everyone on the visit', wifeVisits[0].visit_people.every((vp) => vp.person !== null))
    check('restaurant shows in wife\'s list', (await wife.visitedRestaurants()).length === 1)
    const circles = await wife.circlesImIn()
    check('circlesImIn shows owner name', circles.length === 1 && circles[0].owner?.display_name === 'Saif', circles)
    await wife.deleteVisit(wifeVisits[0].id)
    check('wife cannot delete owner\'s visit', (await owner.visits(r1.id)).length === 2)
    await rejects('invite code is single use', () => stranger.claimInvite(code), /not valid/)

    // Future visits flow through
    await owner.createVisit({ restaurantId: r1.id, visitedAt: new Date(), notes: 'Birthday', personIds: [sarah.id], dishes: [{ key: 'e', person_id: sarah.id, name: 'Green Curry', rating: 5, would_order_again: true, notes: '' }] })
    check('new visit with Sarah shows up for wife', (await wife.visits(r1.id)).length === 2)

    // Stranger
    check('stranger sees no visits', (await stranger.visits(r1.id)).length === 0 && (await stranger.visitedRestaurants()).length === 0)
    check('stranger sees only their own person', (await stranger.myCircle()).length === 1)

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
