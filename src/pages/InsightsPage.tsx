import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { db } from '@/db'
import {
  aggregateSummaries,
  cryCauseLabel,
  estimateNextFeed,
  formatTime,
  summariesForDays,
  topCryCauseInEvents,
} from '@/lib/insights'
import { daysInRange, resolveDateRange } from '@/lib/date-range'
import { Card } from '@/components/ui/primitives'
import {
  DateRangeField,
  defaultDateRange,
  type DateRangeValue,
} from '@/components/features/DateRangeField'
import type { BabyEvent } from '@/types'

const NO_EVENTS: BabyEvent[] = []

export function InsightsPage() {
  const events = useLiveQuery(() => db.events.toArray(), []) ?? NO_EVENTS
  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('7d'))

  const { start, end } = useMemo(() => resolveDateRange(range), [range])
  const days = useMemo(() => daysInRange(start, end), [start, end])
  const daySummaries = useMemo(() => summariesForDays(events, days), [events, days])
  const period = useMemo(() => {
    const base = aggregateSummaries(daySummaries)
    return {
      ...base,
      topCryCause: topCryCauseInEvents(
        events.filter((e) => {
          const t = new Date(e.timestamp).getTime()
          return t >= start.getTime() && t <= end.getTime() && !e.deleted
        }),
      ),
      cryCount: events.filter((e) => {
        if (e.deleted || e.type !== 'cry') return false
        const t = new Date(e.timestamp).getTime()
        return t >= start.getTime() && t <= end.getTime()
      }).length,
    }
  }, [daySummaries, events, start, end])

  const next = useMemo(() => estimateNextFeed(events), [events])
  const maxMl = Math.max(1, ...daySummaries.map((d) => d.totalMl))
  const sleepHours = Math.floor(period.sleepMinutes / 60)
  const sleepMins = period.sleepMinutes % 60
  const singleDay = days.length === 1

  return (
    <div className="space-y-8">
      <section className="pt-1 text-center md:pt-2">
        <h2 className="text-display-lg text-ink">Ringkasan</h2>
        <p className="mt-2 text-caption text-ink-muted">
          Pilih periode untuk melihat pola susu, tidur, dan tangis.
        </p>
      </section>

      <section>
        <Card className="p-5">
          <DateRangeField value={range} onChange={setRange} />
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { label: 'Total susu', value: `${period.totalMl} ml` },
          { label: 'Feeds', value: `${period.feedCount}x` },
          { label: 'Popok', value: `${period.diaperCount}x` },
          {
            label: 'Tidur',
            value: period.sleepMinutes ? `${sleepHours}j ${sleepMins}m` : '—',
          },
        ].map((item) => (
          <Card key={item.label} className="px-5 py-4">
            <p className="text-caption text-ink-muted">{item.label}</p>
            <p className="mt-1 text-tagline text-ink">{item.value}</p>
          </Card>
        ))}
      </section>

      <section className="glass-dark px-5 py-12 text-center">
        <p className="text-caption text-ondark-muted">Estimasi nen berikutnya</p>
        <p className="mt-2 text-display-lg text-white">
          {next
            ? next.minsUntil <= 0
              ? 'Sekitar sekarang'
              : `~${formatTime(next.nextAt)}`
            : '—'}
        </p>
        <p className="mt-2 text-caption text-ondark-muted">
          {next
            ? `Dari interval feeding terakhir · rata-rata ${next.avgIntervalMin} menit`
            : 'Catat minimal 2x susu untuk prediksi'}
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="text-display-md text-ink">
            {singleDay ? 'Susu hari itu' : 'Susu per hari'}
          </h3>
          <span className="text-caption text-ink-muted">
            {days.length} hari · total ml
          </span>
        </div>
        <Card className="p-6">
          {daySummaries.every((d) => d.totalMl === 0) ? (
            <p className="py-8 text-center text-caption text-ink-muted">
              Belum ada catatan susu di periode ini.
            </p>
          ) : (
            <div className="flex h-40 items-end gap-1.5 overflow-x-auto md:gap-3">
              {daySummaries.map((d) => {
                const h = Math.max(6, Math.round((d.totalMl / maxMl) * 100))
                return (
                  <div
                    key={d.date}
                    className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-2"
                  >
                    <span className="text-fine font-semibold text-ink tabular-nums">
                      {d.totalMl || ''}
                    </span>
                    <div className="flex h-28 w-full items-end rounded-2xl bg-white/40">
                      <div
                        className="w-full rounded-2xl bg-accent transition-[height] duration-500"
                        style={{ height: d.totalMl ? `${h}%` : '4px' }}
                        title={`${d.totalMl} ml`}
                      />
                    </div>
                    <span className="text-fine text-ink-muted">
                      {format(new Date(d.date + 'T12:00:00'), 'd/M', {
                        locale: localeId,
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <h3 className="text-display-md text-ink">Tangis periode ini</h3>
        <Card className="p-6">
          <p className="text-[17px] text-ink">
            {period.cryCount === 0
              ? 'Belum ada catatan tangis di periode ini.'
              : `${period.cryCount}x · paling sering: ${
                  period.topCryCause ? cryCauseLabel[period.topCryCause] : '—'
                }`}
          </p>
          <p className="mt-3 text-caption leading-relaxed text-ink-muted">
            Geser periode ke 7–30 hari untuk melihat pola malam vs siang lebih jelas.
          </p>
        </Card>
      </section>
    </div>
  )
}
