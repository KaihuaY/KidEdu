import { useEffect, useState } from 'react'
import { useProgress } from '../store/progress'
import { useActiveProfile } from '../store/activeProfile'
import { logSolve } from '../store/solves'
import { fireConfetti } from '../components/Confetti'

function formatTime(totalMs: number): string {
  const totalCentis = Math.floor(totalMs / 10)
  const minutes = Math.floor(totalCentis / 6000)
  const seconds = Math.floor((totalCentis % 6000) / 100)
  const centis = totalCentis % 100
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function SolveLog() {
  const progress = useProgress()
  const activeProfile = useActiveProfile()
  const [running, setRunning] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [celebration, setCelebration] = useState<string | null>(null)

  useEffect(() => {
    if (!running || startedAt === null) return
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 30)
    return () => clearInterval(id)
  }, [running, startedAt])

  const mySolves = progress.solveLog.solves
    .filter((s) => s.profile === activeProfile)
    .sort((a, b) => b.at - a.at)
  const timedSolves = mySolves.filter((s) => s.seconds !== null)
  const bestSeconds = timedSolves.length > 0 ? Math.min(...timedSolves.map((s) => s.seconds as number)) : null
  const isFirstSolveEver = mySolves.length === 0

  function start() {
    setStartedAt(Date.now())
    setElapsedMs(0)
    setRunning(true)
  }

  function finish(withTime: boolean) {
    const seconds = withTime && startedAt !== null ? (Date.now() - startedAt) / 1000 : null
    setRunning(false)
    setStartedAt(null)
    const { firstEverForProfile } = logSolve(activeProfile, seconds)
    fireConfetti(firstEverForProfile ? 'big' : 'small')
    setCelebration(
      firstEverForProfile
        ? `${progress.settings.kidName}'s very first logged solve! 🏆 A gold token is yours!`
        : 'Nice solve! 🎉 A silver token is yours.',
    )
    setElapsedMs(0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Solve Log</h1>

      {isFirstSolveEver && (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)' }}>
          Log your very first solve to earn a gold token!
        </div>
      )}

      <div className="cc-card" style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <span style={{ fontSize: '2.5rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(elapsedMs)}
        </span>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!running ? (
            <button type="button" className="cc-btn cc-btn-primary" onClick={start}>
              ▶ Start
            </button>
          ) : (
            <>
              <button type="button" className="cc-btn cc-btn-surface" onClick={() => setRunning(false)}>
                ⏸ Stop
              </button>
              <button type="button" className="cc-btn cc-btn-primary" onClick={() => finish(true)}>
                I solved it! ✅
              </button>
            </>
          )}
          {!running && (
            <button type="button" className="cc-btn cc-btn-surface" onClick={() => finish(false)}>
              Log without time
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div className="cc-card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{mySolves.length}</div>
          <div style={{ color: 'var(--cc-ink-soft)', fontWeight: 700, fontSize: '0.85rem' }}>Total solves</div>
        </div>
        <div className="cc-card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>
            {bestSeconds !== null ? formatTime(bestSeconds * 1000) : '—'}
          </div>
          <div style={{ color: 'var(--cc-ink-soft)', fontWeight: 700, fontSize: '0.85rem' }}>Best time</div>
        </div>
      </div>

      <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem' }}>History</h2>
        {mySolves.length === 0 && <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No solves logged yet.</p>}
        {mySolves.map((s, i) => (
          <div
            key={`${s.at}-${i}`}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--cc-border)' }}
          >
            <span>{formatDate(s.at)}</span>
            <span style={{ fontWeight: 700 }}>{s.seconds !== null ? formatTime(s.seconds * 1000) : 'no time'}</span>
          </div>
        ))}
      </div>

      {celebration && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,18,43,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 50,
          }}
        >
          <div className="cc-card" style={{ padding: '1.75rem', maxWidth: 340, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{celebration}</h2>
            <button type="button" className="cc-btn cc-btn-primary" onClick={() => setCelebration(null)}>
              Yay!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
