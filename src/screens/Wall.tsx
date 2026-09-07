import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router'
import { useProgress, update, type HoldProgress, type ProfileProgress } from '../store/progress'
import { useActiveProfile } from '../store/activeProfile'
import {
  estimateDaysToSummit,
  estimateMinutesRemaining,
  useSessionTimer,
  type HoldStagesSpec,
} from '../store/planner'
import { HOLD_ORDER, LESSON_LIST, type Lesson } from '../content/lessons'
import { fireConfetti } from '../components/Confetti'

const STAGE_IDS = ['learn', 'watch', 'try', 'spot', 'climb'] as const
const STAGE_LABEL: Record<(typeof STAGE_IDS)[number], string> = {
  learn: 'Learn',
  watch: 'Watch',
  try: 'Try',
  spot: 'Spot it',
  climb: 'Climb',
}

type HoldState = 'locked' | 'open' | 'mastered'

/**
 * Kid climbs the wall one hold at a time. Coach (the parent profile) gets
 * every hold unlocked from the start, so they can read ahead and learn the
 * method before teaching it.
 */
function holdState(profile: ProfileProgress, index: number, unlockAll: boolean): HoldState {
  const id = HOLD_ORDER[index]
  if (profile.holds[id]?.masteredAt) return 'mastered'
  if (unlockAll || index === 0) return 'open'
  const prevId = HOLD_ORDER[index - 1]
  return profile.holds[prevId]?.masteredAt ? 'open' : 'locked'
}

interface NextUp {
  lesson: Lesson
  stage: (typeof STAGE_IDS)[number]
}

/**
 * The very next thing to do: the first stage of the first hold that isn't
 * finished yet. Legacy docs saved before the Learn stage existed have no
 * 'learn' record, so a hold whose Watch is already done is never sent back to
 * Learn.
 */
function findNextUp(profile: ProfileProgress): NextUp | undefined {
  for (const lesson of LESSON_LIST) {
    const hold = profile.holds[lesson.id]
    if (hold?.masteredAt) continue
    const watched = Boolean(hold?.stages.watch?.completedAt)
    for (const stage of STAGE_IDS) {
      if (hold?.stages[stage]?.completedAt) continue
      if (stage === 'learn' && watched) continue
      return { lesson, stage }
    }
  }
  return undefined
}

/** Min star rating across all 4 stages - every stage has to shine for the hold to. */
function holdStars(hold: HoldProgress | undefined): 0 | 1 | 2 | 3 {
  const stars = STAGE_IDS.map((s) => hold?.stages[s]?.stars ?? 0)
  return Math.min(...stars) as 0 | 1 | 2 | 3
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function lastNDays(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    out.push(toISODate(d))
  }
  return out
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function RingTimer({ progress, label }: { progress: number; label: string }) {
  const size = 96
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <svg width={size} height={size} role="img" aria-label={label} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cc-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--cc-primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 250ms linear' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="1rem" fontWeight={800} fill="var(--cc-ink)">
        {label}
      </text>
    </svg>
  )
}

function updateStreakAndLogSession(profileId: 'kid' | 'parent', minutes: number): void {
  const today = toISODate(new Date())
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const already = profile.sessions.some((s) => s.day === today)
    const yesterday = toISODate(new Date(Date.now() - 86400000))
    let streak = profile.streak
    if (!already) {
      let current: number
      if (profile.streak.lastDay === yesterday) current = profile.streak.current + 1
      else if (profile.streak.lastDay === today) current = profile.streak.current
      else current = 1
      streak = { current, best: Math.max(profile.streak.best, current), lastDay: today }
    }
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        sessions: already
          ? profile.sessions
          : [...profile.sessions, { day: today, minutes, stagesDone: 0 }],
        streak,
      },
    }
  })
}

export function Wall() {
  const progressDoc = useProgress()
  const activeProfile = useActiveProfile()
  const profile = progressDoc.profiles[activeProfile]
  const kidName = progressDoc.settings.kidName
  const sessionMinutes = progressDoc.settings.sessionMinutes
  const timer = useSessionTimer(sessionMinutes)
  const [celebrating, setCelebrating] = useState(false)
  const [hasCelebratedThisRun, setHasCelebratedThisRun] = useState(false)

  useEffect(() => {
    if (timer.reachedTarget && !hasCelebratedThisRun) {
      setHasCelebratedThisRun(true)
      setCelebrating(true)
      timer.pause()
      fireConfetti('big')
      updateStreakAndLogSession(activeProfile, sessionMinutes)
    }
  }, [timer.reachedTarget, hasCelebratedThisRun, activeProfile, sessionMinutes, timer])

  const holdSpecs: HoldStagesSpec[] = useMemo(
    () => LESSON_LIST.map((l) => ({ id: l.id, stages: [...STAGE_IDS] })),
    [],
  )
  const daysToSummit = estimateDaysToSummit(profile, holdSpecs, sessionMinutes)
  const week = lastNDays(7)
  const sessionDays = useMemo(() => new Set(profile.sessions.map((s) => s.day)), [profile.sessions])

  const wallOrder = HOLD_ORDER.map((_id, i) => i).reverse() // summit at top
  const unlockAll = activeProfile === 'parent'
  const nextUp = findNextUp(profile)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      {nextUp ? (
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          onClick={() => navigate(`/lesson/${nextUp.lesson.id}`)}
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '0.2rem',
            padding: '0.9rem 1.1rem',
            minHeight: 72,
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.85 }}>
            Continue: Hold {nextUp.lesson.number} · {nextUp.lesson.title}
          </span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>
            {STAGE_LABEL[nextUp.stage]} ▶
          </span>
        </button>
      ) : (
        <div className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>You did it, {kidName}! 🏔️</strong>
          <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 700 }}>
            Every hold is mastered. Try Help with my cube on a real scramble, or beat your best time.
          </span>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="cc-btn cc-btn-primary" onClick={() => navigate('/help')}>
              🧩 Help with my cube
            </button>
            <button type="button" className="cc-btn cc-btn-surface" onClick={() => navigate('/solves')}>
              ⏱ Beat your time
            </button>
          </div>
        </div>
      )}

      <div className="cc-card" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}>
          <span aria-hidden="true">🔥</span>
          <span>{profile.streak.current}-day streak</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}>
          <span aria-hidden="true">⭐</span>
          <span>{profile.xp} XP</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/box')}
          className="cc-btn cc-btn-surface"
          style={{ marginLeft: 'auto', gap: '0.5rem', padding: '0.4rem 0.75rem', minHeight: 40 }}
          aria-label="Open the Blind Box screen"
        >
          <span>🟡{profile.tokens.gold}</span>
          <span>⚪{profile.tokens.silver}</span>
          <span>🟤{profile.tokens.bronze}</span>
        </button>
      </div>

      <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Today&apos;s climb</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <RingTimer
            progress={timer.elapsedSec / (sessionMinutes * 60)}
            label={formatClock(timer.elapsedSec)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {!timer.running ? (
                <button type="button" className="cc-btn cc-btn-primary" onClick={timer.start}>
                  ▶ Start
                </button>
              ) : (
                <button type="button" className="cc-btn cc-btn-surface" onClick={timer.pause}>
                  ⏸ Pause
                </button>
              )}
            </div>
            <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 700, fontSize: '0.9rem' }}>
              Goal: {sessionMinutes} min
            </span>
            <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 700, fontSize: '0.9rem' }}>
              {Number.isFinite(daysToSummit)
                ? `About ${daysToSummit} more day${daysToSummit === 1 ? '' : 's'} to the summit!`
                : `Keep climbing, ${kidName}!`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }} aria-label="This week's practice days">
          {week.map((day) => (
            <span
              key={day}
              title={day}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: sessionDays.has(day) ? 'var(--cc-success)' : 'var(--cc-border)',
              }}
            />
          ))}
        </div>
      </div>

      <div
        className="cc-card"
        style={{
          padding: '1.25rem 1rem',
          background: 'linear-gradient(180deg, #cfe8ff 0%, #eef4ff 55%, #f7efe0 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0.25rem', fontSize: '1.1rem' }}>
          {activeProfile === 'kid' ? `${kidName}'s Wall` : `${progressDoc.settings.parentName}'s Wall`}
        </h2>
        {wallOrder.map((index, rowPos) => {
          const lesson = LESSON_LIST[index]
          const state = holdState(profile, index, unlockAll)
          const stars = holdStars(profile.holds[lesson.id])
          const remainingMinutes =
            state !== 'mastered'
              ? estimateMinutesRemaining(profile, [{ id: lesson.id, stages: [...STAGE_IDS] }])
              : 0
          const isLast = rowPos === wallOrder.length - 1
          return (
            <div key={lesson.id} style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40 }}>
                <div
                  style={{
                    width: 3,
                    flex: 1,
                    background: rowPos === 0 ? 'transparent' : 'var(--cc-accent)',
                    minHeight: 8,
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '0.85rem',
                    color: state === 'locked' ? 'var(--cc-ink-soft)' : '#fff',
                    background:
                      state === 'mastered'
                        ? 'var(--cc-success)'
                        : state === 'open'
                          ? 'var(--cc-primary)'
                          : 'var(--cc-border)',
                    flexShrink: 0,
                  }}
                >
                  {state === 'locked' ? '🔒' : state === 'mastered' ? '✓' : lesson.number}
                </div>
                <div
                  style={{
                    width: 3,
                    flex: 1,
                    background: isLast ? 'transparent' : 'var(--cc-accent)',
                    minHeight: 8,
                  }}
                />
              </div>

              <button
                type="button"
                disabled={state === 'locked'}
                onClick={() => navigate(`/lesson/${lesson.id}`)}
                className="cc-btn cc-btn-surface"
                style={{
                  flex: 1,
                  margin: '0.4rem 0 0.4rem 0.6rem',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.15rem',
                  minHeight: 64,
                }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 800 }}>{lesson.title}</span>
                {state === 'mastered' ? (
                  <span aria-label={`${stars} stars`} style={{ fontSize: '0.85rem' }}>
                    {'⭐'.repeat(stars) || '—'}
                  </span>
                ) : state === 'open' ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)', fontWeight: 700 }}>
                    ~{remainingMinutes} min to go
                  </span>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)', fontWeight: 700 }}>
                    Master the hold below first
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {celebrating && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Session complete"
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
          <div
            className="cc-card"
            style={{ padding: '1.75rem', maxWidth: 360, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Great climbing today, {kidName}! 🎉</h2>
            <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>
              You practiced for {sessionMinutes} minutes. Streak: {profile.streak.current} day
              {profile.streak.current === 1 ? '' : 's'}!
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                onClick={() => {
                  timer.reset()
                  setHasCelebratedThisRun(false)
                  setCelebrating(false)
                }}
              >
                One more?
              </button>
              <button type="button" className="cc-btn cc-btn-primary" onClick={() => setCelebrating(false)}>
                Done for today
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
