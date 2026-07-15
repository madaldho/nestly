import type { BabyEvent, BabyProfile } from '@/types'
import { activeEvents, cryCauseLabel, eventTitle, feedKindLabel } from '@/lib/insights'

export function eventsToCsv(events: BabyEvent[]) {
  const rows = [
    [
      'id',
      'type',
      'timestamp',
      'title',
      'ml',
      'feed_kind',
      'diaper_kind',
      'sleep_end',
      'cry_cause',
      'cry_duration_min',
      'soothed_how',
      'soothed_ok',
      'weight_kg',
      'height_cm',
      'medicine_name',
      'medicine_dose',
      'notes',
      'caregiver',
    ].join(','),
  ]

  for (const e of activeEvents(events).sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const cells = [
      e.id,
      e.type,
      e.timestamp,
      eventTitle(e),
      e.ml ?? '',
      e.feedKind ? feedKindLabel[e.feedKind] : '',
      e.diaperKind ?? '',
      e.sleepEnd ?? '',
      e.cryCause ? cryCauseLabel[e.cryCause] : '',
      e.cryDurationMin ?? '',
      e.soothedHow ?? '',
      e.soothedOk === undefined ? '' : e.soothedOk ? 'ya' : 'tidak',
      e.weightKg ?? '',
      e.heightCm ?? '',
      e.medicineName ?? '',
      e.medicineDose ?? '',
      e.notes ?? '',
      e.caregiver ?? '',
    ].map(csvEscape)
    rows.push(cells.join(','))
  }

  return rows.join('\n')
}

function csvEscape(value: string | number) {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadCsv(events: BabyEvent[], profile: BabyProfile) {
  const blob = new Blob([eventsToCsv(events)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `nestly-${profile.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
