import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { db } from '@/db'
import { eventsInRange } from '@/lib/insights'
import { resolveDateRange } from '@/lib/date-range'
import { EventList } from '@/components/features/EventList'
import {
  DateRangeField,
  defaultDateRange,
  type DateRangeValue,
} from '@/components/features/DateRangeField'
import { Card } from '@/components/ui/primitives'
import type { BabyEvent } from '@/types'

const NO_EVENTS: BabyEvent[] = []

export function TimelinePage() {
  const events =
    useLiveQuery(() => db.events.orderBy('timestamp').reverse().toArray(), []) ??
    NO_EVENTS
  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('7d'))

  const { start, end } = useMemo(() => resolveDateRange(range), [range])
  const filtered = useMemo(
    () => eventsInRange(events, start, end),
    [events, start, end],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, BabyEvent[]>()
    for (const e of filtered) {
      const key = format(parseISO(e.timestamp), 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div className="space-y-8">
      <section className="pt-1 text-center md:pt-2">
        <h2 className="text-display-lg text-ink">Riwayat</h2>
        <p className="mt-2 text-caption text-ink-muted">
          Pilih dari kapan sampai kapan — data tetap di perangkat ini.
        </p>
      </section>

      <section>
        <Card className="p-5">
          <DateRangeField value={range} onChange={setRange} label="Periode" />
        </Card>
      </section>

      {grouped.length === 0 ? (
        <EventList
          events={[]}
          empty="Tidak ada catatan di periode ini. Coba perluas tanggal."
          showDelete
        />
      ) : (
        <>
          <p className="px-0.5 text-caption text-ink-muted">
            {filtered.length} catatan
          </p>
          {grouped.map(([day, items]) => (
            <section key={day} className="space-y-3">
              <h3 className="px-0.5 text-caption font-semibold text-ink-muted">
                {format(parseISO(day), 'EEEE, d MMMM yyyy', { locale: localeId })}
              </h3>
              <EventList events={items} empty="" showDelete />
            </section>
          ))}
        </>
      )}
    </div>
  )
}
