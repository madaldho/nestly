import { AnimatePresence, motion } from 'framer-motion'
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`card ${className}`}>{children}</div>
}

/* Primary Action Blue pill — solid accent for primary actions */
export function PillButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`press inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-[22px] py-[11px] text-[17px] font-normal text-white shadow-[0_4px_16px_rgba(0,102,204,0.28)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-focus disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

/* Ghost pill — glass secondary CTA */
export function GhostPill({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press glass inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-[22px] py-[10px] text-[17px] text-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-focus ${className}`}
    >
      {children}
    </button>
  )
}

/* Configurator option chip — glass, blue ring when selected */
export function OptionChip({
  children,
  selected,
  onClick,
  className = '',
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`press min-h-11 rounded-full px-4 py-3 text-caption text-ink ${
        selected
          ? 'border border-accent-focus bg-white/75 shadow-[inset_0_0_0_1px_var(--color-accent-focus)] backdrop-blur-xl'
          : 'glass'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative z-10 w-full px-3 sm:max-w-md sm:px-0"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.36, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="overflow-hidden rounded-t-[28px] border border-white/50 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_16px_48px_rgba(0,0,0,0.14)] backdrop-blur-[28px] backdrop-saturate-[180%] sm:rounded-[28px]">
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-ink/15 sm:hidden" />
              <div className="flex items-center justify-between px-6 pb-3 pt-4">
                <h2 className="text-tagline text-ink">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="press min-h-11 rounded-full bg-ink/90 px-4 py-2 text-caption text-white"
                >
                  Tutup
                </button>
              </div>
              <div className="max-h-[75dvh] overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

export function Toast({
  message,
  onClick,
}: {
  message: string | null
  onClick?: () => void
}) {
  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        >
          <button
            type="button"
            onClick={onClick}
            className={`rounded-full border border-white/40 bg-ink/88 px-[18px] py-2.5 text-caption text-white shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl ${
              onClick ? 'pointer-events-auto press' : ''
            }`}
          >
            {message}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-caption font-semibold text-ink">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full min-h-11 rounded-full border border-white/50 bg-white/55 px-5 py-3 text-[17px] text-ink outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl transition-colors duration-200 focus:border-accent-focus'

export function TextField({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${className}`} />
}

export function NoteField({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-none rounded-[22px] border border-white/50 bg-white/55 px-5 py-3 text-[17px] text-ink outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl transition-colors duration-200 focus:border-accent-focus ${className}`}
    />
  )
}
