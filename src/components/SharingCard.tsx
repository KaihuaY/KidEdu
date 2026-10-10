import { navigate } from '../router'
import { getToken, useLastSavedAt, useSyncStatus } from '../store/gistSync'
import { kidDisplayName } from '../store/kid'
import { agoLabel } from '../utils/standalone'

const STALE_MS = 3 * 86_400_000

/**
 * Home-screen notice when this device is NOT sharing progress with the
 * family: no sync key, an expired key, or nothing confirmed saved for days.
 * Renders nothing while sharing works - the family board takes that spot.
 * Exists because a grey 12px dot in the header was all that told a grown-up
 * that Amelia's iPad had never sent a single take.
 */
export function SharingCard() {
  const status = useSyncStatus()
  const lastSavedAt = useLastSavedAt()
  const hasToken = Boolean(getToken())
  const stale = hasToken && lastSavedAt !== null && Date.now() - lastSavedAt > STALE_MS && status !== 'saved' && status !== 'saving'

  let title: string | null = null
  let detail = ''
  if (!hasToken) {
    title = '👭 Not sharing with the family yet'
    detail = `${kidDisplayName()}'s practice stays on this iPad until a grown-up adds the sync key in Settings.`
  } else if (status === 'expired') {
    title = '⛔ Sharing has stopped'
    detail = 'The sync key has expired. A grown-up can paste a new one in Settings.'
  } else if (stale) {
    title = '☁️ Sharing may be stuck'
    detail = `Last shared ${agoLabel(lastSavedAt!)}. Check the internet connection, or ask a grown-up to look in Settings.`
  }
  if (!title) return null

  return (
    <button
      type="button"
      data-testid="sharing-card"
      className="cc-card"
      onClick={() => navigate('/settings')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        padding: '0.9rem 1rem',
        width: '100%',
        minHeight: 56,
        textAlign: 'left',
        border: '2px solid var(--cc-accent)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'var(--cc-ink)',
        background: 'var(--cc-tint-warm)',
      }}
    >
      <span style={{ fontWeight: 800 }}>{title}</span>
      <span style={{ fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>{detail} Tap to open Settings.</span>
    </button>
  )
}
