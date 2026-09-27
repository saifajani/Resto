/**
 * Builds the app and drives it in a phone-sized Chromium, in demo mode, with
 * map responses mocked. PLACES=google (default) or PLACES=osm picks the provider.
 * SCREENSHOT_DIR (optional) saves screenshots of each step.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright-core'

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const shots = process.env.SCREENSHOT_DIR
const PORT = 4179
const BASE = `http://127.0.0.1:${PORT}`
const HOME = { latitude: 43.6487, longitude: -79.3854 } // downtown Toronto
const PROVIDER = process.env.PLACES === 'osm' ? 'osm' : 'google'
const TEST_KEY = 'test-browser-key'

/**
 * Ten places, in no particular order, so the list has to sort them by distance
 * and has more than one page of them. Distances from HOME run about 40 m
 * (Cafe Landwer) to 850 m (Terroni).
 */
const NEARBY_FIXTURE = [
  { key: 'terroni', name: 'Terroni', address: null, type: 'Italian Restaurant', cuisine: 'italian;pizza', lat: 43.6455, lon: -79.395 },
  { key: 'landwer', name: 'Cafe Landwer', address: '20 Bay Street', type: 'Cafe', cuisine: 'cafe', lat: 43.6487, lon: -79.3849 },
  { key: 'richmond', name: 'Richmond Station', address: '1 Richmond Street West', type: 'Regional', cuisine: 'regional', lat: 43.6516, lon: -79.3792 },
  { key: 'byblos', name: 'Byblos', address: '11 Duncan Street', type: 'Mediterranean', cuisine: 'mediterranean', lat: 43.6487, lon: -79.3842 },
  { key: 'pai', name: 'Pai Northern Thai', address: '18 Duncan Street', type: 'Thai', cuisine: 'thai', lat: 43.6479, lon: -79.3888 },
  { key: 'canoe', name: 'Canoe', address: '66 Wellington Street West', type: 'Canadian', cuisine: 'canadian', lat: 43.6487, lon: -79.392 },
  { key: 'kinka', name: 'Kinka Izakaya', address: '398 Church Street', type: 'Japanese', cuisine: 'japanese', lat: 43.6487, lon: -79.383 },
  { key: 'raval', name: 'Bar Raval', address: '505 College Street', type: 'Tapas', cuisine: 'tapas', lat: 43.6487, lon: -79.395 },
  { key: 'alo', name: 'Alo', address: '163 Spadina Avenue', type: 'French', cuisine: 'french', lat: 43.6487, lon: -79.39 },
  { key: 'momofuku', name: 'Momofuku', address: '190 University Avenue', type: 'Asian', cuisine: 'asian', lat: 43.6487, lon: -79.3945 },
]
/** Nearest first, as the screen should end up showing them. */
const BY_DISTANCE = ['Cafe Landwer', 'Byblos', 'Kinka Izakaya', 'Pai Northern Thai', 'Alo', 'Canoe', 'Richmond Station', 'Momofuku', 'Bar Raval', 'Terroni']

const googleNearbyFixture = {
  places: NEARBY_FIXTURE.map((p) => ({
    id: `ChIJ${p.key}`,
    displayName: { text: p.name },
    ...(p.address ? { shortFormattedAddress: p.address } : {}),
    location: { latitude: p.lat, longitude: p.lon },
    primaryTypeDisplayName: { text: p.type },
  })),
}
const googleAutocompleteFixture = {
  suggestions: [
    { placePrediction: { placeId: 'ChIJpai', text: { text: 'Pai Northern Thai, Duncan Street' }, structuredFormat: { mainText: { text: 'Pai Northern Thai' }, secondaryText: { text: 'Duncan Street, Toronto' } }, types: ['thai_restaurant', 'restaurant', 'food'], distanceMeters: 290 } },
    { placePrediction: { placeId: 'ChIJpaiuptown', text: { text: 'Pai Uptown' }, structuredFormat: { mainText: { text: 'Pai Uptown' }, secondaryText: { text: 'Yonge Street, Toronto' } }, types: ['restaurant', 'food'], distanceMeters: 2100 } },
    { placePrediction: { placeId: 'ChIJpaint', text: { text: 'Paint Store' }, structuredFormat: { mainText: { text: 'Paint Store' } }, types: ['hardware_store'] } },
  ],
}

const overpassFixture = {
  elements: [
    ...NEARBY_FIXTURE.map((p, i) => ({
      type: p.key === 'richmond' ? ('way' as const) : ('node' as const),
      id: 1001 + i,
      ...(p.key === 'richmond' ? { center: { lat: p.lat, lon: p.lon } } : { lat: p.lat, lon: p.lon }),
      tags: {
        name: p.name,
        amenity: p.key === 'landwer' ? 'cafe' : 'restaurant',
        cuisine: p.cuisine,
        ...(p.address ? { 'addr:housenumber': p.address.split(' ')[0], 'addr:street': p.address.split(' ').slice(1).join(' ') } : {}),
      },
    })),
    // No name, so it should never reach the list.
    { type: 'node' as const, id: 4004, lat: 43.649, lon: -79.386, tags: { amenity: 'cafe' } },
  ],
}
const photonFixture = {
  features: [
    { geometry: { coordinates: [-79.3888, 43.6479] }, properties: { osm_type: 'N', osm_id: 1001, name: 'Pai Northern Thai', housenumber: '18', street: 'Duncan Street', city: 'Toronto' } },
    { geometry: { coordinates: [-79.4011, 43.6655] }, properties: { osm_type: 'N', osm_id: 5005, name: 'Pai Uptown', street: 'Yonge Street', city: 'Toronto' } },
  ],
}

/** A 1x1 PNG, standing in for a photo from the camera. */
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

let failures = 0
async function expectPhoto(page: Page, name: string, label: string) {
  try {
    await page.getByRole('img', { name: `Photo of ${name}` }).first().waitFor({ state: 'visible', timeout: 5000 })
    // Visible isn't enough: wait for the image itself to load (or fail).
    const loaded = await page.getByRole('img', { name: `Photo of ${name}` }).first().evaluate((img: HTMLImageElement) =>
      img.complete
        ? img.naturalWidth > 0
        : new Promise<boolean>((resolve) => {
            img.addEventListener('load', () => resolve(true), { once: true })
            img.addEventListener('error', () => resolve(false), { once: true })
          }),
    )
    console.log(`${loaded ? 'PASS' : 'FAIL'}  ${label}`)
    if (!loaded) failures++
  } catch {
    console.log(`FAIL  ${label}`)
    failures++
  }
}
async function expectVisible(page: Page, text: string | RegExp, label = String(text)) {
  try {
    await page.getByText(text).first().waitFor({ state: 'visible', timeout: 5000 })
    console.log(`PASS  ${label}`)
  } catch {
    console.log(`FAIL  ${label}`)
    failures++
  }
}
function ok(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${JSON.stringify(detail)}`}`)
  if (!cond) failures++
}
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` })
}
/** Polls, because a system colour-scheme change reaches the page a tick later. */
async function expectTheme(page: Page, theme: 'light' | 'dark', label: string) {
  try {
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme, { timeout: 5000 })
    console.log(`PASS  ${label}`)
  } catch {
    const actual = await page.evaluate(() => document.documentElement.dataset.theme)
    console.log(`FAIL  ${label}  -> data-theme=${actual}, wanted ${theme}`)
    failures++
  }
}

async function main() {
  if (shots) mkdirSync(shots, { recursive: true })
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_GOOGLE_MAPS_API_KEY: PROVIDER === 'google' ? TEST_KEY : '' }
  const build = spawnSync('npx', ['vite', 'build'], { env, stdio: 'inherit' })
  if (build.status !== 0) process.exit(1)
  console.log(`Testing with ${PROVIDER === 'google' ? 'Google Places' : 'OpenStreetMap'}`)
  // detached + negative pid below, so the whole npx -> vite process group is stopped afterwards
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
  await new Promise((r) => setTimeout(r, 2000))

  const browser = await chromium.launch({ executablePath: CHROMIUM })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    geolocation: HOME,
    permissions: ['geolocation'],
  })
  const google = { nearby: 0, autocompleteTokens: new Set<string>(), details: [] as string[], badKey: false, badMask: false, nearbyRadius: 0 }
  // The query is form-encoded, so "around:5000" arrives as "around%3A5000".
  const overpass = { radius: 0 }
  await context.route(/overpass/, (route) => {
    const query = decodeURIComponent(route.request().postData() ?? '')
    overpass.radius = Number(/around:(\d+)/.exec(query)?.[1] ?? 0)
    return route.fulfill({ json: overpassFixture })
  })
  await context.route(/photon\.komoot\.io/, (route) => route.fulfill({ json: photonFixture }))
  await context.route(/places\.googleapis\.com/, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    if (req.headers()['x-goog-api-key'] !== TEST_KEY) google.badKey = true
    const cors = { 'access-control-allow-origin': '*' }
    if (url.pathname.endsWith(':searchNearby')) {
      google.nearby++
      google.nearbyRadius = JSON.parse(req.postData() ?? '{}').locationRestriction?.circle?.radius ?? 0
      if (!req.headers()['x-goog-fieldmask']?.includes('places.displayName')) google.badMask = true
      return route.fulfill({ json: googleNearbyFixture, headers: cors })
    }
    if (url.pathname.endsWith(':autocomplete')) {
      google.autocompleteTokens.add(JSON.parse(req.postData() ?? '{}').sessionToken)
      return route.fulfill({ json: googleAutocompleteFixture, headers: cors })
    }
    const id = url.pathname.split('/').pop()!
    google.details.push(`${id}|${url.searchParams.get('sessionToken')}|${req.headers()['x-goog-fieldmask']}`)
    return route.fulfill({ json: { id, location: { latitude: 43.6655, longitude: -79.4011 }, shortFormattedAddress: '2 Yonge Street' }, headers: cors })
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => {
    console.log(`FAIL  page error: ${e.message}`)
    failures++
  })
  page.on('dialog', (d) => d.accept())

  let nearbyCallsBeforeReload = 0
  try {
    // Sign in (demo)
    await page.goto(BASE)
    await expectVisible(page, 'Try the demo', 'sign-in screen shows')
    await shot(page, '01-sign-in')
    await page.getByLabel('Your first name').fill('Saif')
    await page.getByRole('button', { name: 'Try the demo' }).click()

    // Nearby
    await expectVisible(page, 'Pai Northern Thai', 'nearby restaurants load')
    await expectVisible(page, 'Thai · 18 Duncan Street', 'cuisine and address shown')
    await expectVisible(page, /^\d+ m$/, 'distance shown')
    const nearbyTitles = () => page.locator('.row-title').allTextContents()
    const firstPage = await nearbyTitles()
    ok('nearby shows eight places, nearest first', firstPage.join() === BY_DISTANCE.slice(0, 8).join(), firstPage)
    await shot(page, '02-nearby')
    await page.getByRole('button', { name: 'Show more' }).click()
    ok('Show more reveals the rest, still by distance', (await nearbyTitles()).join() === BY_DISTANCE.join(), await nearbyTitles())
    // Terroni is the farthest, so it only appears once the list is expanded.
    await expectVisible(page, PROVIDER === 'google' ? 'Italian Restaurant' : 'Italian, Pizza', 'cuisine formatted')
    // The search is wide enough to fill the list in a small town, and the end
    // of the list sends you to the search box rather than to another request.
    ok(
      'the nearby search asks a wide radius',
      PROVIDER === 'google' ? google.nearbyRadius === 50000 : overpass.radius === 5000,
      PROVIDER === 'google' ? google.nearbyRadius : overpass.radius,
    )
    ok('Show more is replaced at the end of the list', (await page.getByRole('button', { name: 'Show more' }).count()) === 0)
    await page.getByRole('button', { name: 'Search by name' }).click()
    ok('Search by name puts the cursor in the search box', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Search restaurants'))
    await shot(page, '02b-nearby-expanded')

    // First visit
    await page.getByRole('button', { name: /Pai Northern Thai/ }).click()
    await expectVisible(page, 'No visits yet', 'empty restaurant page')
    await page.getByRole('link', { name: '+ Log a visit' }).click()
    await expectVisible(page, 'Who was there', 'log visit screen')
    await page.getByPlaceholder('Add someone new').fill('Sarah')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expectVisible(page, /^Sarah$/, 'new person added and selected')

    await page.getByRole('button', { name: '+ Add a dish' }).click()
    await page.getByLabel('Dish', { exact: true }).fill('Khao Soi')
    await page.getByRole('radio', { name: '5 stars' }).click()
    await page.getByText('Would order again').click()
    await page.getByLabel('Notes').last().fill('Ask for extra lime')
    await page.getByLabel('Choose a photo').setInputFiles({ name: 'khao-soi.png', mimeType: 'image/png', buffer: PHOTO })
    await expectPhoto(page, 'Khao Soi', 'photo shows in the dish sheet')
    await expectVisible(page, 'Replace photo', 'photo can be replaced or removed')
    await shot(page, '03-dish-editor')
    // The sheet should read as its own screen: near the top on a phone, with the action pinned at the bottom.
    const sheetBox = await page.locator('.sheet').boundingBox()
    const addBox = await page.getByRole('button', { name: 'Add dish', exact: true }).boundingBox()
    if (sheetBox && sheetBox.y < 120 && addBox && addBox.y > 844 - 140) console.log('PASS  dish sheet is tall with its button at the bottom')
    else { console.log(`FAIL  dish sheet layout ${JSON.stringify({ sheetBox, addBox })}`); failures++ }
    await page.getByRole('button', { name: 'Add dish', exact: true }).click()
    await expectPhoto(page, 'Khao Soi', 'photo thumbnail shows in the draft dish list')

    await page.getByRole('button', { name: '+ Add a dish' }).click()
    await expectVisible(page, 'Sarah', 'next dish defaults to next person')
    const sarahSelected = await page.locator('.sheet .chip.on').textContent()
    if (sarahSelected !== 'Sarah') { console.log(`FAIL  expected Sarah preselected, got ${sarahSelected}`); failures++ }
    await page.getByLabel('Dish', { exact: true }).fill('Pad Thai')
    await page.getByRole('radio', { name: '3 stars' }).click()
    await page.getByRole('button', { name: 'Add dish', exact: true }).click()
    await page.getByPlaceholder('Anything worth remembering').fill('Friday night, 40 min wait')
    await shot(page, '04-log-visit')
    // The photo upload fails once, as on a weak connection: the visit saves, and the photo can be retried.
    await page.evaluate(() => (globalThis.__restoFailPhotoUploads = 1))
    await page.getByRole('button', { name: /Save visit \(2 dishes\)/ }).click()
    await expectVisible(page, 'Your visit is saved', 'failed photo upload is explained')
    await expectVisible(page, /the photo of Khao Soi didn't upload/, 'names the dish whose photo failed')
    await shot(page, '04b-photo-failed')
    await page.getByRole('button', { name: 'Try again' }).click()

    // History
    await expectVisible(page, 'What to order', 'summary appears after saving')
    await expectVisible(page, 'Your dishes', 'your dishes group')
    await expectVisible(page, "Sarah's dishes", "Sarah's dishes group")
    await expectVisible(page, 'Friday night, 40 min wait', 'visit notes shown')
    await expectPhoto(page, 'Khao Soi', 'photo shows on the restaurant screen after retrying')
    await shot(page, '05-restaurant-history')
    await page.getByRole('button', { name: 'View photo of Khao Soi' }).first().click()
    try {
      await page.locator('.sheet .photo-full').waitFor({ state: 'visible', timeout: 5000 })
      console.log('PASS  photo opens full size')
    } catch {
      console.log('FAIL  photo opens full size')
      failures++
    }
    await shot(page, '05b-photo-full')
    await page.getByRole('button', { name: 'Close' }).click()

    // Second visit reusing a suggested dish
    await page.getByRole('link', { name: '+ Log a visit' }).click()
    await page.getByRole('button', { name: '+ Add a dish' }).click()
    await page.getByLabel('Dish', { exact: true }).fill('kha')
    await page.getByRole('button', { name: 'Khao Soi' }).click()
    await page.getByRole('radio', { name: '4 stars' }).click()
    await page.getByText('Would order again').click()
    await page.getByRole('button', { name: 'Add dish', exact: true }).click()
    await page.getByRole('button', { name: /Save visit \(1 dish\)/ }).click()
    await expectVisible(page, '×2', 'repeat dish counted twice')
    await expectVisible(page, 'Past visits', 'visit timeline')

    // Back to list: marked as visited
    await page.getByRole('link', { name: 'Restaurants' }).click()
    await expectVisible(page, "You've been here", 'visited place pinned in nearby')
    ok('visited row carries the filled mark', (await page.getByRole('img', { name: "You've been here" }).count()) === 1)
    ok('a place nobody has been to has no mark', (await page.getByRole('img', { name: /has been here/ }).count()) === 0)
    await expectVisible(page, '2 visits', 'your restaurants shows visit count')
    await shot(page, '06-nearby-visited')

    // Search
    await page.getByLabel('Search restaurants').fill('pai')
    await expectVisible(page, 'Pai Uptown', 'search results shown')
    await shot(page, '07-search')
    if (PROVIDER === 'google') {
      const paint = await page.getByText('Paint Store').count()
      if (paint) { console.log('FAIL  non-food suggestion filtered'); failures++ } else console.log('PASS  non-food suggestion filtered')
      await page.getByRole('button', { name: /Pai Uptown/ }).click()
      await expectVisible(page, '2 Yonge Street', 'search result opens with address from Place Details')
      await page.getByRole('link', { name: 'Restaurants' }).click()
      await page.getByLabel('Search restaurants').fill('pai')
      await expectVisible(page, 'Pai Uptown', 'second search')
      await page.getByLabel('Search restaurants').fill('')
    } else {
      await page.getByLabel('Search restaurants').fill('')
    }

    // Deleting a visit
    await page.getByRole('button', { name: /Pai Northern Thai/ }).first().click()
    await page.getByRole('button', { name: 'Delete' }).first().click()
    await expectVisible(page, 'Pad Thai', 'older visit remains after delete')

    // Remove Sarah's dish's person blocked
    await page.getByRole('link', { name: 'People' }).click()
    await expectVisible(page, 'Your circle', 'people screen')
    await page.getByRole('button', { name: 'Remove Sarah' }).click()
    await expectVisible(page, "has dishes logged", 'cannot remove person with dishes')
    await shot(page, '08-people')

    // Profile
    await page.getByRole('link', { name: 'Profile' }).click()
    await expectVisible(page, 'Got an invite code?', 'profile screen')

    // Appearance: the system is light here, so Automatic resolves to light
    await expectTheme(page, 'light', 'automatic follows the light system setting')
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expectTheme(page, 'dark', 'choosing Dark switches the theme')
    await shot(page, '09-appearance-dark')
    await page.reload()
    await expectTheme(page, 'dark', 'the chosen theme survives a reload')
    await page.getByRole('radio', { name: 'Automatic' }).click()
    await expectTheme(page, 'light', 'back to Automatic follows the system again')

    nearbyCallsBeforeReload = google.nearby
    // Survives a reload (deep link + saved data)
    await page.goto(BASE + '/')
    await expectVisible(page, '1 visit', 'data persists across reload')

    // Dark mode: on Automatic, a system change applies without a reload
    await page.emulateMedia({ colorScheme: 'dark' })
    await expectTheme(page, 'dark', 'automatic reacts to the system turning dark')
    await page.getByRole('button', { name: /Pai Northern Thai/ }).first().click()
    await expectVisible(page, 'What to order', 'dark mode page renders')
    await expectPhoto(page, 'Khao Soi', 'photo survives a reload')
    await shot(page, '10-dark-mode')

    // Location denied
    const denied = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    // Headless Chromium leaves the permission prompt pending, so simulate the user tapping "Don't Allow".
    await denied.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) =>
        fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError)
    })
    const p2 = await denied.newPage()
    await p2.goto(BASE)
    await p2.getByLabel('Your first name').fill('Test')
    await p2.getByRole('button', { name: 'Try the demo' }).click()
    await expectVisible(p2, 'Location is off', 'location denied message')
    if (PROVIDER === 'google') {
      ok('Google key sent on every call', !google.badKey)
      ok('Nearby asks only for the fields it needs', !google.badMask)
      // In memory only: Google's terms don't allow storing place data, so a full reload calls again.
      ok('Nearby results cached across screens (1 call)', nearbyCallsBeforeReload === 1, nearbyCallsBeforeReload)
      const [detail] = google.details
      ok('one Place Details call, Essentials fields only', google.details.length === 1 && detail.endsWith('|id,location,shortFormattedAddress'), google.details)
      const firstToken = detail?.split('|')[1]
      ok('Place Details closes the autocomplete session', !!firstToken && google.autocompleteTokens.has(firstToken), { details: google.details, tokens: [...google.autocompleteTokens] })
      ok('a new search starts a new session', google.autocompleteTokens.size === 2, [...google.autocompleteTokens])
    }
  } finally {
    await browser.close()
    process.kill(-server.pid!)
  }

  console.log(failures ? `\n${failures} FAILED` : '\nAll UI checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
