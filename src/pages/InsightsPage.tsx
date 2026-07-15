import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import {
  buildDaySummary,
  cryCauseLabel,
  estimateNextFeed,
  formatTime,
  last7DaySummaries,
} from '@/lib/insights'
import { Card } from '@/components/ui/primitives'
import type { BabyEvent } from '@/types'

const NO_EVENTS: BabyEvent[] = []

export function InsightsPage() {
  const events = useLiveQuery(() => db.events.toArray(), []) ?? NO_EVENTS
  const today = useMemo(() => buildDaySummary(events), [events])
  const week = useMemo(() => last7DaySummaries(events), [events])
  const next = useMemo(() => estimateNextFeed(events), [events])
  const maxMl = Math.max(1, ...week.map((d) => d.totalMl))

  const sleepHours = Math.floor(today.sleepMinutes / 60)
  const sleepMins = today.sleepMinutes % 60

  return (
    <div className="space-y-8">
      <section className="pt-1 text-center md:pt-2">
        <h2 className="text-display-lg text-ink">Ringkasan</h2>
        <p className="mt-2 text-caption text-ink-muted">Pola harian dan mingguan.</p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { label: 'Total susu', value: `${today.totalMl} ml` },
          { label: 'Feeds', value: `${today.feedCount}x` },
          { label: 'Popok', value: `${today.diaperCount}x` },
          {
            label: 'Tidur',
            value: today.sleepMinutes ? `${sleepHours}j ${sleepMins}m` : '—',
          },
        ].map((item) => (
          <Card key={item.label} className="px-5 py-4">
            <p className="text-caption text-ink-muted">{item.label}</p>
            <p className="mt-1 text-tagline text-ink">{item.value}</p>
          </Card>
        ))}
      </section>

      {/* Dark glass — next feed estimate */}
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
            ? `Dihitung dari interval 8 feeding terakhir · rata-rata ${next.avgIntervalMin} menit`
            : 'Catat minimal 2x susu untuk prediksi'}
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="text-display-md text-ink">Susu 7 hari</h3>
          <span className="text-caption text-ink-muted">total ml per hari</span>
        </div>
        <Card className="p-6">
          <div className="flex h-40 items-end gap-2 md:gap-4">
            {[...week].reverse().map((d) => {
              const h = Math.max(6, Math.round((d.totalMl / maxMl) * 100))
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end rounded-2xl bg-white/40">
                    <div
                      className="w-full rounded-2xl bg-accent transition-[height] duration-500"
                      style={{ height: `${h}%` }}
                      title={`${d.totalMl} ml`}
                    />
                  </div>
                  <span className="text-fine text-ink-muted">{d.date.slice(8)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <h3 className="text-display-md text-ink">Tangis hari ini</h3>
        <Card className="p-6">
          <p className="text-[17px] text-ink">
            {today.cryCount === 0
              ? 'Belum ada catatan tangis.'
              : `${today.cryCount}x hari ini · paling sering: ${
                  today.topCryCause ? cryCauseLabel[today.topCryCause] : '—'
                }`}
          </p>
          <p className="mt-3 text-caption leading-relaxed text-ink-muted">
            Catat penyebab dan cara meredakan setiap kali. Setelah beberapa hari, pola
            tangisan (terutama malam hari) akan terlihat lebih jelas.
          </p>
        </Card>
      </section>
    </div>
  )
}
