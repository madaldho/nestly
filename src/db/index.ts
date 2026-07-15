import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, BabyEvent, BabyProfile } from '@/types'

function createId() {
  return crypto.randomUUID()
}

function createApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return `nst_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

const db = new Dexie('NestlyDB') as Dexie & {
  events: EntityTable<BabyEvent, 'id'>
  profile: EntityTable<BabyProfile, 'id'>
  settings: EntityTable<AppSettings, 'id'>
}

db.version(1).stores({
  events: 'id, type, timestamp, updatedAt, synced, deleted',
  profile: 'id',
  settings: 'id',
})

export async function ensureDefaults() {
  const profile = await db.profile.get('default')
  if (!profile) {
    await db.profile.put({
      id: 'default',
      name: 'Si Kecil',
      birthDate: new Date().toISOString().slice(0, 10),
      defaultFeedMl: 90,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      updatedAt: new Date().toISOString(),
    })
  }

  const settings = await db.settings.get('default')
  if (!settings) {
    await db.settings.put({
      id: 'default',
      apiKey: createApiKey(),
      agentApiUrl: 'http://localhost:8787',
      lastSyncAt: null,
      caregiverName: 'Orang tua',
    })
  }
}

export { db, createId, createApiKey }
