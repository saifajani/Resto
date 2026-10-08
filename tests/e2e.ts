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
/** Used for the one pass that should see the iPhone version of the Home Screen nudge. */
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

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
  // Two branches of one chain, named the way Google names them.
  { key: 'jackfront', name: "Jack Astor's Bar & Grill Front Street", address: '144 Front Street West', type: 'Bar & Grill', cuisine: 'american', lat: 43.6487, lon: -79.3965 },
  { key: 'jackairport', name: "Jack Astor's Bar & Grill Airport", address: '25 Carlson Court', type: 'Bar & Grill', cuisine: 'american', lat: 43.6487, lon: -79.3975 },
]
/** Nearest first, as the screen should end up showing them. */
const BY_DISTANCE = [
  'Cafe Landwer', 'Byblos', 'Kinka Izakaya', 'Pai Northern Thai', 'Alo', 'Canoe', 'Richmond Station',
  'Momofuku', 'Bar Raval', 'Terroni', "Jack Astor's Bar & Grill Front Street", "Jack Astor's Bar & Grill Airport",
]

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
  const overpass = { radius: 0, calls: 0 }
  await context.route(/overpass/, (route) => {
    const query = decodeURIComponent(route.request().postData() ?? '')
    overpass.radius = Number(/around:(\d+)/.exec(query)?.[1] ?? 0)
    overpass.calls++
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
    // The button stays tappable when the field is empty, and says what's wrong.
    await page.getByRole('button', { name: 'Try the demo' }).click()
    await expectVisible(page, 'Enter your first name', 'empty sign-in field explains itself')
    await shot(page, '01b-sign-in-hint')
    await page.getByLabel('Your first name').fill('Saif')
    ok('the hint clears as soon as you type', (await page.locator('.field-hint').count()) === 0)
    await page.getByRole('button', { name: 'Try the demo' }).click()

    // Add to Home Screen: shown once, straight after registering.
    await expectVisible(page, 'Keep Resto one tap away', 'the Home Screen nudge follows registering')
    // This browser is not iOS Safari, so it gets the short generic version.
    await expectVisible(page, 'Install app', 'off iOS the nudge falls back to generic steps')
    ok('the drawn steps are iOS only', (await page.locator('.ath-anim').count()) === 0)
    await shot(page, '01c-add-to-home')
    await page.getByRole('button', { name: 'Got it' }).click()
    ok('Got it closes the nudge', (await page.getByRole('dialog').count()) === 0)

    // Nearby
    await expectVisible(page, 'Where are you?', 'the list asks which restaurant you are at')
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

    // Editing the first visit: everything comes back filled in, saved photo included.
    await page.locator('.card.visit', { hasText: 'Pad Thai' }).getByRole('link', { name: 'Edit' }).click()
    await expectVisible(page, 'Edit visit', 'edit screen')
    ok('the edit screen hides the tabs', (await page.locator('.tabbar').count()) === 0)
    await expectPhoto(page, 'Khao Soi', 'saved photo shows while editing')
    ok('visit notes are filled in', (await page.getByPlaceholder('Anything worth remembering').inputValue()) === 'Friday night, 40 min wait')
    await page.getByRole('button', { name: /^Pad Thai/ }).click()
    await page.getByRole('radio', { name: '5 stars' }).click()
    await page.getByLabel('Notes').last().fill('Better than last time')
    await page.getByRole('button', { name: 'Save dish', exact: true }).click()
    await page.getByRole('button', { name: /^Khao Soi/ }).click()
    await expectPhoto(page, 'Khao Soi', 'saved photo shows in the dish sheet')
    await page.getByLabel('Choose a photo').setInputFiles({ name: 'khao-soi-2.png', mimeType: 'image/png', buffer: PHOTO })
    await expectPhoto(page, 'Khao Soi', 'a replacement photo shows in the dish sheet')
    await page.getByRole('button', { name: 'Save dish', exact: true }).click()
    await page.getByPlaceholder('Anything worth remembering').fill('Friday night, worth the wait')
    await shot(page, '05c-edit-visit')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expectVisible(page, 'Friday night, worth the wait', 'edited visit notes shown')
    await expectVisible(page, 'Better than last time', 'edited dish notes shown')
    ok('the edit is saved in place, not as another visit', (await page.locator('.card.visit').count()) === 2)
    await expectPhoto(page, 'Khao Soi', 'the replaced photo shows after saving')
    await page.locator('.card.visit', { hasText: 'Pad Thai' }).getByRole('link', { name: 'Edit' }).click()
    await expectVisible(page, 'Edit visit', 'edit screen again')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expectVisible(page, 'Past visits', 'saving with no changes goes straight back')

    // Back to list: marked as visited
    await page.getByRole('link', { name: 'Restaurants' }).click()
    await expectVisible(page, "You've been here", 'visited place pinned in nearby')
    ok('visited row carries the filled mark', (await page.getByRole('img', { name: "You've been here" }).count()) === 1)
    ok('a place nobody has been to has no mark', (await page.getByRole('img', { name: /has been here/ }).count()) === 0)
    await expectVisible(page, '2 visits', 'your restaurants shows visit count')
    await shot(page, '06-nearby-visited')

    // Chains: a dish rated at one branch has to reach the other, because the
    // menu is the same even though Google calls them different places.
    await page.getByRole('button', { name: 'Show more' }).click()
    await page.getByRole('button', { name: /Jack Astor.s Bar & Grill Front Street/ }).click()
    await page.getByRole('link', { name: '+ Log a visit' }).click()
    await page.getByRole('button', { name: '+ Add a dish' }).click()
    await page.getByLabel('Dish', { exact: true }).fill('Nachos')
    await page.getByRole('radio', { name: '4 stars' }).click()
    await page.getByRole('button', { name: 'Add dish', exact: true }).click()
    await page.getByRole('button', { name: /Save visit \(1 dish\)/ }).click()
    await expectVisible(page, 'Past visits', 'visit logged at the first branch')

    await page.getByRole('link', { name: 'Restaurants' }).click()
    await page.getByRole('button', { name: 'Show more' }).click()
    ok(
      'the other branch is flagged as a chain you have eaten at',
      (await page.getByRole('img', { name: /another location of this chain/ }).count()) === 1,
    )
    await shot(page, '06b-chain-mark')
    await page.getByRole('button', { name: /Jack Astor.s Bar & Grill Airport/ }).click()
    await expectVisible(page, 'No visits yet', 'the other branch has no visits of its own')
    await expectVisible(page, 'Other locations', 'and still shows what was ordered at the first')
    await expectVisible(page, 'Nachos', 'the dish carries across branches')
    await expectVisible(page, '144 Front Street West', 'with the branch it was ordered at')
    await shot(page, '06c-other-locations')

    // Feed: every visit, newest logged first, each one a way into its restaurant
    await page.getByRole('link', { name: 'Feed' }).click()
    await expectVisible(page, 'The latest visits from you and your circle', 'feed screen')
    const feedPlaces = await page.locator('.feed-restaurant').allTextContents()
    ok('feed lists every visit, newest first', feedPlaces.length === 3 && /Jack Astor/.test(feedPlaces[0]), feedPlaces)
    await expectVisible(page, 'Nachos', 'feed shows the dishes')
    ok('each card leads with when it was logged', (await page.getByText('Logged today').count()) === 3)
    ok('and gives the visit date underneath', (await page.getByText(/^Visit: /).count()) === 3)
    await shot(page, '06d-feed')
    await page.locator('.feed-restaurant').first().click()
    await expectVisible(page, '+ Log a visit', 'a feed entry opens its restaurant')
    await page.getByRole('link', { name: 'Restaurants' }).click()

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

    // Inviting someone who isn't in the circle yet: one button, not "add them
    // first, then find the Invite button on their row".
    await page.getByRole('button', { name: 'Invite someone' }).click()
    await expectVisible(page, 'Who are you inviting?', 'invite sheet asks for a name')
    await page.getByPlaceholder('Their name').fill('Aunt May')
    await page.getByRole('button', { name: 'Get their code' }).click()
    // Demo mode has no invites, so the code fails and says so. The person is
    // added either way, which is what the real backend does too.
    await expectVisible(page, 'Invites need the real backend', 'demo says invites need the real backend')
    await page.getByRole('button', { name: 'Close' }).click()
    await expectVisible(page, 'Aunt May', 'the invited person joins your circle')
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
    ok('the Home Screen nudge does not come back', (await page.getByRole('dialog').count()) === 0)
    // Dismissing it is not a dead end: the steps stay on the Profile tab.
    await page.getByRole('button', { name: 'Add Resto to your Home Screen' }).click()
    await expectVisible(page, 'Keep Resto one tap away', 'Profile reopens the Home Screen steps')
    await page.getByRole('button', { name: 'Got it' }).click()
    await page.getByRole('radio', { name: 'Automatic' }).click()
    await expectTheme(page, 'light', 'back to Automatic follows the system again')

    nearbyCallsBeforeReload = google.nearby

    // Pull down to refresh, the gesture an installed app has no chrome for.
    // Back to the list first: the handler only lives on the Restaurants page.
    await page.getByRole('link', { name: 'Restaurants' }).click()
    await expectVisible(page, 'Cafe Landwer', 'back on the nearby list')
    // The gesture goes in as source text: tsx's esbuild rewrites named inner
    // functions and the browser then trips over its missing __name helper.
    const pull = (ys: number[]) => `(async () => {
      document.scrollingElement.scrollTop = 0
      const at = (y) => [new Touch({ identifier: 1, target: document.body, clientX: 180, clientY: y })]
      const fire = (type, y) => document.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : at(y), changedTouches: at(y),
      }))
      fire('touchstart', ${ys[0]})
      for (const y of ${JSON.stringify(ys.slice(1))}) { fire('touchmove', y); await new Promise((r) => setTimeout(r, 20)) }
      fire('touchend', ${ys[ys.length - 1]})
    })()`
    const nearbyCalls = () => (PROVIDER === 'google' ? google.nearby : overpass.calls)
    await page.waitForTimeout(300)
    const before = nearbyCalls()
    await page.evaluate(pull([40, 80, 140, 200]))
    // The indicator stays up until the refresh finishes, so wait it out.
    await page.waitForFunction("!document.querySelector('.pull-refresh')", undefined, { timeout: 5000 }).catch(() => {})
    ok('pulling down refetches the nearby list', nearbyCalls() === before + 1, { before, after: nearbyCalls() })
    ok('the refreshed list is still there', (await nearbyTitles()).length > 0)

    // A short tug is a scroll, not a refresh.
    const beforeTug = nearbyCalls()
    await page.evaluate(pull([40, 55]))
    ok('a small tug does not refresh', nearbyCalls() === beforeTug, nearbyCalls())
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

    // An invite link: the code comes first, and the Home Screen nudge waits for it.
    const invited = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      geolocation: HOME,
      permissions: ['geolocation'],
      // The phone the nudge is written for, so this pass gets the Safari steps.
      userAgent: IPHONE_SAFARI,
    })
    const p3 = await invited.newPage()
    await p3.goto(`${BASE}/join/ABC234`)
    await expectVisible(p3, 'ABC234', 'the invite code carries into the sign-in screen')
    await p3.getByLabel('Your first name').fill('Nadia')
    await p3.getByRole('button', { name: 'Try the demo' }).click()
    await expectVisible(p3, "You've been invited", 'an invite link lands on the join screen')
    ok('the Home Screen nudge waits while there is a code to enter', (await p3.getByRole('dialog').count()) === 0)
    await shot(p3, '11-join-invite')
    await p3.getByRole('button', { name: 'Not now' }).click()
    await expectVisible(p3, 'Keep Resto one tap away', 'the nudge follows the end of the invite flow')
    await expectVisible(p3, 'Tap the Share button', 'on an iPhone the nudge gives the Safari steps')
    ok('the steps are drawn, not only written', (await p3.locator('.ath-anim').count()) === 1)
    await shot(p3, '12-add-to-home-ios')
    await invited.close()

    // Location denied
    const denied = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    // Headless Chromium leaves the permission prompt pending, so simulate the user tapping "Don't Allow".
    // This context is about the location message, so skip the Home Screen nudge.
    await denied.addInitScript(() => localStorage.setItem('resto:add-to-home', 'done'))
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
