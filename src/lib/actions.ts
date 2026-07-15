import { db, createId } from '@/db'
import type {
  BabyEvent,
  CryCause,
  DiaperKind,
  FeedKind,
} from '@/types'

async function baseMeta() {
  const settings = await db.settings.get('default')
  return {
    caregiver: settings?.caregiverName ?? 'Orang tua',
    synced: false,
    updatedAt: new Date().toISOString(),
  }
}

export async function logFeed(input: {
  ml?: number
  feedKind?: FeedKind
  durationMin?: number
  timestamp?: string
  notes?: string
}) {
  const meta = await baseMeta()
  const profile = await db.profile.get('default')
  const feedKind = input.feedKind ?? 'formula'
  const isBreast = feedKind !== 'formula'
  const event: BabyEvent = {
    id: createId(),
    type: 'feed',
    timestamp: input.timestamp ?? new Date().toISOString(),
    ml: isBreast ? input.ml : (input.ml ?? profile?.defaultFeedMl ?? 90),
    feedKind,
    durationMin: input.durationMin,
    notes: input.notes,
    ...meta,
  }
  await db.events.add(event)
  return event
}

export async function logDiaper(input: {
  diaperKind: DiaperKind
  timestamp?: string
  notes?: string
}) {
  const meta = await baseMeta()
  const event: BabyEvent = {
    id: createId(),
    type: 'diaper',
    timestamp: input.timestamp ?? new Date().toISOString(),
    diaperKind: input.diaperKind,
    notes: input.notes,
    ...meta,
  }
  await db.events.add(event)
  return event
}

export async function logSleep(input: {
  timestamp?: string
  sleepEnd?: string
  notes?: string
}) {
  const meta = await baseMeta()
  const event: BabyEvent = {
    id: createId(),
    type: 'sleep',
    timestamp: input.timestamp ?? new Date().toISOString(),
    sleepEnd: input.sleepEnd,
    notes: input.notes,
    ...meta,
  }
  await db.events.add(event)
  return event
}

export async function endSleep(eventId: string, sleepEnd?: string) {
  await db.events.update(eventId, {
    sleepEnd: sleepEnd ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    synced: false,
  })
}

export async function logCry(input: {
  cryCause: CryCause
  cryDurationMin?: number
  soothedHow?: string
  soothedOk?: boolean
  timestamp?: string
  notes?: string
}) {
  const meta = await baseMeta()
  const event: BabyEvent = {
    id: createId(),
    type: 'cry',
    timestamp: input.timestamp ?? new Date().toISOString(),
    cryCause: input.cryCause,
    cryDurationMin: input.cryDurationMin,
    soothedHow: input.soothedHow,
    soothedOk: input.soothedOk,
    notes: input.notes,
    ...meta,
  }
  await db.events.add(event)
  return event
}

export async function softDeleteEvent(id: string) {
  await db.events.update(id, {
    deleted: true,
    updatedAt: new Date().toISOString(),
    synced: false,
  })
}

export async function restoreEvent(id: string) {
  await db.events.update(id, {
    deleted: false,
    updatedAt: new Date().toISOString(),
    synced: false,
  })
}

export async function updateEvent(
  id: string,
  patch: Partial<Omit<BabyEvent, 'id' | 'type'>>,
) {
  await db.events.update(id, {
    ...patch,
    updatedAt: new Date().toISOString(),
    synced: false,
  })
}

/** ISO timestamp for “N minutes ago” (clamped ≥ 0). */
export function minutesAgoIso(mins: number) {
  return new Date(Date.now() - Math.max(0, mins) * 60_000).toISOString()
}

/**
 * Build ISO from a clock time "HH:mm".
 * If that time is later than now, treat it as yesterday
 * (e.g. logging 23:40 when it's 00:15).
 */
export function clockTimeToIso(hhmm: string, now = new Date()) {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return now.toISOString()
  }
  const t = new Date(now)
  t.setHours(h, m, 0, 0)
  if (t.getTime() > now.getTime() + 60_000) {
    t.setDate(t.getDate() - 1)
  }
  return t.toISOString()
}

export function formatMinsAgoLabel(mins: number) {
  if (mins <= 0) return 'baru saja'
  if (mins < 60) return `${mins} mnt lalu`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}j ${m}m lalu` : `${h} jam lalu`
}
