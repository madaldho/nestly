import { Clock } from '@phosphor-icons/react'
import { Field, OptionChip, TextField } from '@/components/ui/primitives'
import {
  WHEN_PRESETS,
  defaultWhenValue,
  nowClockValue,
  whenSummary,
  type WhenValue,
} from '@/lib/when'

export function WhenField({
  value,
  onChange,
  label = 'Kapan',
  customLabel = 'Pilih jam…',
}: {
  value: WhenValue
  onChange: (next: WhenValue) => void
  label?: string
  customLabel?: string
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        {WHEN_PRESETS.map((opt) => (
          <OptionChip
            key={opt.mins}
            selected={value.mode === 'preset' && value.minsAgo === opt.mins}
            onClick={() =>
              onChange({
                ...value,
                mode: 'preset',
                minsAgo: opt.mins,
              })
            }
            className="w-full"
          >
            {opt.label}
          </OptionChip>
        ))}
        <OptionChip
          selected={value.mode === 'custom'}
          onClick={() =>
            onChange({
              ...value,
              mode: 'custom',
              clock: value.clock || nowClockValue(),
            })
          }
          className="col-span-2 w-full"
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock size={16} weight="bold" />
            {customLabel}
          </span>
        </OptionChip>
      </div>

      {value.mode === 'custom' ? (
        <div className="mt-3 space-y-2">
          <TextField
            type="time"
            value={value.clock}
            onChange={(e) =>
              onChange({
                ...value,
                mode: 'custom',
                clock: e.target.value,
              })
            }
            className="font-medium tabular-nums"
          />
          <p className="text-caption text-ink-muted">{whenSummary(value)}</p>
        </div>
      ) : null}
    </Field>
  )
}

export { defaultWhenValue }
export type { WhenValue }
