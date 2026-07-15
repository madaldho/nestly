import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowsClockwise, Copy, DownloadSimple } from '@phosphor-icons/react'
import { db, createApiKey } from '@/db'
import { downloadCsv } from '@/lib/export'
import { fullSync } from '@/lib/sync'
import {
  Card,
  Field,
  GhostPill,
  PillButton,
  TextField,
  Toast,
} from '@/components/ui/primitives'

export function SettingsPage() {
  const profile = useLiveQuery(() => db.profile.get('default'))
  const settings = useLiveQuery(() => db.settings.get('default'))
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function notify(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  async function saveProfile(partial: Partial<NonNullable<typeof profile>>) {
    if (!profile) return
    await db.profile.put({
      ...profile,
      ...partial,
      updatedAt: new Date().toISOString(),
    })
  }

  async function saveSettings(partial: Partial<NonNullable<typeof settings>>) {
    if (!settings) return
    await db.settings.put({ ...settings, ...partial })
  }

  async function rotateKey() {
    await saveSettings({ apiKey: createApiKey() })
    notify('API key diganti')
  }

  async function copyKey() {
    if (!settings?.apiKey) return
    await navigator.clipboard.writeText(settings.apiKey)
    notify('API key disalin')
  }

  async function syncNow() {
    if (!settings) return
    setBusy(true)
    try {
      await fullSync(settings.agentApiUrl, settings.apiKey)
      notify('Sync berhasil')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Sync gagal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <Toast message={toast} />

      <section className="pt-1 text-center md:pt-2">
        <h2 className="text-display-lg text-ink">Pengaturan</h2>
        <p className="mt-2 text-caption text-ink-muted">
          Profil, koneksi agent, dan backup data.
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-display-md text-ink">Profil bayi</h3>
        <Card className="space-y-5 p-6">
          <Field label="Nama">
            <TextField
              value={profile?.name ?? ''}
              onChange={(e) => saveProfile({ name: e.target.value })}
              placeholder="Nama bayi"
            />
          </Field>
          <Field label="Tanggal lahir">
            <TextField
              type="date"
              value={profile?.birthDate ?? ''}
              onChange={(e) => saveProfile({ birthDate: e.target.value })}
            />
          </Field>
          <Field label="Default susu (ml)">
            <TextField
              type="number"
              min={10}
              max={400}
              value={profile?.defaultFeedMl ?? 90}
              onChange={(e) => saveProfile({ defaultFeedMl: Number(e.target.value) || 90 })}
            />
          </Field>
          <Field label="Nama caregiver">
            <TextField
              value={settings?.caregiverName ?? ''}
              onChange={(e) => saveSettings({ caregiverName: e.target.value })}
            />
          </Field>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-display-md text-ink">Agent API</h3>
          <p className="mt-1 text-caption text-ink-muted">
            Opsional — untuk OpenClaw / Hermes / MCP. Aplikasi tetap berfungsi penuh
            tanpa ini karena data tersimpan lokal.
          </p>
        </div>
        <Card className="space-y-5 p-6">
          <Field label="API key (samakan dengan output npm run api)">
            <div className="flex gap-2">
              <TextField
                value={settings?.apiKey ?? ''}
                onChange={(e) => saveSettings({ apiKey: e.target.value.trim() })}
                className="font-mono !text-[13px]"
                placeholder="nst_…"
                spellCheck={false}
              />
              <button
                type="button"
                aria-label="Salin API key"
                onClick={copyKey}
                className="press glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink"
              >
                <Copy size={18} />
              </button>
            </div>
          </Field>
          <Field label="Agent API URL">
            <TextField
              value={settings?.agentApiUrl ?? ''}
              onChange={(e) => saveSettings({ agentApiUrl: e.target.value })}
              placeholder="http://localhost:8787"
            />
          </Field>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PillButton onClick={syncNow} disabled={busy} className="sm:flex-1">
              <ArrowsClockwise size={18} />
              {busy ? 'Sync…' : 'Sync sekarang'}
            </PillButton>
            <GhostPill onClick={rotateKey}>Ganti key</GhostPill>
          </div>
          {settings?.lastSyncAt ? (
            <p className="text-fine text-ink-faint">
              Sync terakhir: {new Date(settings.lastSyncAt).toLocaleString('id-ID')}
            </p>
          ) : null}
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

      <section className="space-y-4">
        <h3 className="text-display-md text-ink">Endpoint agent</h3>
        <Card className="divide-y divide-divider overflow-hidden">
          {[
            ['POST /api/events', 'Catat feed / diaper / sleep / cry'],
            ['GET /api/summary/today', 'Ringkasan hari ini'],
            ['GET /api/next-feed', 'Estimasi nen berikutnya'],
          ].map(([path, desc]) => (
            <div key={path} className="px-6 py-4">
              <p className="font-mono text-[13px] text-ink">{path}</p>
              <p className="mt-0.5 text-caption text-ink-muted">{desc}</p>
            </div>
          ))}
        </Card>
        <p className="text-fine text-ink-faint">
          Detail lengkap di docs/AGENT.md — jalankan npm run api dulu.
        </p>
      </section>
    </div>
  )
}
