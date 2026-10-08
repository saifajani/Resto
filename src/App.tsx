import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { backend } from './lib/config'
import { SessionContext } from './session'
import SignIn from './pages/SignIn'
import Welcome from './pages/Welcome'
import Restaurants from './pages/Restaurants'
import RestaurantPage from './pages/RestaurantPage'
import LogVisit from './pages/LogVisit'
import Feed from './pages/Feed'
import People from './pages/People'
import Profile from './pages/Profile'
import JoinInvite from './pages/JoinInvite'
import { InstallNudge } from './components/AddToHomeScreen'

type State = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; userId: string; needsName: boolean }

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(
    () =>
      backend.onAuthChange(async (userId) => {
        if (!userId) {
          setState({ status: 'signedOut' })
          return
        }
        let needsName = false
        try {
          needsName = (await backend.myProfile()).display_name === 'Me'
        } catch {
          // Not fatal; they can set their name on the Profile tab.
        }
        setState({ status: 'signedIn', userId, needsName })
      }),
    [],
  )

  if (state.status === 'loading') return <div className="center-screen"><div className="spinner" /></div>
  if (state.status === 'signedOut') return <SignIn />
  if (state.needsName) {
    return <Welcome onDone={() => setState({ ...state, needsName: false })} />
  }

  return (
    <SessionContext.Provider value={{ userId: state.userId }}>
      <Shell />
    </SessionContext.Provider>
  )
}

function Shell() {
  const location = useLocation()
  // These are all single steps with their own way out, so the tabs would only be a
  // way to lose your place halfway through.
  const hideTabs = /\/(log|edit)$/.test(location.pathname) || location.pathname.startsWith('/join/')
  return (
    <>
      {backend.mode === 'demo' && (
        <div className="demo-banner">Demo mode: everything is saved on this device only.</div>
      )}
      <main className={hideTabs ? 'page' : 'page with-tabs'}>
        <Routes>
          <Route path="/" element={<Restaurants />} />
          <Route path="/r/:id" element={<RestaurantPage />} />
          <Route path="/r/:id/log" element={<LogVisit />} />
          <Route path="/r/:id/visits/:visitId/edit" element={<LogVisit />} />
          <Route path="/join/:code" element={<JoinInvite />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/people" element={<People />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <InstallNudge />
      {!hideTabs && (
        <nav className="tabbar">
          <NavLink to="/" end={false} className={({ isActive }) => (isActive || location.pathname.startsWith('/r/') ? 'active' : '')}>
            <TabIcon d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18M18 21V3c-2.5 1.4-4 4.5-4 8 0 2 1.5 3.5 4 3.5" />
            Restaurants
          </NavLink>
          <NavLink to="/feed">
            <TabIcon d="M4 5h16M4 10h16M4 15h10M4 20h7" />
            Feed
          </NavLink>
          <NavLink to="/people">
            <TabIcon d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6" />
            People
          </NavLink>
          <NavLink to="/profile">
            <TabIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />
            Profile
          </NavLink>
        </nav>
      )}
    </>
  )
}

function TabIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
