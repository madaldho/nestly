import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const errors = []
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
})

function dialog() {
  return page.getByRole('dialog')
}

async function openAction(label) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  await dialog().waitFor({ state: 'visible' })
}

async function saveAndExpectToast(text) {
  await dialog().getByRole('button', { name: 'Simpan', exact: true }).click()
  await page.waitForSelector(`text=${text}`)
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

// 1. Log susu
await openAction('Susu')
await dialog().getByRole('heading', { name: 'Catat susu' }).waitFor()
await dialog().getByRole('button', { name: 'Tambah 10 ml', exact: true }).click()
await saveAndExpectToast('Susu 100 ml tersimpan')
console.log('feed logged: OK')

// 2. Log popok (pup)
await openAction('Popok')
await dialog().getByRole('heading', { name: 'Catat popok' }).waitFor()
await dialog().getByRole('button', { name: 'Pup', exact: true }).click()
await saveAndExpectToast('Popok tersimpan')
console.log('diaper logged: OK')

// 3. Log tangis — exact + scoped to dialog avoids Field label name collision
await openAction('Tangis')
await dialog().getByRole('heading', { name: 'Lacak tangis' }).waitFor()
await dialog().getByRole('button', { name: 'Kembung', exact: true }).click()
await saveAndExpectToast('Tangis tercatat')
console.log('cry logged: OK')

// 4. Mulai + akhiri tidur
await openAction('Tidur')
await dialog().getByRole('heading', { name: 'Mulai tidur' }).waitFor()
await saveAndExpectToast('Tidur dimulai')
await openAction('Tidur')
await dialog().getByRole('heading', { name: 'Akhiri tidur' }).waitFor()
await saveAndExpectToast('Tidur diakhiri')
console.log('sleep start/end: OK')

// 5. Verifikasi list "Hari ini" terisi
await page.waitForSelector('text=Susu 100 ml')
await page.waitForSelector('text=Pup')
console.log('today list shows events: OK')

// 6. Cek halaman lain render tanpa error
for (const path of ['/timeline', '/insights', '/settings']) {
  await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' })
}
console.log('all pages rendered: OK')

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.screenshot({ path: '/tmp/nestly-home-filled.png' })

if (errors.length) {
  console.log('\nERRORS:')
  for (const e of errors) console.log(' -', e)
  process.exitCode = 1
} else {
  console.log('\nNo console/page errors.')
}

await browser.close()
