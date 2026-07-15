import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { db } from '@/db'
import { activeEvents } from '@/lib/insights'
import { EventList } from '@/components/features/EventList'
import type { BabyEvent } from '@/types'

const NO_EVENTS: BabyEvent[] = []

export function TimelinePage() {
  const events =
    useLiveQuery(() => db.events.orderBy('timestamp').reverse().toArray(), []) ?? NO_EVENTS
  const grouped = useMemo(() => {
    const map = new Map<string, typeof events>()
    for (const e of activeEvents(events)) {
      const key = format(parseISO(e.timestamp), 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [events])

  return (
    <div className="space-y-8">
      <section className="pt-1 text-center md:pt-2">
        <h2 className="text-display-lg text-ink">Riwayat</h2>
        <p className="mt-2 text-caption text-ink-muted">
          Semua catatan tersimpan lokal di perangkat ini.
        </p>
      </section>

      {grouped.length === 0 ? (
        <EventList events={[]} empty="Belum ada aktivitas. Mulai dari Beranda." showDelete />
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="space-y-3">
            <h3 className="px-0.5 text-caption font-semibold text-ink-muted">
              {format(parseISO(day), 'EEEE, d MMMM yyyy', { locale: localeId })}
            </h3>
            <EventList events={items} empty="" showDelete />
          </section>
        ))
      )}
    </div>
  )
}
