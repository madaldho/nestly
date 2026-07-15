import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

type BabyEvent = {
  id: string
  type: string
  timestamp: string
  updatedAt: string
  deleted?: boolean
  ml?: number
  feedKind?: string
  diaperKind?: string
  sleepEnd?: string
  cryCause?: string
  soothedHow?: string
  soothedOk?: boolean
  notes?: string
  caregiver?: string
  synced?: boolean
}

type Store = {
  apiKey: string
  events: BabyEvent[]
  updatedAt: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../data')
const storePath = path.join(dataDir, 'store.json')

async function loadStore(): Promise<Store> {
  await mkdir(dataDir, { recursive: true })
  try {
    const raw = await readFile(storePath, 'utf8')
    return JSON.parse(raw) as Store
  } catch {
    const apiKey =
      process.env.NESTLY_API_KEY ??
      `nst_${randomBytes(24).toString('hex')}`
    const store: Store = {
      apiKey,
      events: [],
      updatedAt: new Date().toISOString(),
    }
    await saveStore(store)
    console.log('\nNestly Agent API key (simpan di Settings app):\n')
    console.log(`  ${apiKey}\n`)
    return store
  }
}

async function saveStore(store: Store) {
  store.updatedAt = new Date().toISOString()
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8')
}

function active(events: BabyEvent[]) {
  return events.filter((e) => !e.deleted)
}

function isToday(iso: string) {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

function estimateNextFeed(events: BabyEvent[]) {
  const feeds = active(events)
    .filter((e) => e.type === 'feed')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8)

  if (!feeds.length) return null

  const intervals: number[] = []
  for (let i = 0; i < feeds.length - 1; i++) {
    const gap =
      (Date.parse(feeds[i].timestamp) - Date.parse(feeds[i + 1].timestamp)) / 60_000
    if (gap > 30 && gap < 360) intervals.push(gap)
  }
  const avg = intervals.length
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : 180
  const nextAt = new Date(Date.parse(feeds[0].timestamp) + avg * 60_000)
  return {
    nextAt: nextAt.toISOString(),
    avgIntervalMin: avg,
    minsUntil: Math.round((nextAt.getTime() - Date.now()) / 60_000),
    last: feeds[0],
  }
}

const app = new Hono()
app.use('*', cors())

app.get('/api/health', async (c) => {
  const store = await loadStore()
  return c.json({
    ok: true,
    name: 'Nestly Agent API',
    events: store.events.length,
    updatedAt: store.updatedAt,
  })
})

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health' || c.req.path === '/api/tools') return next()
  const store = await loadStore()
  const header = c.req.header('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || token !== store.apiKey) {
    return c.json({ error: 'Unauthorized — cek API key di Settings Nestly' }, 401)
  }
  await next()
})

app.get('/api/events', async (c) => {
  const store = await loadStore()
  return c.json({ events: active(store.events) })
})

app.post('/api/events/sync', async (c) => {
  const store = await loadStore()
  const body = await c.req.json<{ events?: BabyEvent[] }>()
  const incoming = body.events ?? []
  const map = new Map<string, BabyEvent>()
  for (const e of store.events) map.set(e.id, e)
  for (const e of incoming) {
    const existing = map.get(e.id)
    if (!existing || e.updatedAt > existing.updatedAt) {
      map.set(e.id, { ...e, synced: true })
    }
  }
  store.events = [...map.values()]
  await saveStore(store)
  return c.json({ ok: true, count: store.events.length })
})

app.post('/api/events', async (c) => {
  const store = await loadStore()
  const body = await c.req.json<Partial<BabyEvent> & { type: string }>()
  if (!body.type) return c.json({ error: 'type wajib' }, 400)

  const now = new Date().toISOString()
  const event: BabyEvent = {
    id: body.id ?? crypto.randomUUID(),
    type: body.type,
    timestamp: body.timestamp ?? now,
    updatedAt: now,
    deleted: false,
    synced: true,
    ml: body.ml,
    feedKind: body.feedKind,
    diaperKind: body.diaperKind,
    sleepEnd: body.sleepEnd,
    cryCause: body.cryCause,
    soothedHow: body.soothedHow,
    soothedOk: body.soothedOk,
    notes: body.notes,
    caregiver: body.caregiver ?? 'agent',
  }
  store.events.push(event)
  await saveStore(store)
  return c.json({ ok: true, event }, 201)
})

app.get('/api/summary/today', async (c) => {
  const store = await loadStore()
  const today = active(store.events).filter((e) => isToday(e.timestamp))
  const feeds = today.filter((e) => e.type === 'feed')
  const diapers = today.filter((e) => e.type === 'diaper')
  const cries = today.filter((e) => e.type === 'cry')
  return c.json({
    date: new Date().toISOString().slice(0, 10),
    totalMl: feeds.reduce((s, e) => s + (e.ml ?? 0), 0),
    feedCount: feeds.length,
    diaperCount: diapers.length,
    cryCount: cries.length,
    events: today.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  })
})

app.get('/api/next-feed', async (c) => {
  const store = await loadStore()
  return c.json({ next: estimateNextFeed(store.events) })
})

app.get('/api/tools', (c) => {
  return c.json({
    tools: [
      {
        name: 'log_feed',
        description: 'Catat susu/ASI bayi',
        method: 'POST',
        path: '/api/events',
        body: { type: 'feed', ml: 90, feedKind: 'formula' },
      },
      {
        name: 'log_diaper',
        description: 'Catat pipis/pup',
        method: 'POST',
        path: '/api/events',
        body: { type: 'diaper', diaperKind: 'wet' },
      },
      {
        name: 'log_cry',
        description: 'Catat tangis + penyebab',
        method: 'POST',
        path: '/api/events',
        body: { type: 'cry', cryCause: 'hungry', soothedHow: 'gendong' },
      },
      {
        name: 'get_today_summary',
        description: 'Ringkasan hari ini',
        method: 'GET',
        path: '/api/summary/today',
      },
      {
        name: 'when_is_next_feed',
        description: 'Estimasi waktu nen berikutnya',
        method: 'GET',
        path: '/api/next-feed',
      },
    ],
  })
})

const port = Number(process.env.PORT ?? 8787)

loadStore().then((store) => {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Nestly Agent API → http://localhost:${port}`)
    console.log(`Health           → http://localhost:${port}/api/health`)
    console.log(`API key ready    → ${store.apiKey.slice(0, 12)}…`)
  })
})
