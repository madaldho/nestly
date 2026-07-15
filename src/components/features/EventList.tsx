import { differenceInMinutes, parseISO } from 'date-fns'
import {
  Baby,
  Drop,
  MoonStars,
  Pill,
  Ruler,
  SmileySad,
  Trash,
} from '@phosphor-icons/react'
import type { BabyEvent } from '@/types'
import {
  cryCauseLabel,
  eventTitle,
  feedKindLabel,
  formatRelativeMinutes,
  formatTime,
} from '@/lib/insights'
import { softDeleteEvent } from '@/lib/actions'
import { Card } from '@/components/ui/primitives'

const typeIcon = {
  feed: Baby,
  diaper: Drop,
  sleep: MoonStars,
  cry: SmileySad,
  growth: Ruler,
  medicine: Pill,
} as const

function subtitle(event: BabyEvent) {
  if (event.type === 'feed' && event.feedKind) return feedKindLabel[event.feedKind]
  if (event.type === 'cry' && event.cryCause) return cryCauseLabel[event.cryCause]
  if (event.type === 'sleep' && event.sleepEnd) {
    const mins = differenceInMinutes(parseISO(event.sleepEnd), parseISO(event.timestamp))
    return `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)}j ` : ''}${mins % 60}m`
  }
  if (event.type === 'sleep' && !event.sleepEnd) return 'Sedang tidur'
  if (event.notes) return event.notes
  return event.caregiver ?? ''
}

export function EventRow({
  event,
  showDelete = false,
}: {
  event: BabyEvent
  showDelete?: boolean
}) {
  const Icon = typeIcon[event.type]
  const mins = differenceInMinutes(new Date(), parseISO(event.timestamp))

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
        <Icon size={20} weight="regular" className="text-ink" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-semibold text-ink">{eventTitle(event)}</p>
          <span className="shrink-0 text-caption text-ink-muted">
            {formatTime(event.timestamp)}
          </span>
        </div>
        <p className="truncate text-caption text-ink-muted">
          {subtitle(event)}
          <span className="mx-1.5">·</span>
          {formatRelativeMinutes(Math.max(0, mins))}
        </p>
      </div>
      {showDelete ? (
        <button
          type="button"
          aria-label="Hapus catatan"
          onClick={() => softDeleteEvent(event.id)}
          className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-ink"
        >
          <Trash size={18} weight="regular" />
        </button>
      ) : null}
    </div>
  )
}

export function EventList({
  events,
  empty,
  showDelete,
}: {
  events: BabyEvent[]
  empty: string
  showDelete?: boolean
}) {
  if (events.length === 0) {
    return (
      <Card>
        <div className="px-6 py-12 text-center">
          <p className="text-tagline text-ink">Belum ada catatan</p>
          <p className="mt-2 text-caption text-ink-muted">{empty}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="divide-y divide-divider overflow-hidden">
      {events.map((event) => (
        <EventRow key={event.id} event={event} showDelete={showDelete} />
      ))}
    </Card>
  )
}
