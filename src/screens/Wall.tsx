import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router'
import { useProgress, type HoldProgress, type ProfileProgress } from '../store/progress'
import { lastNDays, logCubeSession, formatClock } from '../store/sessions'
import { estimateDaysToSummit, estimateMinutesRemaining, useSessionTimer, type HoldMissionsSpec } from '../store/planner'
import { firstOpenMission, missionsDoneCount, missionStars } from '../store/missions'
import { ensureTodaysPlan } from '../store/dailyPlan'
import { HOLD_ORDER, LESSON_LIST, missionById, type Lesson } from '../content/lessons'
import { fireConfetti } from '../components/Confetti'
import { CubeTabs } from '../components/CubeTabs'
import { RingTimer } from '../components/RingTimer'
import { WeekDots } from '../components/WeekDots'
import { TokenPill } from '../components/TokenPill'

type HoldState = 'locked' | 'open' | 'mastered'

/** Kid climbs the wall one hold at a time - each one unlocks once the previous is mastered. */
function holdState(profile: ProfileProgress, index: number): HoldState {
  const id = HOLD_ORDER[index]
  if (profile.holds[id]?.masteredAt) return 'mastered'
  if (index === 0) return 'open'
  const prevId = HOLD_ORDER[index - 1]
  return profile.holds[prevId]?.masteredAt ? 'open' : 'locked'
}

interface NextUp {
  lesson: Lesson
  missionId: string
}

/** The very next thing to do: the first open mission of the first hold that isn't mastered yet. */
function findNextUp(profile: ProfileProgress): NextUp | undefined {
  for (const lesson of LESSON_LIST) {
    const hold = profile.holds[lesson.id]
    if (hold?.masteredAt) continue
    const missionIds = lesson.missions.map((m) => m.id)
    const openId = firstOpenMission(hold, missionIds)
    if (openId) return { lesson, missionId: openId }
  }
  return undefined
}

function holdSpecFor(lesson: Lesson): HoldMissionsSpec {
  return { id: lesson.id, missions: lesson.missions.map((m) => ({ id: m.id, estimatedMinutes: m.estimatedMinutes })) }
}

export function Wall() {
  const progressDoc = useProgress()
  const profile = progressDoc.profiles.kid
  const kidName = progressDoc.settings.kidName
  const sessionMinutes = progressDoc.settings.goalMinutes.cube
  const timer = useSessionTimer(sessionMinutes)
  const [celebrating, setCelebrating] = useState(false)
  const [hasCelebratedThisRun, setHasCelebratedThisRun] = useState(false)

  useEffect(() => {
    if (timer.reachedTarget && !hasCelebratedThisRun) {
      setHasCelebratedThisRun(true)
      setCelebrating(true)
      timer.pause()
      fireConfetti('big')
      logCubeSession('kid', sessionMinutes)
    }
  }, [timer.reachedTarget, hasCelebratedThisRun, sessionMinutes, timer])

  const holdSpecs: HoldMissionsSpec[] = useMemo(() => LESSON_LIST.map(holdSpecFor), [])
  const daysToSummit = estimateDaysToSummit(profile, holdSpecs, sessionMinutes)
  const week = lastNDays(7)
  const sessionDays = useMemo(() => new Set(profile.sessions.map((s) => s.day)), [profile.sessions])

  const wallOrder = HOLD_ORDER.map((_id, i) => i).reverse() // summit at top
  const plan = ensureTodaysPlan()
  const planMissionMeta = plan.mission ? missionById(plan.mission.holdId, plan.mission.missionId) : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2rem' }}>
      <CubeTabs />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0 1rem' }}>
      <div className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Today&apos;s climb</h2>
        {plan.allDone ? (
          <>
            <strong style={{ fontSize: '1.05rem' }}>You did it, {kidName}! 🏔️</strong>
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
          </>
        ) : plan.mission?.doneAt ? (
          <>
            <strong style={{ fontSize: '1.05rem' }}>
              That&apos;s today&apos;s climb, {kidName}! 🎉 Come back tomorrow.
            </strong>
            <button
              type="button"
              className="cc-btn cc-btn-surface"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                const more = findNextUp(profile)
                if (more) navigate(`/lesson/${more.lesson.id}/${more.missionId}`)
              }}
            >
              Climb one more ▶
            </button>
          </>
        ) : (
          <>
            {plan.warmup && (
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ justifyContent: 'flex-start', minHeight: 56, textAlign: 'left' }}
                onClick={() => navigate(`/lesson/${plan.warmup!.holdId}/${plan.warmup!.missionId}/warmup`)}
              >
                {plan.warmup.doneAt ? '✅' : '🔁'} Warm-up · {plan.warmup.title} · 1 min
              </button>
            )}
            {plan.mission && (
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                style={{ justifyContent: 'flex-start', minHeight: 56, textAlign: 'left' }}
                onClick={() => navigate(`/lesson/${plan.mission!.holdId}/${plan.mission!.missionId}`)}
              >
                ⭐ New · {plan.mission.title}
                {planMissionMeta ? ` · ~${planMissionMeta.estimatedMinutes} min` : ''}
              </button>
            )}
          </>
        )}
      </div>

      <div className="cc-card" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}>
          <span aria-hidden="true">🔥</span>
          <span>{profile.streak.current}-day streak</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}>
          <span aria-hidden="true">⭐</span>
          <span>{profile.xp} XP</span>
        </div>
        <TokenPill tokens={profile.tokens} style={{ marginLeft: 'auto' }} />
      </div>

      <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Climbing timer</h2>
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

        <WeekDots days={week} done={sessionDays} />
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
        <h2 style={{ margin: '0 0 0.5rem 0.25rem', fontSize: '1.1rem' }}>{kidName}&apos;s Wall</h2>
        {wallOrder.map((index, rowPos) => {
          const lesson = LESSON_LIST[index]
          const state = holdState(profile, index)
          const hold: HoldProgress | undefined = profile.holds[lesson.id]
          const missionIds = lesson.missions.map((m) => m.id)
          const done = missionsDoneCount(hold, missionIds)
          const stars = missionStars(hold, missionIds)
          const nextOpenId = firstOpenMission(hold, missionIds)
          const nextOpenTitle = nextOpenId ? missionById(lesson.id, nextOpenId)?.title : undefined
          const remainingMinutes =
            state !== 'mastered' ? estimateMinutesRemaining(profile, [holdSpecFor(lesson)]) : 0
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)', fontWeight: 700 }}>
                    All done {'⭐'.repeat(Math.max(stars, 1))}
                  </span>
                ) : state === 'open' ? (
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--cc-ink-soft)',
                      fontWeight: 700,
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {done}/{missionIds.length} missions
                    {nextOpenTitle ? ` · Next: ${nextOpenTitle}` : ''} · ~{remainingMinutes} min to go
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
