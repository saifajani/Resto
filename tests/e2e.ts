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

const googleNearbyFixture = {
  places: [
    { id: 'ChIJpai', displayName: { text: 'Pai Northern Thai' }, shortFormattedAddress: '18 Duncan Street', location: { latitude: 43.6479, longitude: -79.3888 }, primaryTypeDisplayName: { text: 'Thai' } },
    { id: 'ChIJrichmond', displayName: { text: 'Richmond Station' }, shortFormattedAddress: '1 Richmond Street West', location: { latitude: 43.6516, longitude: -79.3792 }, primaryTypeDisplayName: { text: 'Regional' } },
    { id: 'ChIJterroni', displayName: { text: 'Terroni' }, location: { latitude: 43.6455, longitude: -79.395 }, primaryTypeDisplayName: { text: 'Italian Restaurant' } },
  ],
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
    { type: 'node', id: 1001, lat: 43.6479, lon: -79.3888, tags: { name: 'Pai Northern Thai', amenity: 'restaurant', cuisine: 'thai', 'addr:housenumber': '18', 'addr:street': 'Duncan Street' } },
    { type: 'way', id: 2002, center: { lat: 43.6516, lon: -79.3792 }, tags: { name: 'Richmond Station', amenity: 'restaurant', cuisine: 'regional', 'addr:housenumber': '1', 'addr:street': 'Richmond Street West' } },
    { type: 'node', id: 3003, lat: 43.6455, lon: -79.3950, tags: { name: 'Terroni', amenity: 'restaurant', cuisine: 'italian;pizza' } },
    { type: 'node', id: 4004, lat: 43.6490, lon: -79.3860, tags: { amenity: 'cafe' } },
  ],
}
const photonFixture = {
  features: [
    { geometry: { coordinates: [-79.3888, 43.6479] }, properties: { osm_type: 'N', osm_id: 1001, name: 'Pai Northern Thai', housenumber: '18', street: 'Duncan Street', city: 'Toronto' } },
    { geometry: { coordinates: [-79.4011, 43.6655] }, properties: { osm_type: 'N', osm_id: 5005, name: 'Pai Uptown', street: 'Yonge Street', city: 'Toronto' } },
  ],
}

let failures = 0
async function expectVisible(page: Page, text: string | RegExp, label = String(text)) {
  try {
    await page.getByText(text).first().waitFor({ state: 'visible', timeout: 5000 })
    console.log(`PASS  ${label}`)
  } catch {
    console.log(`FAIL  ${label}`)
    failures++
  }
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
  const google = { nearby: 0, autocompleteTokens: new Set<string>(), details: [] as string[], badKey: false, badMask: false }
  await context.route(/overpass/, (route) => route.fulfill({ json: overpassFixture }))
  await context.route(/photon\.komoot\.io/, (route) => route.fulfill({ json: photonFixture }))
  await context.route(/places\.googleapis\.com/, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    if (req.headers()['x-goog-api-key'] !== TEST_KEY) google.badKey = true
    const cors = { 'access-control-allow-origin': '*' }
    if (url.pathname.endsWith(':searchNearby')) {
      google.nearby++
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
    await expectVisible(page, PROVIDER === 'google' ? 'Italian Restaurant' : 'Italian, Pizza', 'cuisine formatted')
    await expectVisible(page, /^\d+ m$/, 'distance shown')
    await shot(page, '02-nearby')

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
    await shot(page, '03-dish-editor')
    // The sheet should read as its own screen: near the top on a phone, with the action pinned at the bottom.
    const sheetBox = await page.locator('.sheet').boundingBox()
    const addBox = await page.getByRole('button', { name: 'Add dish', exact: true }).boundingBox()
    if (sheetBox && sheetBox.y < 120 && addBox && addBox.y > 844 - 140) console.log('PASS  dish sheet is tall with its button at the bottom')
    else { console.log(`FAIL  dish sheet layout ${JSON.stringify({ sheetBox, addBox })}`); failures++ }
    await page.getByRole('button', { name: 'Add dish', exact: true }).click()

    await page.getByRole('button', { name: '+ Add a dish' }).click()
    await expectVisible(page, 'Sarah', 'next dish defaults to next person')
    const sarahSelected = await page.locator('.sheet .chip.on').textContent()
    if (sarahSelected !== 'Sarah') { console.log(`FAIL  expected Sarah preselected, got ${sarahSelected}`); failures++ }
    await page.getByLabel('Dish', { exact: true }).fill('Pad Thai')
    await page.getByRole('radio', { name: '3 stars' }).click()
    await page.getByRole('button', { name: 'Add dish', exact: true }).click()
    await page.getByPlaceholder('Anything worth remembering').fill('Friday night, 40 min wait')
    await shot(page, '04-log-visit')
    await page.getByRole('button', { name: /Save visit \(2 dishes\)/ }).click()

    // History
    await expectVisible(page, 'What to order', 'summary appears after saving')
    await expectVisible(page, 'Your dishes', 'your dishes group')
    await expectVisible(page, "Sarah's dishes", "Sarah's dishes group")
    await expectVisible(page, 'Friday night, 40 min wait', 'visit notes shown')
    await shot(page, '05-restaurant-history')

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
      const ok = (name: string, cond: boolean, detail?: unknown) => {
        console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${JSON.stringify(detail)}`}`)
        if (!cond) failures++
      }
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
