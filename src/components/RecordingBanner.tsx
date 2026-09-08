import { navigate } from '../router'
import { isRecordingActive, stopTake, useRecordingSession } from '../audio/recordingSession'

/**
 * Persistent reminder shown above the bottom nav whenever a piano take is
 * still recording but the kid has wandered off to another screen (the
 * bottom nav is always visible now - see App.tsx - so that's easy to do by
 * accident). The recording session itself is a module-level singleton (see
 * audio/recordingSession.ts) and keeps running regardless of what's
 * mounted, so nothing here is needed to protect the take - this is purely
 * so she doesn't forget it's still going.
 */
export function RecordingBanner({ path }: { path: string }) {
  const session = useRecordingSession()
  if (!isRecordingActive(session) || path === '/piano/record') return null

  function handleStop() {
    void stopTake('user').then(() => navigate('/piano/record'))
  }

  return (
    <div
      className="cc-safe-x"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.6rem',
        flexWrap: 'wrap',
        padding: '0.6rem 1rem',
        background: 'var(--cc-accent)',
        color: '#2b1900',
      }}
    >
      <strong style={{ fontSize: '0.95rem' }}>🎙️ Still recording… ⏹ Stop</strong>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 44, padding: '0.4rem 0.9rem' }}
          onClick={() => navigate('/piano/record')}
        >
          Go back
        </button>
        <button
          type="button"
          className="cc-btn"
          style={{ minHeight: 44, padding: '0.4rem 0.9rem', background: '#2b1900', color: '#fff' }}
          onClick={handleStop}
        >
          ⏹ Stop
        </button>
      </div>
    </div>
  )
}
