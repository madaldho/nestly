import { useEffect, useState } from 'react'
import { db } from '@/db'
import { Field, PillButton, Sheet, TextField } from '@/components/ui/primitives'

const SETUP_KEY = 'nestly.setup.v1'

export function needsOnboarding() {
  try {
    return localStorage.getItem(SETUP_KEY) !== '1'
  } catch {
    return true
  }
}

function markDone() {
  try {
    localStorage.setItem(SETUP_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function OnboardingSetup({
  open,
  onDone,
}: {
  open: boolean
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    void db.profile.get('default').then((p) => {
      if (!p) return
      setName(p.name === 'Si Kecil' ? '' : p.name)
      // If birthDate is "today" from defaults, leave empty so parent sets real date
      const today = new Date().toISOString().slice(0, 10)
      setBirthDate(p.birthDate === today ? '' : p.birthDate)
    })
  }, [open])

  async function save() {
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed || !birthDate) return
    setSaving(true)
    try {
      const current = await db.profile.get('default')
      if (!current) return
      await db.profile.put({
        ...current,
        name: trimmed,
        birthDate,
        updatedAt: new Date().toISOString(),
      })
      markDone()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  function skip() {
    markDone()
    onDone()
  }

  return (
    <Sheet open={open} onClose={skip} title="Kenalan dulu">
      <div className="space-y-6">
        <p className="text-caption leading-relaxed text-ink-muted">
          Isi nama dan tanggal lahir biar usia dan prediksi susu lebih pas. Bisa
          diubah lagi di Setelan.
        </p>
        <Field label="Nama bayi">
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mis. Ara"
            autoComplete="off"
            autoFocus
          />
        </Field>
        <Field label="Tanggal lahir">
          <TextField
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </Field>
        <PillButton
          onClick={() => void save()}
          disabled={saving || !name.trim() || !birthDate}
          className="w-full"
        >
          {saving ? 'Menyimpan…' : 'Mulai pakai Nestly'}
        </PillButton>
        <button
          type="button"
          onClick={skip}
          className="w-full py-2 text-center text-caption font-semibold text-ink-muted"
        >
          Nanti saja
        </button>
      </div>
    </Sheet>
  )
}
