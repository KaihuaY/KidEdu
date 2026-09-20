import { useEffect, useState, type CSSProperties } from 'react'
import type { PianoTake } from '../store/progress'
import { useCoachStage } from '../store/coach'

/** After this long with no written feedback, the skeleton keeps its text but stops pulsing. */
const SKELETON_STILL_MS = 8000

/** Three gently pulsing dots plus a waiting line - respects prefers-reduced-motion via the app-wide `cc-pulse` rule. */
function CoachSkeleton() {
  const [stillPulsing, setStillPulsing] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setStillPulsing(false), SKELETON_STILL_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.9rem' }}>Coach is looking at your playing…</span>
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: '0.2rem' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={stillPulsing ? 'cc-pulse' : undefined}
            style={
              {
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--cc-ink-soft)',
                animationDelay: stillPulsing ? `${i * 0.15}s` : undefined,
                opacity: stillPulsing ? undefined : 0.55,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </div>
  )
}

const compactClampStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: 'var(--cc-ink-soft)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

/**
 * Kid-facing coach feedback for one take: the praise + "try next" once the
 * engine has written it, a gentle skeleton while it's still working, and
 * nothing at all for a grown-up's voice note or before analysis has even
 * started. Never renders `take.ai.parent` or any raw metric - that text is
 * parent-only and lives in CoachNote instead.
 */
export function CoachCard({ take, compact = false }: { take: PianoTake; compact?: boolean }) {
  const stage = useCoachStage(take.id)

  if (take.isNote) return null

  const kid = take.ai?.kid

  if (!kid) {
    const isWorking = stage === 'analyzing' || stage === 'writing'
    if (!isWorking) return null

    if (compact) {
      return (
        <div data-testid="coach-card">
          <CoachSkeleton />
        </div>
      )
    }

    return (
      <div className="cc-card" data-testid="coach-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <strong>🎧 Coach</strong>
        <CoachSkeleton />
      </div>
    )
  }

  if (compact) {
    return (
      <p data-testid="coach-card" style={compactClampStyle}>
        <span aria-hidden="true">🎧 </span>
        <span data-testid="coach-praise">{kid.praise}</span>
      </p>
    )
  }

  return (
    <div className="cc-card" data-testid="coach-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <strong>🎧 Coach</strong>
      <p data-testid="coach-praise" style={{ margin: 0 }}>
        {kid.praise}
      </p>
      <p
        data-testid="coach-try"
        style={{
          margin: 0,
          fontWeight: 800,
          color: 'var(--cc-primary)',
          background: 'var(--cc-bg)',
          padding: '0.6rem 0.85rem',
          borderRadius: '0.75rem',
        }}
      >
        Next time, try: {kid.tryNext}
      </p>
    </div>
  )
}
