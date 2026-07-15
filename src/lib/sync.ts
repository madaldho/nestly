import type { BabyEvent } from '@/types'
import { db } from '@/db'

type SyncPayload = {
  events: BabyEvent[]
  lastSyncAt: string | null
}

export async function pullAndMerge(apiUrl: string, apiKey: string) {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/events`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`Gagal pull: ${res.status}`)
  }
  const remote = (await res.json()) as { events: BabyEvent[] }
  const local = await db.events.toArray()
  const map = new Map<string, BabyEvent>()

  for (const e of local) map.set(e.id, e)
  for (const e of remote.events) {
    const existing = map.get(e.id)
    if (!existing || e.updatedAt > existing.updatedAt) {
      map.set(e.id, { ...e, synced: true })
    }
  }

  await db.events.bulkPut([...map.values()])
  return map.size
}

export async function pushLocal(apiUrl: string, apiKey: string) {
  const events = await db.events.toArray()
  const payload: SyncPayload = {
    events,
    lastSyncAt: new Date().toISOString(),
  }
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/events/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Gagal push: ${res.status}`)
  }
  await db.events.toCollection().modify({ synced: true })
  await db.settings.update('default', { lastSyncAt: new Date().toISOString() })
  return events.length
}

export async function fullSync(apiUrl: string, apiKey: string) {
  await pushLocal(apiUrl, apiKey)
  await pullAndMerge(apiUrl, apiKey)
}
