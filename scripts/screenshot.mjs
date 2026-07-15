import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })

const shots = [
  { name: 'home-mobile', url: 'http://localhost:5173/', width: 390, height: 844 },
  { name: 'home-desktop', url: 'http://localhost:5173/', width: 1280, height: 900 },
  { name: 'insights-mobile', url: 'http://localhost:5173/insights', width: 390, height: 844 },
  { name: 'settings-desktop', url: 'http://localhost:5173/settings', width: 1280, height: 900 },
]

for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
  })
  await page.goto(shot.url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `/tmp/nestly-${shot.name}.png`, fullPage: false })
  console.log(`saved /tmp/nestly-${shot.name}.png`)
  await page.close()
}

await browser.close()
