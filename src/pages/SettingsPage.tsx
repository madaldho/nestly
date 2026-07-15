import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DownloadSimple } from '@phosphor-icons/react'
import { db } from '@/db'
import { downloadCsv } from '@/lib/export'
import {
  Card,
  Field,
  PillButton,
  TextField,
  Toast,
} from '@/components/ui/primitives'

export function SettingsPage() {
  const profile = useLiveQuery(() => db.profile.get('default'))
  const settings = useLiveQuery(() => db.settings.get('default'))
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const [toast, setToast] = useState<string | null>(null)

  // Local drafts — avoid saving on every keystroke (Dexie liveQuery races)
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [defaultFeedMl, setDefaultFeedMl] = useState('90')
  const [caregiverName, setCaregiverName] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!profile || !settings) return
    if (hydrated) return
    setName(profile.name)
    setBirthDate(profile.birthDate)
    setDefaultFeedMl(String(profile.defaultFeedMl))
    setCaregiverName(settings.caregiverName)
    setHydrated(true)
  }, [profile, settings, hydrated])

  function notify(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  async function commitProfile(partial: {
    name?: string
    birthDate?: string
    defaultFeedMl?: number
  }) {
    const current = await db.profile.get('default')
    if (!current) return
    await db.profile.put({
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    })
  }

  async function commitCaregiver(value: string) {
    const current = await db.settings.get('default')
    if (!current) return
    await db.settings.put({ ...current, caregiverName: value })
  }

  return (
    <div className="space-y-8">
      <Toast message={toast} />

      <section className="pt-1 text-center md:pt-2">
        <h2 className="text-display-lg text-ink">Pengaturan</h2>
        <p className="mt-2 text-caption text-ink-muted">
          Profil bayi dan backup data.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-display-md text-ink">Profil bayi</h3>
        <Card className="space-y-5 p-6">
          <Field label="Nama">
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const trimmed = name.trim() || 'Si Kecil'
                if (trimmed !== name) setName(trimmed)
                void commitProfile({ name: trimmed })
              }}
              placeholder="Nama bayi"
              autoComplete="off"
              enterKeyHint="done"
            />
          </Field>
          <Field label="Tanggal lahir">
            <TextField
              type="date"
              value={birthDate}
              onChange={(e) => {
                setBirthDate(e.target.value)
                void commitProfile({ birthDate: e.target.value })
              }}
            />
          </Field>
          <Field label="Default susu (ml)">
            <TextField
              type="number"
              min={10}
              max={400}
              value={defaultFeedMl}
              onChange={(e) => setDefaultFeedMl(e.target.value)}
              onBlur={() => {
                const ml = Math.min(400, Math.max(10, Number(defaultFeedMl) || 90))
                setDefaultFeedMl(String(ml))
                void commitProfile({ defaultFeedMl: ml })
              }}
            />
          </Field>
          <Field label="Nama caregiver">
            <TextField
              value={caregiverName}
              onChange={(e) => setCaregiverName(e.target.value)}
              onBlur={() => {
                const trimmed = caregiverName.trim() || 'Orang tua'
                if (trimmed !== caregiverName) setCaregiverName(trimmed)
                void commitCaregiver(trimmed)
              }}
              autoComplete="name"
              enterKeyHint="done"
            />
          </Field>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-display-md text-ink">Spreadsheet</h3>
          <p className="mt-1 text-caption text-ink-muted">
            Export CSV, lalu buka di Google Sheets atau Excel sebagai backup.
          </p>
        </div>
        <Card className="p-6">
          <PillButton
            onClick={() => {
              if (!profile) return
              downloadCsv(events, profile)
              notify('CSV diunduh')
            }}
            className="w-full sm:w-auto"
          >
            <DownloadSimple size={18} />
            Export CSV
          </PillButton>
        </Card>
      </section>
    </div>
  )
}
