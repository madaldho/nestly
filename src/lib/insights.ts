import {
  differenceInMinutes,
  format,
  isToday,
  parseISO,
  startOfDay,
  subDays,
} from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import type { BabyEvent, CryCause, DaySummary } from '@/types'

export function formatTime(iso: string) {
  return format(parseISO(iso), 'HH:mm', { locale: localeId })
}

export function formatDayLabel(iso: string) {
  const d = parseISO(iso)
  if (isToday(d)) return 'Hari ini'
  return format(d, 'EEEE, d MMM', { locale: localeId })
}

export function formatRelativeMinutes(mins: number) {
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins}m lalu`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}j ${m}m lalu` : `${h}j lalu`
}

export function ageLabel(birthDate: string) {
  const birth = parseISO(birthDate)
  const now = new Date()
  const totalDays = Math.max(0, differenceInMinutes(now, birth) / (60 * 24))
  const months = Math.floor(totalDays / 30.437)
  const days = Math.floor(totalDays % 30.437)
  if (months <= 0) return `${Math.floor(totalDays)} hari`
  if (days === 0) return `${months} bln`
  return `${months} bln ${days} hr`
}

export function activeEvents(events: BabyEvent[]) {
  return events.filter((e) => !e.deleted)
}

export function todayEvents(events: BabyEvent[]) {
  return activeEvents(events)
    .filter((e) => isToday(parseISO(e.timestamp)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function lastFeed(events: BabyEvent[]) {
  return activeEvents(events)
    .filter((e) => e.type === 'feed')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
}

export function estimateNextFeed(events: BabyEvent[]) {
  const feeds = activeEvents(events)
    .filter((e) => e.type === 'feed')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8)

  if (feeds.length === 0) return null

  const last = feeds[0]
  const intervals: number[] = []
  for (let i = 0; i < feeds.length - 1; i++) {
    const gap = differenceInMinutes(parseISO(feeds[i].timestamp), parseISO(feeds[i + 1].timestamp))
    if (gap > 30 && gap < 360) intervals.push(gap)
  }

  const avg = intervals.length
    ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    : 180

  const nextAt = new Date(parseISO(last.timestamp).getTime() + avg * 60_000)
  const minsUntil = differenceInMinutes(nextAt, new Date())

  return {
    nextAt: nextAt.toISOString(),
    avgIntervalMin: avg,
    minsUntil,
    last,
  }
}

export function buildDaySummary(events: BabyEvent[], date = new Date()): DaySummary {
  const dayStart = startOfDay(date)
  const dayIso = format(dayStart, 'yyyy-MM-dd')
  const dayItems = activeEvents(events).filter((e) => {
    const t = parseISO(e.timestamp)
    return format(t, 'yyyy-MM-dd') === dayIso
  })

  const cryCauses = dayItems
    .filter((e) => e.type === 'cry' && e.cryCause)
    .map((e) => e.cryCause!)

  const causeCount = cryCauses.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, {})

  const topCryCause =
    (Object.entries(causeCount).sort((a, b) => b[1] - a[1])[0]?.[0] as CryCause | undefined) ??
    null

  let sleepMinutes = 0
  for (const e of dayItems.filter((x) => x.type === 'sleep')) {
    if (e.sleepEnd) {
      sleepMinutes += Math.max(0, differenceInMinutes(parseISO(e.sleepEnd), parseISO(e.timestamp)))
    }
  }

  return {
    date: dayIso,
    totalMl: dayItems.filter((e) => e.type === 'feed').reduce((s, e) => s + (e.ml ?? 0), 0),
    feedCount: dayItems.filter((e) => e.type === 'feed').length,
    diaperCount: dayItems.filter((e) => e.type === 'diaper').length,
    dirtyCount: dayItems.filter(
      (e) => e.type === 'diaper' && (e.diaperKind === 'dirty' || e.diaperKind === 'both'),
    ).length,
    sleepMinutes,
    cryCount: dayItems.filter((e) => e.type === 'cry').length,
    topCryCause,
  }
}

export function last7DaySummaries(events: BabyEvent[]) {
  return Array.from({ length: 7 }, (_, i) => buildDaySummary(events, subDays(new Date(), i)))
}

export function eventTitle(event: BabyEvent) {
  switch (event.type) {
    case 'feed':
      return event.ml
        ? `Susu ${event.ml} ml`
        : `ASI ${event.durationMin ?? 0} mnt`
    case 'diaper':
      return event.diaperKind === 'wet'
        ? 'Pipis'
        : event.diaperKind === 'dirty'
          ? 'Pup'
          : 'Pipis + Pup'
    case 'sleep':
      return 'Tidur'
    case 'cry':
      return 'Tangis'
    case 'growth':
      return 'Pertumbuhan'
    case 'medicine':
      return event.medicineName ?? 'Obat'
  }
}

export const cryCauseLabel: Record<CryCause, string> = {
  hungry: 'Lapar',
  diaper: 'Popok',
  gas: 'Kembung',
  sleepy: 'Ngantuk',
  overstim: 'Overstim',
  unknown: 'Tidak jelas',
}

export const feedKindLabel = {
  formula: 'Formula',
  breast_left: 'ASI kiri',
  breast_right: 'ASI kanan',
  breast_both: 'ASI keduanya',
} as const
