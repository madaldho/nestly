import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { differenceInMinutes, parseISO } from 'date-fns'
import { Baby, Drop, MoonStars, SmileySad, Stop, Warning } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { db } from '@/db'
import { endSleep, minutesAgoIso, restoreEvent } from '@/lib/actions'
import {
  ageLabel,
  buildDaySummary,
  estimateNextFeed,
  formatRelativeMinutes,
  formatTime,
  lastFeed,
  todayEvents,
} from '@/lib/insights'
import { Card, Toast } from '@/components/ui/primitives'
import { EventList } from '@/components/features/EventList'
import { QuickLogSheet } from '@/components/features/QuickLogSheet'
import {
  OnboardingSetup,
  needsOnboarding,
} from '@/components/features/OnboardingSetup'
import type { BabyEvent, QuickAction } from '@/types'

const NO_EVENTS: BabyEvent[] = []

const actions: {
  id: QuickAction
  label: string
  hint: string
  Icon: typeof Baby
}[] = [
  { id: 'feed', label: 'Susu', hint: 'ml / menit ASI', Icon: Baby },
  { id: 'diaper', label: 'Popok', hint: 'pipis / pup', Icon: Drop },
  { id: 'sleep', label: 'Tidur', hint: 'mulai / bangun', Icon: MoonStars },
  { id: 'cry', label: 'Tangis', hint: 'penyebab cepat', Icon: SmileySad },
]

function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} mnt`
  return m ? `${h}j ${m}m` : `${h}j`
}

export function HomePage() {
  const profile = useLiveQuery(() => db.profile.get('default'))
  const events =
    useLiveQuery(() => db.events.orderBy('timestamp').reverse().toArray(), []) ??
    NO_EVENTS
  const openSleep = useLiveQuery(async () => {
    const sleeps = await db.events.where('type').equals('sleep').toArray()
    return (
      sleeps
        .filter((e) => !e.deleted && !e.sleepEnd)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
    )
  })
  const [action, setAction] = useState<QuickAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const undoTimer = useRef<number>(0)

  useEffect(() => {
    if (needsOnboarding()) setSetupOpen(true)
  }, [])

  const today = useMemo(() => todayEvents(events), [events])
  const summary = useMemo(() => buildDaySummary(events), [events])
  const feed = useMemo(() => lastFeed(events), [events])
  const next = useMemo(() => estimateNextFeed(events), [events])

  function showToast(msg: string) {
    setToast(msg)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  function handleDeleted(event: BabyEvent) {
    setToast(`Dihapus · ketuk untuk batalkan`)
    window.clearTimeout(undoTimer.current)
    const id = event.id
    const handler = () => {
      void restoreEvent(id).then(() => showToast('Catatan dikembalikan'))
      window.removeEventListener('nestly-undo-delete', handler)
    }
    window.addEventListener('nestly-undo-delete', handler, { once: true })
    undoTimer.current = window.setTimeout(() => {
      setToast(null)
      window.removeEventListener('nestly-undo-delete', handler)
    }, 4500)
  }

  const feedAgo = feed
    ? formatRelativeMinutes(
        Math.max(0, differenceInMinutes(new Date(), parseISO(feed.timestamp))),
      )
    : null

  return (
    <div className="space-y-8">
      <Toast
        message={toast}
        onClick={
          toast?.includes('batalkan')
            ? () => window.dispatchEvent(new Event('nestly-undo-delete'))
            : undefined
        }
      />

      <OnboardingSetup open={setupOpen} onDone={() => setSetupOpen(false)} />

      <section className="pt-1 text-center md:pt-2">
        <p className="text-caption text-ink-muted">Sedang dirawat</p>
        <h2 className="mt-1 text-display-lg text-ink">
          {profile?.name ?? 'Si Kecil'}
        </h2>
        <p className="mt-2 text-[17px] text-ink-muted">
          {profile ? ageLabel(profile.birthDate) : '…'}
          <span className="mx-2">·</span>
          {summary.totalMl} ml hari ini
        </p>
        <p className="mt-1 text-caption text-ink-muted">
          {feed
            ? `Susu terakhir ${formatTime(feed.timestamp)} (${feedAgo})`
            : 'Belum ada susu hari ini'}
        </p>
      </section>

      <SleepBanner
        openSleep={openSleep ?? null}
        onEnded={() => showToast('Tidur diakhiri')}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {actions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setAction(item.id)}
            className="card press min-h-[7.5rem] p-5 text-left"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
              <item.Icon size={24} weight="regular" className="text-accent" />
            </span>
            <p className="mt-3 text-tagline text-ink">{item.label}</p>
            <p className="mt-0.5 text-caption text-ink-muted">{item.hint}</p>
          </button>
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
            ? `Rata-rata interval ${next.avgIntervalMin} menit${
                next.minsUntil > 0 ? ` · ±${next.minsUntil} menit lagi` : ''
              }`
            : 'Catat minimal 2x susu untuk prediksi'}
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="text-display-md text-ink">Hari ini</h3>
          <span className="text-caption text-ink-muted">{today.length} catatan</span>
        </div>
        <EventList
          events={today.slice(0, 8)}
          empty="Tap Susu, Popok, Tidur, atau Tangis untuk mulai."
          showDelete
          onDeleted={handleDeleted}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[
          { label: 'Feeds', value: `${summary.feedCount}x` },
          { label: 'Popok', value: `${summary.diaperCount}x` },
          {
            label: 'Tidur',
            value: summary.sleepMinutes
              ? `${Math.floor(summary.sleepMinutes / 60)}j ${summary.sleepMinutes % 60}m`
              : '—',
          },
          { label: 'Tangis', value: `${summary.cryCount}x` },
        ].map((item) => (
          <Card key={item.label} className="px-5 py-4">
            <p className="text-caption text-ink-muted">{item.label}</p>
            <p className="mt-1 text-tagline text-ink">{item.value}</p>
          </Card>
        ))}
      </section>

      <QuickLogSheet
        action={action}
        onClose={() => setAction(null)}
        onSaved={showToast}
      />
    </div>
  )
}

function SleepBanner({
  openSleep,
  onEnded,
}: {
  openSleep: BabyEvent | null
  onEnded: () => void
}) {
  const now = useTick(!!openSleep)
  const [ending, setEnding] = useState(false)

  if (!openSleep) return null

  const mins = Math.max(
    0,
    differenceInMinutes(new Date(now), parseISO(openSleep.timestamp)),
  )
  const stale = mins >= 180

  async function handleEnd(adjustedMinsAgo?: number) {
    if (!openSleep || ending) return
    setEnding(true)
    try {
      const endAt =
        adjustedMinsAgo != null
          ? minutesAgoIso(adjustedMinsAgo)
          : new Date().toISOString()
      await endSleep(openSleep.id, endAt)
      onEnded()
    } finally {
      setEnding(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      className="card space-y-3 px-5 py-4"
    >
      <div className="flex items-center gap-4">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10">
          <MoonStars size={22} weight="fill" className="text-accent" />
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-canvas bg-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Sedang tidur</p>
          <p className="text-caption text-ink-muted">
            Mulai {formatTime(openSleep.timestamp)} · {formatDuration(mins)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleEnd()}
          disabled={ending}
          className="press flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-caption font-semibold text-white disabled:opacity-40"
        >
          <Stop size={16} weight="fill" />
          Selesai
        </button>
      </div>

      {stale ? (
        <div className="flex items-start gap-2 rounded-2xl bg-[#cc3300]/8 px-3 py-2.5 text-caption text-[#a32a00]">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Sudah {formatDuration(mins)} — lupa akhiri?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={ending}
                onClick={() => void handleEnd(0)}
                className="press rounded-full bg-white/80 px-3 py-1.5 font-semibold text-ink"
              >
                Bangun sekarang
              </button>
              <button
                type="button"
                disabled={ending}
                onClick={() => void handleEnd(60)}
                className="press rounded-full bg-white/80 px-3 py-1.5 font-semibold text-ink"
              >
                Bangun 1 jam lalu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </motion.section>
  )
}
