import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

// Start sleep
await page.getByRole('button', { name: /Tidur/ }).first().click()
await page.waitForSelector('text=Mulai tidur')
await page.getByRole('button', { name: 'Simpan' }).click()
await page.waitForSelector('text=Tidur dimulai')
console.log('sleep started')

// Wait for banner to appear
await page.waitForSelector('text=Sedang tidur')
await page.waitForSelector('text=Selesai')
console.log('banner visible with Selesai button')

await page.screenshot({ path: '/tmp/nestly-sleep-banner.png' })
console.log('screenshot saved')

// End sleep via banner button
await page.getByRole('button', { name: /Selesai/ }).click()
await page.waitForSelector('text=Tidur diakhiri')
console.log('sleep ended via banner: OK')

// Confirm banner is gone
await page.waitForTimeout(500)
const bannerGone = !(await page.getByText('Sedang tidur').isVisible())
console.log('banner removed after end:', bannerGone ? 'OK' : 'FAIL')

await browser.close()
