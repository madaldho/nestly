import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ChartLineUp,
  ClockCounterClockwise,
  Ear,
  GearSix,
  House,
} from '@phosphor-icons/react'

const tabs = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/timeline', label: 'Riwayat', icon: ClockCounterClockwise },
  { to: '/cry-analysis', label: 'Tangis', icon: Ear },
  { to: '/insights', label: 'Ringkasan', icon: ChartLineUp },
  { to: '/settings', label: 'Setelan', icon: GearSix },
]

const titles: Record<string, string> = {
  '/': 'Beranda',
  '/timeline': 'Riwayat',
  '/cry-analysis': 'Analisis Tangis',
  '/insights': 'Ringkasan',
  '/settings': 'Setelan',
}

export function AppShell() {
  const { pathname } = useLocation()
  const title = titles[pathname] ?? 'Nestly'

  return (
    <div className="relative min-h-dvh">
      {/* Thin floating glass header — brand + desktop nav */}
      <header className="sticky top-0 z-30 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-5">
        <div className="frosted mx-auto flex h-12 max-w-[980px] items-center justify-between rounded-full px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              Nestly
            </span>
            <span className="hidden text-fine text-ink-muted sm:inline">
              Baby tracker
            </span>
          </div>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Navigasi utama">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `text-caption transition-colors duration-200 ${
                    isActive
                      ? 'font-semibold text-accent'
                      : 'text-ink-muted hover:text-ink'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <span className="text-caption font-medium text-ink-muted md:hidden">
            {title}
          </span>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-[980px] px-4 pt-6 md:px-5 md:pt-10">
        <Outlet />
      </main>

      {/* Floating capsule tab bar — iOS 26 style */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Tab navigasi"
      >
        <div className="frosted grid w-full max-w-md grid-cols-5 rounded-full px-1.5 py-1.5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className="press flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                      isActive ? 'bg-accent/12' : ''
                    }`}
                  >
                    <tab.icon
                      size={22}
                      weight={isActive ? 'fill' : 'regular'}
                      className={isActive ? 'text-accent' : 'text-ink-muted'}
                    />
                  </span>
                  <span
                    className={`text-[10px] leading-tight ${
                      isActive ? 'font-semibold text-accent' : 'text-ink-muted'
                    }`}
                  >
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
