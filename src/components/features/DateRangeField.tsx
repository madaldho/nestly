import { CalendarBlank } from '@phosphor-icons/react'
import { Field, OptionChip, TextField } from '@/components/ui/primitives'
import {
  DATE_RANGE_PRESETS,
  dateRangeLabel,
  defaultDateRange,
  todayIsoDate,
  type DateRangePreset,
  type DateRangeValue,
} from '@/lib/date-range'

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return todayIsoDate(d)
}

export function DateRangeField({
  value,
  onChange,
  label = 'Periode',
}: {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  label?: string
}) {
  function applyPreset(preset: DateRangePreset) {
    if (preset === 'custom') {
      onChange({
        preset: 'custom',
        from: daysAgoIso(6),
        to: todayIsoDate(),
      })
      return
    }
    onChange({ ...value, preset })
  }

  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        {DATE_RANGE_PRESETS.map((opt) => (
          <OptionChip
            key={opt.id}
            selected={value.preset === opt.id}
            onClick={() => applyPreset(opt.id)}
            className="w-full"
          >
            {opt.label}
          </OptionChip>
        ))}
        <OptionChip
          selected={value.preset === 'custom'}
          onClick={() => applyPreset('custom')}
          className="col-span-2 w-full"
        >
          <span className="inline-flex items-center gap-1.5">
            <CalendarBlank size={16} weight="bold" />
            Atur tanggal…
          </span>
        </OptionChip>
      </div>

      {value.preset === 'custom' ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-fine font-semibold text-ink-muted">Dari</p>
            <TextField
              type="date"
              value={value.from}
              max={value.to || todayIsoDate()}
              onChange={(e) =>
                onChange({ ...value, preset: 'custom', from: e.target.value })
              }
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-fine font-semibold text-ink-muted">Sampai</p>
            <TextField
              type="date"
              value={value.to}
              min={value.from}
              max={todayIsoDate()}
              onChange={(e) =>
                onChange({ ...value, preset: 'custom', to: e.target.value })
              }
              className="tabular-nums"
            />
          </div>
        </div>
      ) : null}

      <p className="mt-2 text-caption text-ink-muted">{dateRangeLabel(value)}</p>
    </Field>
  )
}

export { defaultDateRange }
export type { DateRangeValue }
