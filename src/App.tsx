import { Gate } from './components/Gate'
import { isInArea, useRoute } from './router'
import { useProgress } from './store/progress'
import { useSyncStatus, type SyncStatus } from './store/gistSync'
import { toggleActiveProfile, useActiveProfile } from './store/activeProfile'
import { isRecordingActive, useRecordingSession } from './audio/recordingSession'
import { Home } from './screens/Home'
import { Wall } from './screens/Wall'
import { Lesson } from './screens/Lesson'
import { HelpMyCube } from './screens/HelpMyCube'
import { BlindBox } from './screens/BlindBox'
import { SolveLog } from './screens/SolveLog'
import { Settings } from './screens/Settings'
import { PianoHome } from './screens/piano/PianoHome'
import { Record } from './screens/piano/Record'

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

/** Step 4 replaces this with the real parent-side ParentReview screen. */
function PianoReviewPlaceholder() {
  return (
    <div style={{ padding: '1rem' }}>
      <div className="cc-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>👀 Grown-up review is coming soon.</p>
      </div>
    </div>
  )
}

const SYNC_DOT_COLOR: Record<SyncStatus, string> = {
  off: '#c7cad9',
  loading: '#ff8a00',
  saving: '#ff8a00',
  saved: '#1fa953',
  offline: '#c7cad9',
  expired: '#e62b2b',
  error: '#e62b2b',
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
  if (path === '/piano/review') return <PianoReviewPlaceholder />
  return <Home />
}

function App() {
  const { path, navigate } = useRoute()
  const progress = useProgress()
  const syncStatus = useSyncStatus()
  const activeProfile = useActiveProfile()
  const recordingSession = useRecordingSession()

  const activeName =
    activeProfile === 'kid' ? progress.settings.kidName : progress.settings.parentName

  // Full-screen, no header/nav, while a piano take is actively being
  // recorded (not just while sitting on /piano/record in some other state).
  const hideChrome = path === '/piano/record' && isRecordingActive(recordingSession)

  return (
    <Gate>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    >
      {!hideChrome && (
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
        }}
      >
        <strong style={{ fontSize: '1.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeName}&apos;s Practice
        </strong>

        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 40, padding: '0.4rem 0.9rem', flexShrink: 0 }}
          onClick={toggleActiveProfile}
          aria-label={`Switch profile (currently ${activeName})`}
        >
          🔁 {activeProfile === 'kid' ? progress.settings.parentName : progress.settings.kidName}
        </button>

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
      )}

      <main style={{ flex: 1, overflow: 'auto' }}>
        <Screen path={path} />
      </main>

      {!hideChrome && (
      <nav
        className="cc-safe-bottom cc-safe-x"
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          gap: '0.25rem',
          padding: '0.5rem',
          background: 'var(--cc-surface)',
          borderTop: '1px solid var(--cc-border)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.area ? isInArea(path, item.area) : path === item.path
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
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
      )}
    </div>
    </Gate>
  )
}

export default App
