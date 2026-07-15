/** Shared “when did this happen?” helpers for Nestly logging. */

export type WhenMode = 'preset' | 'custom'

export type WhenValue = {
  mode: WhenMode
  /** Preset minutes ago (0 = now). Ignored when mode is custom. */
  minsAgo: number
  /** Clock "HH:mm" when mode is custom. */
  clock: string
}

export const WHEN_PRESETS = [
  { mins: 0, label: 'Sekarang' },
  { mins: 15, label: '15 mnt lalu' },
  { mins: 30, label: '30 mnt lalu' },
  { mins: 60, label: '1 jam lalu' },
] as const

export function nowClockValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function defaultWhenValue(): WhenValue {
  return { mode: 'preset', minsAgo: 0, clock: nowClockValue() }
}

/** ISO for N minutes ago (clamped ≥ 0). */
export function minutesAgoIso(mins: number, now = new Date()) {
  return new Date(now.getTime() - Math.max(0, mins) * 60_000).toISOString()
}

/**
 * ISO from clock "HH:mm".
 * If that time is later than now, treat as yesterday
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

/**
 * Resolve WhenValue → ISO timestamp.
 * Returns `undefined` when “now” (preset 0) so callers can omit and use server/default now.
 */
export function whenToIso(
  value: WhenValue,
  opts?: { force?: boolean; now?: Date },
): string | undefined {
  const now = opts?.now ?? new Date()
  if (value.mode === 'custom') {
    return clockTimeToIso(value.clock, now)
  }
  if (value.minsAgo <= 0) {
    return opts?.force ? now.toISOString() : undefined
  }
  return minutesAgoIso(value.minsAgo, now)
}

export function whenSummary(value: WhenValue, now = new Date()) {
  if (value.mode === 'custom') {
    const iso = clockTimeToIso(value.clock, now)
    const mins = Math.max(
      0,
      Math.round((now.getTime() - new Date(iso).getTime()) / 60_000),
    )
    return `Jam ${value.clock.replace(':', '.')} · ${formatMinsAgoLabel(mins)}`
  }
  const preset = WHEN_PRESETS.find((p) => p.mins === value.minsAgo)
  return preset?.label ?? formatMinsAgoLabel(value.minsAgo)
}
