import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/pages/HomePage'
import { TimelinePage } from '@/pages/TimelinePage'
import { InsightsPage } from '@/pages/InsightsPage'
import { CryAnalysisPage } from '@/pages/CryAnalysisPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ensureDefaults } from '@/db'

export default function App() {
  useEffect(() => {
    void ensureDefaults()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="cry-analysis" element={<CryAnalysisPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
