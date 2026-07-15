export type EventType = 'feed' | 'diaper' | 'sleep' | 'cry' | 'growth' | 'medicine'

export type FeedKind = 'formula' | 'breast_left' | 'breast_right' | 'breast_both'
export type DiaperKind = 'wet' | 'dirty' | 'both'
export type CryCause =
  | 'hungry'
  | 'diaper'
  | 'gas'
  | 'sleepy'
  | 'overstim'
  | 'unknown'

export interface BabyProfile {
  id: string
  name: string
  birthDate: string
  defaultFeedMl: number
  timezone: string
  updatedAt: string
}

export interface AppSettings {
  id: string
  apiKey: string
  agentApiUrl: string
  lastSyncAt: string | null
  caregiverName: string
}

export interface BabyEvent {
  id: string
  type: EventType
  timestamp: string
  notes?: string
  caregiver?: string
  synced: boolean
  updatedAt: string
  deleted?: boolean
  // feed
  ml?: number
  feedKind?: FeedKind
  durationMin?: number
  // diaper
  diaperKind?: DiaperKind
  // sleep
  sleepEnd?: string
  // cry
  cryCause?: CryCause
  cryDurationMin?: number
  soothedHow?: string
  soothedOk?: boolean
  // growth
  weightKg?: number
  heightCm?: number
  // medicine
  medicineName?: string
  medicineDose?: string
}

export interface DaySummary {
  date: string
  totalMl: number
  feedCount: number
  diaperCount: number
  dirtyCount: number
  sleepMinutes: number
  cryCount: number
  topCryCause: CryCause | null
}

export type QuickAction = 'feed' | 'diaper' | 'sleep' | 'cry'
