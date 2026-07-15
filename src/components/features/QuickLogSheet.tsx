import { useEffect, useState } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import {
  Field,
  NoteField,
  OptionChip,
  PillButton,
  Sheet,
  TextField,
} from '@/components/ui/primitives'
import { endSleep, logCry, logDiaper, logFeed, logSleep } from '@/lib/actions'
import type { CryCause, DiaperKind, FeedKind, QuickAction } from '@/types'
import { db } from '@/db'
import { useLiveQuery } from 'dexie-react-hooks'

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
  // Latest sleep session that hasn't been ended yet
  const openSleep = useLiveQuery(async () => {
    const sleeps = await db.events.where('type').equals('sleep').toArray()
    return (
      sleeps
        .filter((e) => !e.deleted && !e.sleepEnd)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null
    )
  })

  const [ml, setMl] = useState(90)
  const [feedKind, setFeedKind] = useState<FeedKind>('formula')
  const [diaperKind, setDiaperKind] = useState<DiaperKind>('wet')
  const [cryCause, setCryCause] = useState<CryCause>('hungry')
  const [soothedHow, setSoothedHow] = useState('')
  const [soothedOk, setSoothedOk] = useState<boolean | undefined>(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.defaultFeedMl) setMl(profile.defaultFeedMl)
    setNotes('')
    setSoothedHow('')
    setSoothedOk(true)
    setDiaperKind('wet')
    setCryCause('hungry')
    setFeedKind('formula')
  }, [action, profile?.defaultFeedMl])

  async function save() {
    if (!action || saving) return
    setSaving(true)
    try {
      if (action === 'feed') {
        await logFeed({ ml, feedKind, notes: notes || undefined })
        onSaved(`Susu ${ml} ml tersimpan`)
      } else if (action === 'diaper') {
        await logDiaper({ diaperKind, notes: notes || undefined })
        onSaved('Popok tersimpan')
      } else if (action === 'sleep') {
        if (openSleep) {
          await endSleep(openSleep.id)
          onSaved('Tidur diakhiri')
        } else {
          await logSleep({ notes: notes || undefined })
          onSaved('Tidur dimulai')
        }
      } else if (action === 'cry') {
        await logCry({
          cryCause,
          soothedHow: soothedHow || undefined,
          soothedOk,
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
              ? 'Ada sesi tidur yang masih berjalan. Simpan untuk menandai bangun sekarang.'
              : 'Mulai sesi tidur dari sekarang. Nanti bisa diakhiri dari tombol yang sama.'}
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
            <Field label="Cara meredakan">
              <TextField
                value={soothedHow}
                onChange={(e) => setSoothedHow(e.target.value)}
                placeholder="Gendong, white noise, ganti popok…"
              />
            </Field>
            <Field label="Berhasil?">
              <div className="grid grid-cols-2 gap-2">
                <OptionChip selected={soothedOk === true} onClick={() => setSoothedOk(true)}>
                  Ya
                </OptionChip>
                <OptionChip selected={soothedOk === false} onClick={() => setSoothedOk(false)}>
                  Belum
                </OptionChip>
              </div>
            </Field>
          </>
        ) : null}

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

        <PillButton onClick={save} disabled={saving} className="w-full">
          {saving ? 'Menyimpan…' : 'Simpan'}
        </PillButton>
      </div>
    </Sheet>
  )
}
