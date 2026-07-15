import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus } from '@phosphor-icons/react'
import {
  Field,
  NoteField,
  OptionChip,
  PillButton,
  Sheet,
} from '@/components/ui/primitives'
import {
  endSleep,
  logCry,
  logDiaper,
  logFeed,
  logSleep,
  minutesAgoIso,
} from '@/lib/actions'
import type { CryCause, DiaperKind, FeedKind, QuickAction } from '@/types'
import { db } from '@/db'
import { useLiveQuery } from 'dexie-react-hooks'

const LAST_FEED_KIND_KEY = 'nestly.lastFeedKind'

function isBreast(kind: FeedKind) {
  return kind !== 'formula'
}

function readLastFeedKind(): FeedKind {
  try {
    const v = localStorage.getItem(LAST_FEED_KIND_KEY)
    if (
      v === 'formula' ||
      v === 'breast_left' ||
      v === 'breast_right' ||
      v === 'breast_both'
    ) {
      return v
    }
  } catch {
    /* ignore */
  }
  return 'formula'
}

const WHEN_OPTIONS = [
  { mins: 0, label: 'Sekarang' },
  { mins: 15, label: '15 mnt lalu' },
  { mins: 30, label: '30 mnt lalu' },
  { mins: 60, label: '1 jam lalu' },
] as const

export function QuickLogSheet({
  action,
  onClose,
  onSaved,
}: {
  action: QuickAction | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const profile = useLiveQuery(() => db.profile.get('default'))
  const openSleep = useLiveQuery(async () => {
    const sleeps = await db.events.where('type').equals('sleep').toArray()
    return (
      sleeps
        .filter((e) => !e.deleted && !e.sleepEnd)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
    )
  })

  const [ml, setMl] = useState(90)
  const [durationMin, setDurationMin] = useState(15)
  const [feedKind, setFeedKind] = useState<FeedKind>('formula')
  const [diaperKind, setDiaperKind] = useState<DiaperKind>('wet')
  const [cryCause, setCryCause] = useState<CryCause>('hungry')
  const [cryDetail, setCryDetail] = useState(false)
  const [soothedHow, setSoothedHow] = useState('')
  const [soothedOk, setSoothedOk] = useState<boolean | undefined>(undefined)
  const [notes, setNotes] = useState('')
  const [minsAgo, setMinsAgo] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!action) return
    if (profile?.defaultFeedMl) setMl(profile.defaultFeedMl)
    setNotes('')
    setSoothedHow('')
    setSoothedOk(undefined)
    setCryDetail(false)
    setDiaperKind('wet')
    setCryCause('hungry')
    setFeedKind(readLastFeedKind())
    setDurationMin(15)
    setMinsAgo(0)
  }, [action, profile?.defaultFeedMl])

  const timestamp = useMemo(
    () => (minsAgo > 0 ? minutesAgoIso(minsAgo) : undefined),
    [minsAgo],
  )

  async function save() {
    if (!action || saving) return
    setSaving(true)
    try {
      if (action === 'feed') {
        try {
          localStorage.setItem(LAST_FEED_KIND_KEY, feedKind)
        } catch {
          /* ignore */
        }
        if (isBreast(feedKind)) {
          await logFeed({
            feedKind,
            durationMin,
            ml: undefined,
            timestamp,
            notes: notes || undefined,
          })
          onSaved(`ASI ${durationMin} mnt tersimpan`)
        } else {
          await logFeed({
            ml,
            feedKind,
            timestamp,
            notes: notes || undefined,
          })
          onSaved(`Susu ${ml} ml tersimpan`)
        }
      } else if (action === 'diaper') {
        await logDiaper({ diaperKind, timestamp, notes: notes || undefined })
        onSaved('Popok tersimpan')
      } else if (action === 'sleep') {
        if (openSleep) {
          await endSleep(openSleep.id, timestamp ?? new Date().toISOString())
          onSaved('Tidur diakhiri')
        } else {
          await logSleep({ timestamp, notes: notes || undefined })
          onSaved('Tidur dimulai')
        }
      } else if (action === 'cry') {
        await logCry({
          cryCause,
          soothedHow: cryDetail ? soothedHow || undefined : undefined,
          soothedOk: cryDetail ? soothedOk : undefined,
          timestamp,
          notes: notes || undefined,
        })
        onSaved('Tangis tercatat')
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const title =
    action === 'feed'
      ? 'Catat susu'
      : action === 'diaper'
        ? 'Catat popok'
        : action === 'sleep'
          ? openSleep
            ? 'Akhiri tidur'
            : 'Mulai tidur'
          : action === 'cry'
            ? 'Lacak tangis'
            : ''

  return (
    <Sheet open={!!action} onClose={onClose} title={title}>
      <div className="space-y-6">
        {action === 'feed' ? (
          <>
            <Field label="Jenis">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['formula', 'Formula'],
                    ['breast_left', 'ASI kiri'],
                    ['breast_right', 'ASI kanan'],
                    ['breast_both', 'ASI keduanya'],
                  ] as const
                ).map(([value, label]) => (
                  <OptionChip
                    key={value}
                    selected={feedKind === value}
                    onClick={() => setFeedKind(value)}
                    className="w-full"
                  >
                    {label}
                  </OptionChip>
                ))}
              </div>
            </Field>

            {isBreast(feedKind) ? (
              <div className="flex items-center justify-center gap-6 py-2">
                <button
                  type="button"
                  aria-label="Kurangi 5 menit"
                  onClick={() => setDurationMin((v) => Math.max(1, v - 5))}
                  className="press glass flex h-11 w-11 items-center justify-center rounded-full text-ink"
                >
                  <Minus size={18} />
                </button>
                <div className="min-w-24 text-center">
                  <p className="text-display-lg text-ink">{durationMin}</p>
                  <p className="text-caption text-ink-muted">menit</p>
                </div>
                <button
                  type="button"
                  aria-label="Tambah 5 menit"
                  onClick={() => setDurationMin((v) => Math.min(90, v + 5))}
                  className="press glass flex h-11 w-11 items-center justify-center rounded-full text-ink"
                >
                  <Plus size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-6 py-2">
                <button
                  type="button"
                  aria-label="Kurangi 10 ml"
                  onClick={() => setMl((v) => Math.max(10, v - 10))}
                  className="press glass flex h-11 w-11 items-center justify-center rounded-full text-ink"
                >
                  <Minus size={18} />
                </button>
                <div className="min-w-24 text-center">
                  <p className="text-display-lg text-ink">{ml}</p>
                  <p className="text-caption text-ink-muted">ml</p>
                </div>
                <button
                  type="button"
                  aria-label="Tambah 10 ml"
                  onClick={() => setMl((v) => Math.min(400, v + 10))}
                  className="press glass flex h-11 w-11 items-center justify-center rounded-full text-ink"
                >
                  <Plus size={18} />
                </button>
              </div>
            )}
          </>
        ) : null}

        {action === 'diaper' ? (
          <Field label="Jenis">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['wet', 'Pipis'],
                  ['dirty', 'Pup'],
                  ['both', 'Campur'],
                ] as const
              ).map(([value, label]) => (
                <OptionChip
                  key={value}
                  selected={diaperKind === value}
                  onClick={() => setDiaperKind(value)}
                  className="w-full"
                >
                  {label}
                </OptionChip>
              ))}
            </div>
          </Field>
        ) : null}

        {action === 'sleep' ? (
          <p className="rounded-[22px] bg-white/45 px-5 py-4 text-caption leading-relaxed text-ink backdrop-blur-xl">
            {openSleep
              ? 'Ada sesi tidur yang masih berjalan. Simpan untuk menandai bangun.'
              : 'Mulai sesi tidur. Nanti akhiri dari banner di Beranda atau tombol ini.'}
          </p>
        ) : null}

        {action === 'cry' ? (
          <>
            <Field label="Dugaan penyebab">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(
                  [
                    ['hungry', 'Lapar'],
                    ['diaper', 'Popok'],
                    ['gas', 'Kembung'],
                    ['sleepy', 'Ngantuk'],
                    ['overstim', 'Overstim'],
                    ['unknown', 'Tidak jelas'],
                  ] as const
                ).map(([value, label]) => (
                  <OptionChip
                    key={value}
                    selected={cryCause === value}
                    onClick={() => setCryCause(value)}
                    className="w-full"
                  >
                    {label}
                  </OptionChip>
                ))}
              </div>
            </Field>
            {!cryDetail ? (
              <button
                type="button"
                onClick={() => setCryDetail(true)}
                className="text-caption font-semibold text-accent"
              >
                + Cara meredakan (opsional)
              </button>
            ) : (
              <>
                <Field label="Cara meredakan">
                  <div className="grid grid-cols-2 gap-2">
                    {['Gendong', 'Susu', 'Ganti popok', 'White noise'].map((tip) => (
                      <OptionChip
                        key={tip}
                        selected={soothedHow === tip}
                        onClick={() => setSoothedHow(tip)}
                        className="w-full"
                      >
                        {tip}
                      </OptionChip>
                    ))}
                  </div>
                </Field>
                <Field label="Berhasil?">
                  <div className="grid grid-cols-2 gap-2">
                    <OptionChip
                      selected={soothedOk === true}
                      onClick={() => setSoothedOk(true)}
                    >
                      Ya
                    </OptionChip>
                    <OptionChip
                      selected={soothedOk === false}
                      onClick={() => setSoothedOk(false)}
                    >
                      Belum
                    </OptionChip>
                  </div>
                </Field>
              </>
            )}
            <p className="text-caption text-ink-muted">
              Atau{' '}
              <Link
                to="/cry-analysis"
                onClick={onClose}
                className="font-semibold text-accent"
              >
                analisis suara
              </Link>{' '}
              di tab Tangis.
            </p>
          </>
        ) : null}

        <Field label="Kapan">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WHEN_OPTIONS.map((opt) => (
                <OptionChip
                  key={opt.mins}
                  selected={minsAgo === opt.mins}
                  onClick={() => setMinsAgo(opt.mins)}
                  className="w-full"
                >
                  {opt.label}
                </OptionChip>
              ))}
            </div>
          </Field>

        {action !== 'sleep' || !openSleep ? (
          <Field label="Catatan (opsional)">
            <NoteField
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tambahan singkat…"
            />
          </Field>
        ) : null}

        <PillButton onClick={() => void save()} disabled={saving} className="w-full">
          {saving ? 'Menyimpan…' : 'Simpan'}
        </PillButton>
      </div>
    </Sheet>
  )
}
