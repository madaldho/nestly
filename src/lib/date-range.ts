import {
  endOfDay,
  format,
  startOfDay,
  subDays,
  parseISO,
  isWithinInterval,
  eachDayOfInterval,
} from 'date-fns'
import { id as localeId } from 'date-fns/locale'

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '14d'
  | '30d'
  | 'custom'

export type DateRangeValue = {
  preset: DateRangePreset
  /** yyyy-MM-dd when custom */
  from: string
  /** yyyy-MM-dd when custom */
  to: string
}

export const DATE_RANGE_PRESETS: {
  id: DateRangePreset
  label: string
}[] = [
  { id: 'today', label: 'Hari ini' },
  { id: 'yesterday', label: 'Kemarin' },
  { id: '7d', label: '7 hari' },
  { id: '14d', label: '14 hari' },
  { id: '30d', label: '30 hari' },
]

export function todayIsoDate(now = new Date()) {
  return format(now, 'yyyy-MM-dd')
}

export function defaultDateRange(preset: DateRangePreset = '7d'): DateRangeValue {
  const today = todayIsoDate()
  return { preset, from: today, to: today }
}

export function resolveDateRange(
  value: DateRangeValue,
  now = new Date(),
): { start: Date; end: Date } {
  const end = endOfDay(now)
  switch (value.preset) {
    case 'today':
      return { start: startOfDay(now), end }
    case 'yesterday': {
      const y = subDays(now, 1)
      return { start: startOfDay(y), end: endOfDay(y) }
    }
    case '7d':
      return { start: startOfDay(subDays(now, 6)), end }
    case '14d':
      return { start: startOfDay(subDays(now, 13)), end }
    case '30d':
      return { start: startOfDay(subDays(now, 29)), end }
    case 'custom': {
      const from = value.from || todayIsoDate(now)
      const to = value.to || from
      const a = startOfDay(parseISO(from))
      const b = endOfDay(parseISO(to))
      return a <= b ? { start: a, end: b } : { start: b, end: endOfDay(parseISO(from)) }
    }
  }
}

export function dateRangeLabel(value: DateRangeValue, now = new Date()) {
  const { start, end } = resolveDateRange(value, now)
  if (value.preset === 'today') return 'Hari ini'
  if (value.preset === 'yesterday') return 'Kemarin'
  const same =
    format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
  if (same) return format(start, 'd MMM yyyy', { locale: localeId })
  return `${format(start, 'd MMM', { locale: localeId })} – ${format(end, 'd MMM yyyy', { locale: localeId })}`
}

export function isIsoInRange(iso: string, start: Date, end: Date) {
  const t = parseISO(iso)
  return isWithinInterval(t, { start, end })
}

export function daysInRange(start: Date, end: Date) {
  return eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) })
}
