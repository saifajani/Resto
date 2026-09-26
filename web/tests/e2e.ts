/**
 * Drives the built app in a phone-sized Chromium, in demo mode, with
 * OpenStreetMap responses mocked. Run `npm run build` first.
 * SCREENSHOT_DIR (optional) saves screenshots of each step.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright-core'

const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const shots = process.env.SCREENSHOT_DIR
const PORT = 4179
const BASE = `http://127.0.0.1:${PORT}`
const HOME = { latitude: 43.6487, longitude: -79.3854 } // downtown Toronto

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

async function main() {
  if (shots) mkdirSync(shots, { recursive: true })
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
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
  await context.route(/overpass/, (route) => route.fulfill({ json: overpassFixture }))
  await context.route(/photon\.komoot\.io/, (route) => route.fulfill({ json: photonFixture }))
  const page = await context.newPage()
  page.on('pageerror', (e) => {
    console.log(`FAIL  page error: ${e.message}`)
    failures++
  })
  page.on('dialog', (d) => d.accept())

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
    await expectVisible(page, 'Italian, Pizza', 'multi-cuisine formatted')
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
    await page.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: '+ Add a dish' }).click()
    await expectVisible(page, 'Sarah', 'next dish defaults to next person')
    const sarahSelected = await page.locator('.sheet .chip.on').textContent()
    if (sarahSelected !== 'Sarah') { console.log(`FAIL  expected Sarah preselected, got ${sarahSelected}`); failures++ }
    await page.getByLabel('Dish', { exact: true }).fill('Pad Thai')
    await page.getByRole('radio', { name: '3 stars' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
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
    await page.getByRole('button', { name: 'Done' }).click()
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
    await expectVisible(page, 'Pai Uptown', 'search results from Photon')
    await shot(page, '07-search')
    await page.getByLabel('Search restaurants').fill('')

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

    // Survives a reload (deep link + saved data)
    await page.goto(BASE + '/')
    await expectVisible(page, '1 visit', 'data persists across reload')

    // Dark mode
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.getByRole('button', { name: /Pai Northern Thai/ }).first().click()
    await expectVisible(page, 'What to order', 'dark mode page renders')
    await shot(page, '09-dark-mode')

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
  } finally {
    await browser.close()
    server.kill()
  }

  console.log(failures ? `\n${failures} FAILED` : '\nAll UI checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
