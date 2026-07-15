import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Microphone,
  Stop,
  WaveformSlash,
  Baby,
  Ear,
  Waves,
  ThermometerSimple,
  SmileyMeh,
  CaretDown,
  SpinnerGap,
  CheckCircle,
} from '@phosphor-icons/react'
import { format, parseISO, subDays } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { db } from '@/db'
import { logCry } from '@/lib/actions'
import { analyzeCryBlob, type CryAnalysisResult } from '@/lib/cry-analyzer'
import { analyzeCryHybrid } from '@/lib/cry-hybrid'
import { loadCryModel } from '@/lib/cry-ml'
import { activeEvents, cryCauseLabel, formatTime } from '@/lib/insights'
import { Card, PillButton, Toast } from '@/components/ui/primitives'
import { WhenField, defaultWhenValue, type WhenValue } from '@/components/features/WhenField'
import { whenToIso } from '@/lib/when'
import { WhenField, defaultWhenValue, type WhenValue } from '@/components/features/WhenField'
import { whenToIso } from '@/lib/when'
import type { BabyEvent, CryCause } from '@/types'

const NO_EVENTS: BabyEvent[] = []

const dblSounds: {
  sound: string
  cause: CryCause
  label: string
  reflex: string
  description: string
  tips: string[]
  audioHint: string
}[] = [
  {
    sound: 'Neh',
    cause: 'hungry',
    label: 'Lapar',
    reflex: 'Refleks menghisap',
    description:
      'Suara "neh" dibuat saat lidah menyentuh langit-langit mulut — gerakan refleks menghisap. Biasanya tangisan awal sebelum eskalasi.',
    tips: [
      'Segera tawarkan ASI atau susu',
      'Perhatikan tanda awal: tangan ke mulut, rooting',
      'Jangan tunggu tangisan keras — lebih sulit menyusu',
    ],
    audioHint: 'Ritmis, berulang, intensitas naik perlahan',
  },
  {
    sound: 'Owh',
    cause: 'sleepy',
    label: 'Ngantuk / Lelah',
    reflex: 'Refleks menguap',
    description:
      'Suara "owh" berasal dari gerakan menguap. Tangisan panjang, monoton, kadang disertai gerakan mengusap mata atau telinga.',
    tips: [
      'Redupkan lampu, kurangi stimulasi',
      'Gendong sambil goyang perlahan',
      'White noise bisa membantu',
      'Perhatikan "wake window" sesuai usia',
    ],
    audioHint: 'Panjang, monoton, nada turun, ada jeda menguap',
  },
  {
    sound: 'Heh',
    cause: 'diaper',
    label: 'Tidak Nyaman',
    reflex: 'Refleks kulit',
    description:
      'Suara "heh" muncul dari sensasi tidak nyaman di kulit — popok basah, panas, dingin, posisi kurang enak, label baju mengganggu.',
    tips: [
      'Cek popok — ganti kalau basah/penuh',
      'Pastikan suhu ruangan nyaman (24-26°C)',
      'Periksa pakaian — terlalu ketat? tag mengganggu?',
      'Coba ganti posisi gendong',
    ],
    audioHint: 'Pendek-pendek, agak rewel, tidak terlalu keras',
  },
  {
    sound: 'Eairh',
    cause: 'gas',
    label: 'Sakit Perut / Gas Bawah',
    reflex: 'Tekanan perut',
    description:
      'Suara "eairh" atau "eair" disebabkan gas terperangkap di usus. Bayi biasanya menarik lutut ke dada, wajah memerah, mengejan.',
    tips: [
      'Gerakan sepeda pada kaki bayi',
      'Pijat perut searah jarum jam dengan lembut',
      'Tummy time kalau bayi sudah kuat angkat kepala',
      'Simethicone drops jika direkomendasikan dokter',
    ],
    audioHint: 'Mengejan, nada rendah, diselingi menahan nafas',
  },
  {
    sound: 'Eh',
    cause: 'gas',
    label: 'Perlu Sendawa',
    reflex: 'Gas atas / esofagus',
    description:
      'Suara "eh" pendek dan berulang — gas terperangkap di atas perut. Sering muncul setelah menyusu.',
    tips: [
      'Tepuk punggung perlahan di atas bahu',
      'Gendong tegak 15-20 menit setelah menyusu',
      'Coba posisi sendawa yang berbeda',
      'Pastikan latch atau dot tidak terlalu banyak udara',
    ],
    audioHint: 'Pendek, berulang, "eh-eh-eh", terdengar seperti cegukan',
  },
]

const causeIcons: Record<string, typeof Baby> = {
  hungry: Baby,
  sleepy: SmileyMeh,
  diaper: ThermometerSimple,
  gas: Waves,
  overstim: WaveformSlash,
  unknown: Ear,
}

type RecStatus = 'idle' | 'recording' | 'analyzing' | 'done' | 'error'

function useCryRecorder(events: BabyEvent[]) {
  const [status, setStatus] = useState<RecStatus>('idle')
  const [seconds, setSeconds] = useState(0)
  const [analyserData, setAnalyserData] = useState<Uint8Array | null>(null)
  const [result, setResult] = useState<(CryAnalysisResult & { contextNotes?: string[]; usedMl?: boolean; source?: string }) | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animRef = useRef(0)
  const timerRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events

  const cleanupLive = useCallback(() => {
    clearInterval(timerRef.current)
    cancelAnimationFrame(animRef.current)
    analyserRef.current = null
    setAnalyserData(null)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    void ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    setResult(null)
    setErrorMsg(null)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const ctx = new AudioContext()
      ctxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''

      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      mediaRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(250)
      setStatus('recording')
      setSeconds(0)

      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1)
      }, 1000)

      const draw = () => {
        if (!analyserRef.current) return
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteTimeDomainData(buf)
        setAnalyserData(new Uint8Array(buf))
        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch {
      setStatus('error')
      setErrorMsg(
        'Mikrofon tidak bisa diakses. Izinkan akses mic di browser, lalu coba lagi.',
      )
    }
  }, [])

  const stopAndAnalyze = useCallback(async () => {
    const recorder = mediaRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanupLive()
      setStatus('idle')
      return
    }

    setStatus('analyzing')

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'
        resolve(new Blob(chunksRef.current, { type }))
      }
      recorder.stop()
    })

    cleanupLive()
    mediaRef.current = null

    try {
      // Prefetch ML weights; hybrid blends ML + acoustic + Nestly context
      void loadCryModel().catch(() => undefined)
      let analysis: CryAnalysisResult & {
        contextNotes?: string[]
        usedMl?: boolean
        source?: string
      }
      try {
        analysis = await analyzeCryHybrid(blob, eventsRef.current)
      } catch (err) {
        console.warn('Hybrid failed, heuristic only', err)
        analysis = await analyzeCryBlob(blob)
      }
      setResult(analysis)
      if (!analysis.ok) {
        setStatus('error')
        if (analysis.reason === 'too_short') {
          setErrorMsg('Rekaman terlalu pendek. Rekam minimal ~3–7 detik tangisan.')
        } else if (analysis.reason === 'too_quiet') {
          setErrorMsg('Suara terlalu pelan. Dekatkan HP ke bayi, lalu rekam ulang.')
        } else {
          setErrorMsg('Gagal membaca audio. Coba rekam ulang.')
        }
      } else {
        setStatus('done')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Analisis gagal. Coba rekam ulang.')
    }
  }, [cleanupLive])

  const reset = useCallback(() => {
    cleanupLive()
    mediaRef.current = null
    chunksRef.current = []
    setResult(null)
    setErrorMsg(null)
    setSeconds(0)
    setStatus('idle')
  }, [cleanupLive])

  useEffect(() => {
    return () => {
      cleanupLive()
      if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
    }
  }, [cleanupLive])

  return {
    status,
    seconds,
    analyserData,
    result,
    errorMsg,
    startRecording,
    stopAndAnalyze,
    reset,
  }
}

function Waveform({ data }: { data: Uint8Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, w, h)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#0066cc'
    ctx.beginPath()

    const sliceWidth = w / data.length
    let x = 0
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0
      const y = (v * h) / 2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      x += sliceWidth
    }
    ctx.lineTo(w, h / 2)
    ctx.stroke()
  }, [data])

  return (
    <canvas
      ref={canvasRef}
      className="h-20 w-full rounded-2xl"
      style={{ background: 'rgba(0,102,204,0.06)' }}
    />
  )
}

function AnalysisResultCard({
  result,
  onLog,
  onRetry,
}: {
  result: CryAnalysisResult & {
    contextNotes?: string[]
    usedMl?: boolean
    source?: string
  }
  onLog: (cause: CryCause, label: string, timestamp?: string) => void
  onRetry: () => void
}) {
  const [when, setWhen] = useState<WhenValue>(defaultWhenValue)

  if (!result.ok || !result.top) return null
  const top = result.top
  const Icon = causeIcons[top.cause] ?? Ear
  const alts = result.predictions.slice(1, 3)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
    >
      <Card className="overflow-hidden p-6">
        <div className="flex items-center gap-2 text-caption text-accent">
          <CheckCircle size={16} weight="fill" />
          Hasil analisis · {result.durationSec.toFixed(1)} dtk
          {result.usedMl ? ' · ML' : ''}
        </div>

        <div className="mt-4 flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10">
            <Icon size={28} weight="fill" className="text-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-ink-muted">Kemungkinan terbesar</p>
            <p className="mt-0.5 text-display-md text-ink">{top.label}</p>
            <p className="mt-1 text-caption text-ink-muted">
              Keyakinan sekitar {top.confidence}%
            </p>
          </div>
        </div>

        <div
          className="mt-4 rounded-2xl px-4 py-3 text-[15px] leading-relaxed text-ink"
          style={{ background: 'rgba(0,102,204,0.06)' }}
        >
          {top.tip}
        </div>

        {result.contextNotes && result.contextNotes.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {result.contextNotes.map((n) => (
              <li key={n} className="flex gap-2 text-caption text-ink-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {n}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 space-y-2.5">
          {result.predictions.slice(0, 4).map((p) => (
            <div key={p.sound + p.label}>
              <div className="mb-1 flex justify-between text-caption">
                <span className={p.cause === top.cause && p.label === top.label ? 'font-semibold text-ink' : 'text-ink-muted'}>
                  {p.label}
                </span>
                <span className="tabular-nums text-ink-muted">{p.confidence}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-parchment">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.max(4, p.confidence)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {alts.length > 0 ? (
          <p className="mt-4 text-caption text-ink-muted">
            Alternatif: {alts.map((a) => a.label).join(' · ')}
          </p>
        ) : null}

        <p className="mt-3 text-fine text-ink-muted">
          {result.source ?? 'Analisis Nestly'}. Model dari{' '}
          <a
            href="https://github.com/blessingoraz/baby-cry-classifier"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            baby-cry-classifier
          </a>
          . Bukan diagnosis medis.
        </p>

        <div className="mt-5">
          <WhenField value={when} onChange={setWhen} />
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <PillButton
            className="flex-1"
            onClick={() => onLog(top.cause, top.label, whenToIso(when))}
          >
            Catat sebagai {cryCauseLabel[top.cause]}
          </PillButton>
          <button
            type="button"
            onClick={onRetry}
            className="press min-h-11 flex-1 rounded-full px-5 text-caption font-semibold text-accent"
            style={{ background: 'rgba(0,102,204,0.08)' }}
          >
            Rekam lagi
          </button>
        </div>
      </Card>
    </motion.div>
  )
}

export function CryAnalysisPage() {
  const events = useLiveQuery(() => db.events.toArray(), []) ?? NO_EVENTS
  const {
    status,
    seconds,
    analyserData,
    result,
    errorMsg,
    startRecording,
    stopAndAnalyze,
    reset,
  } = useCryRecorder(events)
  const [toast, setToast] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2200)
  }

  async function quickLog(cause: CryCause, label?: string, timestamp?: string) {
    await logCry({ cryCause: cause, timestamp })
    showToast(`Tangis "${label ?? cryCauseLabel[cause]}" tercatat`)
  }

  const cryAnalysis = useMemo(() => {
    const last7 = activeEvents(events).filter((e) => {
      if (e.type !== 'cry') return false
      const d = parseISO(e.timestamp)
      return d >= subDays(new Date(), 7)
    })

    const byHour: Record<number, number> = {}
    const byCause: Record<string, number> = {}
    const bySoothed: Record<string, { ok: number; fail: number }> = {}

    for (const e of last7) {
      const h = parseISO(e.timestamp).getHours()
      byHour[h] = (byHour[h] ?? 0) + 1
      if (e.cryCause) byCause[e.cryCause] = (byCause[e.cryCause] ?? 0) + 1
      if (e.soothedHow) {
        if (!bySoothed[e.soothedHow]) bySoothed[e.soothedHow] = { ok: 0, fail: 0 }
        if (e.soothedOk) bySoothed[e.soothedHow].ok++
        else bySoothed[e.soothedHow].fail++
      }
    }

    const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0] ?? null
    const topCause = (Object.entries(byCause).sort((a, b) => b[1] - a[1])[0] ??
      null) as [string, number] | null
    const bestSoothe =
      Object.entries(bySoothed)
        .sort((a, b) => b[1].ok - a[1].ok)
        .filter((x) => x[1].ok > 0)[0] ?? null

    const byDay = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), i)
      const key = format(d, 'yyyy-MM-dd')
      const dayLabel = format(d, 'EEE', { locale: localeId })
      const count = last7.filter(
        (e) => format(parseISO(e.timestamp), 'yyyy-MM-dd') === key,
      ).length
      return { day: dayLabel, count, date: key }
    }).reverse()

    return { total: last7.length, peakHour, topCause, bestSoothe, byDay }
  }, [events])

  const maxDayCount = Math.max(1, ...cryAnalysis.byDay.map((d) => d.count))
  const recording = status === 'recording'
  const analyzing = status === 'analyzing'

  return (
    <div className="space-y-10">
      <Toast message={toast} />

      <section className="pt-1 text-center md:pt-2">
        <p className="text-caption text-ink-muted">Pahami bahasa bayi</p>
        <h2 className="mt-1 text-display-lg text-ink">Analisis Tangis</h2>
        <p className="mt-2 text-[17px] text-ink-muted">
          Rekam 3–7 detik — model ML + pola suara + catatan Nestly digabung.
        </p>
      </section>

      {/* Recorder */}
      <section className="space-y-4">
        <Card className="overflow-hidden p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10">
              {analyzing ? (
                <SpinnerGap size={22} className="animate-spin text-accent" />
              ) : (
                <Microphone size={22} weight="regular" className="text-accent" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-tagline text-ink">
                {analyzing
                  ? 'Menganalisis…'
                  : recording
                    ? 'Merekam…'
                    : 'Perekam suara'}
              </p>
              <p className="mt-1 text-caption text-ink-muted">
                {analyzing
                  ? 'Membaca audio lewat model ML ResNet18…'
                  : 'Dekatkan mic ke bayi. Rekam minimal 3 detik tangisan nyata.'}
              </p>
            </div>
          </div>

          <div className="mt-5">
            {recording ? (
              <Waveform data={analyserData} />
            ) : analyzing ? (
              <div
                className="flex h-20 items-center justify-center rounded-2xl text-caption text-ink-muted"
                style={{ background: 'rgba(0,102,204,0.04)' }}
              >
                Sedang memproses audio…
              </div>
            ) : (
              <div
                className="flex h-20 items-center justify-center rounded-2xl text-caption text-ink-muted"
                style={{ background: 'rgba(0,102,204,0.04)' }}
              >
                Tap Rekam → berhenti → lihat hasil
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-caption text-ink-muted tabular-nums">
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </span>
            {recording ? (
              <button
                type="button"
                onClick={() => void stopAndAnalyze()}
                className="press flex min-h-11 items-center gap-2 rounded-full bg-[#cc3300] px-5 py-2.5 text-caption font-semibold text-white"
              >
                <Stop size={16} weight="fill" />
                Analisis
              </button>
            ) : analyzing ? (
              <span className="text-caption font-semibold text-ink-muted">
                Mohon tunggu…
              </span>
            ) : (
              <PillButton onClick={() => void startRecording()}>
                <Microphone size={16} weight="bold" />
                Rekam
              </PillButton>
            )}
          </div>

          {errorMsg ? (
            <p className="mt-4 rounded-2xl bg-[#cc3300]/8 px-4 py-3 text-caption text-[#cc3300]">
              {errorMsg}
            </p>
          ) : null}
        </Card>

        {result?.ok ? (
          <AnalysisResultCard
            result={result}
            onLog={(cause, label, timestamp) => void quickLog(cause, label, timestamp)}
            onRetry={reset}
          />
        ) : null}
      </section>

      {/* Dunstan guide */}
      <section className="space-y-4">
        <div className="px-0.5">
          <h3 className="text-display-md text-ink">Dunstan Baby Language</h3>
          <p className="mt-1 text-caption text-ink-muted">
            Referensi suara refleks. Bisa dipakai untuk cocokkan hasil analisis.
          </p>
        </div>

        <div className="space-y-3">
          {dblSounds.map((item) => {
            const Icon = causeIcons[item.cause] ?? Ear
            const isOpen = expanded === item.sound
            const highlighted =
              result?.ok && result.top?.cause === item.cause

            return (
              <Card
                key={item.sound}
                className={`overflow-hidden ${highlighted ? 'ring-2 ring-accent/30' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : item.sound)}
                  className="press flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10">
                    <Icon size={22} className="text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      "{item.sound}" — {item.label}
                      {highlighted ? (
                        <span className="ml-2 text-caption font-medium text-accent">
                          cocok hasil
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-caption text-ink-muted">{item.reflex}</p>
                  </div>
                  <CaretDown
                    size={18}
                    className={`shrink-0 text-ink-muted transition-transform duration-300 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 border-t border-divider px-5 pb-5 pt-4">
                        <p className="text-[15px] leading-relaxed text-ink">
                          {item.description}
                        </p>
                        <div
                          className="rounded-2xl px-4 py-3 text-caption text-accent"
                          style={{ background: 'rgba(0,102,204,0.06)' }}
                        >
                          <span className="font-semibold">Ciri suara:</span>{' '}
                          {item.audioHint}
                        </div>
                        <ul className="space-y-1.5">
                          {item.tips.map((tip) => (
                            <li
                              key={tip}
                              className="flex gap-2 text-caption text-ink-muted"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                        <DunstanLogButton
                          cause={item.cause}
                          label={item.label}
                          onLog={quickLog}
                        />
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Card>
            )
          })}
        </div>
      </section>

      {/* 7-day patterns */}
      <section className="space-y-4">
        <div className="px-0.5">
          <h3 className="text-display-md text-ink">Pola 7 hari</h3>
          <p className="mt-1 text-caption text-ink-muted">
            {cryAnalysis.total === 0
              ? 'Belum ada catatan tangis. Catat secara rutin untuk melihat pola.'
              : `${cryAnalysis.total} tangis tercatat dalam 7 hari terakhir.`}
          </p>
        </div>

        {cryAnalysis.total > 0 ? (
          <>
            <Card className="p-5">
              <p className="text-caption font-semibold text-ink">Tangis per hari</p>
              <div className="mt-3 flex h-24 items-end gap-2">
                {cryAnalysis.byDay.map((d) => {
                  const h = Math.max(8, Math.round((d.count / maxDayCount) * 100))
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-fine font-semibold text-ink tabular-nums">
                        {d.count || ''}
                      </span>
                      <div className="flex h-16 w-full items-end rounded-lg bg-parchment">
                        <div
                          className="w-full rounded-lg bg-accent transition-[height] duration-500"
                          style={{ height: d.count ? `${h}%` : '4px' }}
                        />
                      </div>
                      <span className="text-fine text-ink-muted">{d.day}</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="px-5 py-4">
                <p className="text-caption text-ink-muted">Penyebab terbanyak</p>
                <p className="mt-1 text-tagline text-ink">
                  {cryAnalysis.topCause
                    ? cryCauseLabel[cryAnalysis.topCause[0] as CryCause] ??
                      cryAnalysis.topCause[0]
                    : '—'}
                </p>
              </Card>
              <Card className="px-5 py-4">
                <p className="text-caption text-ink-muted">Jam rawan</p>
                <p className="mt-1 text-tagline text-ink">
                  {cryAnalysis.peakHour
                    ? `${String(cryAnalysis.peakHour[0]).padStart(2, '0')}:00`
                    : '—'}
                </p>
              </Card>
              <Card className="px-5 py-4">
                <p className="text-caption text-ink-muted">Cara paling efektif</p>
                <p className="mt-1 text-tagline text-ink">
                  {cryAnalysis.bestSoothe ? cryAnalysis.bestSoothe[0] : '—'}
                </p>
              </Card>
            </div>
          </>
        ) : null}
      </section>

      <section className="space-y-4">
        <h3 className="text-display-md text-ink">Catatan tangis terbaru</h3>
        <RecentCries events={events} />
      </section>
    </div>
  )
}

function RecentCries({ events }: { events: BabyEvent[] }) {
  const cries = useMemo(
    () =>
      activeEvents(events)
        .filter((e) => e.type === 'cry')
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 10),
    [events],
  )

  if (cries.length === 0) {
    return (
      <Card>
        <div className="px-6 py-10 text-center">
          <p className="text-tagline text-ink">Belum ada catatan tangis</p>
          <p className="mt-2 text-caption text-ink-muted">
            Rekam di atas, atau catat manual dari panduan Dunstan.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="divide-y divide-divider overflow-hidden">
      {cries.map((e) => (
        <div key={e.id} className="flex items-center gap-4 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">
              {e.cryCause ? cryCauseLabel[e.cryCause] : 'Tangis'}
            </p>
            <p className="text-caption text-ink-muted">
              {formatTime(e.timestamp)}
              {e.soothedHow ? ` · ${e.soothedHow}` : ''}
            </p>
          </div>
          <span className="text-fine text-ink-muted">
            {format(parseISO(e.timestamp), 'd MMM', { locale: localeId })}
          </span>
        </div>
      ))}
    </Card>
  )
}

function DunstanLogButton({
  cause,
  label,
  onLog,
}: {
  cause: CryCause
  label: string
  onLog: (cause: CryCause, label?: string, timestamp?: string) => void | Promise<void>
}) {
  const [when, setWhen] = useState<WhenValue>(defaultWhenValue)

  return (
    <div className="space-y-4">
      <WhenField value={when} onChange={setWhen} />
      <PillButton
        onClick={() => void onLog(cause, label, whenToIso(when))}
        className="w-full"
      >
        Catat sebagai "{label}"
      </PillButton>
    </div>
  )
}
