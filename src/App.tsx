import { useEffect, useRef, useState } from 'react'
import { Gate } from './components/Gate'
import { isInArea, useRoute } from './router'
import { useProgress } from './store/progress'
import { useSyncStatus, type SyncStatus } from './store/gistSync'
import { RecordingBanner } from './components/RecordingBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { Home } from './screens/Home'
import { Wall } from './screens/Wall'
import { Lesson } from './screens/Lesson'
import { HelpMyCube } from './screens/HelpMyCube'
import { BlindBox } from './screens/BlindBox'
import { SolveLog } from './screens/SolveLog'
import { Settings } from './screens/Settings'
import { PianoHome } from './screens/piano/PianoHome'
import { Record } from './screens/piano/Record'
import { ParentReview } from './screens/piano/ParentReview'

interface NavItem {
  path: string
  label: string
  emoji: string
  /** For Cube/Piano, the whole area (not just the exact path) counts as active - see isInArea(). */
  area?: 'cube' | 'piano'
}

const NAV_ITEMS: NavItem[] = [
  { path: '/home', label: 'Home', emoji: '🏠' },
  { path: '/cube', label: 'Cube', emoji: '🧊', area: 'cube' },
  { path: '/piano', label: 'Piano', emoji: '🎹', area: 'piano' },
  { path: '/box', label: 'Box', emoji: '🎁' },
  { path: '/settings', label: 'Settings', emoji: '⚙️' },
]

const SYNC_DOT_COLOR: Record<SyncStatus, string> = {
  off: '#c7cad9',
  loading: '#ff8a00',
  saving: '#ff8a00',
  saved: '#1fa953',
  offline: '#c7cad9',
  expired: '#e62b2b',
  error: '#e62b2b',
}

// The Cube and Piano tabs go back to wherever she was inside that area
// (a mission mid-step, the parent review, ...) instead of the area's home.
// Tapping the tab of the area she is already in goes to that area's home.
const LAST_PATH_PREFIX = 'cubeclimb.lastPath.'

function rememberAreaPath(path: string): void {
  for (const area of ['cube', 'piano'] as const) {
    if (!isInArea(path, area)) continue
    // The live recording screen is reached through the recording banner, not the tab.
    if (path === '/piano/record') return
    try {
      sessionStorage.setItem(LAST_PATH_PREFIX + area, path)
    } catch {
      // ignore
    }
  }
}

function lastAreaPath(area: 'cube' | 'piano'): string | null {
  try {
    return sessionStorage.getItem(LAST_PATH_PREFIX + area)
  } catch {
    return null
  }
}

function Screen({ path }: { path: string }) {
  if (path === '/home') return <Home />
  if (path === '/cube' || path === '/wall') return <Wall />
  if (path === '/help') return <HelpMyCube />
  if (path === '/box') return <BlindBox />
  if (path === '/solves') return <SolveLog />
  if (path === '/settings') return <Settings />
  if (path.startsWith('/lesson/')) return <Lesson />
  if (path === '/piano') return <PianoHome />
  if (path === '/piano/record') return <Record />
  if (path === '/piano/review') return <ParentReview />
  return <Home />
}

function App() {
  const { path, navigate } = useRoute()
  const progress = useProgress()
  const syncStatus = useSyncStatus()
  const mainRef = useRef<HTMLElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  // The bottom stack (banners + menu) is position: fixed so it stays on
  // screen no matter which element ends up scrolling on a given browser;
  // <main> gets matching bottom padding so nothing hides behind it.
  const [bottomHeight, setBottomHeight] = useState(80)

  useEffect(() => {
    const el = bottomRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setBottomHeight(el.getBoundingClientRect().height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // <main> is the only scrolling region now (see .cc-app-shell) - jump it
  // back to the top on every route change, same as a fresh page would.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    rememberAreaPath(path)
  }, [path])

  return (
    <Gate>
    <div className="cc-app-shell">
      <header
        className="cc-safe-top cc-safe-x"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'var(--cc-surface)',
          borderBottom: '1px solid var(--cc-border)',
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: '1.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {progress.settings.kidName}&apos;s Practice
        </strong>

        <span
          title={`Sync: ${syncStatus}`}
          aria-label={`Sync status: ${syncStatus}`}
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: SYNC_DOT_COLOR[syncStatus],
            flexShrink: 0,
          }}
        />
      </header>

      <main
        ref={mainRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: bottomHeight }}
      >
        <Screen path={path} />
      </main>

      <div ref={bottomRef} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40 }}>
      <RecordingBanner path={path} />
      <UpdateBanner path={path} />

      <nav
        className="cc-safe-bottom cc-safe-x"
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          gap: '0.25rem',
          padding: '0.5rem',
          background: 'var(--cc-surface)',
          borderTop: '1px solid var(--cc-border)',
          flexShrink: 0,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.area ? isInArea(path, item.area) : path === item.path
          const target = item.area && !active ? (lastAreaPath(item.area) ?? item.path) : item.path
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(target)}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.15rem',
                minHeight: 'var(--cc-touch)',
                minWidth: 56,
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderRadius: '0.75rem',
                color: active ? 'var(--cc-primary)' : 'var(--cc-ink-soft)',
                fontWeight: active ? 800 : 600,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '1.3rem' }} aria-hidden="true">
                {item.emoji}
              </span>
              <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
      </div>
    </div>
    </Gate>
  )
}

export default App
