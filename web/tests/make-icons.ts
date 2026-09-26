/** Renders public/icon.svg to the PNG sizes iOS and Android home screens need. */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [file, size, rounded] of [['icon-192.png', 192, true], ['icon-512.png', 512, true], ['apple-touch-icon.png', 180, false]] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  // iOS rounds the corners itself, so its icon is a full square.
  const art = rounded ? svg : svg.replace('rx="112"', 'rx="0"')
  await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${art}`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true })
  await page.close()
}
await browser.close()
