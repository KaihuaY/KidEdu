import { useEffect, useState } from 'react'
import { useRoute, navigate } from '../router'
import { TwistyCube, type TwistyCubeProps } from '../components/TwistyCube'
import { SayIt } from '../components/SayIt'
import { fireConfetti } from '../components/Confetti'
import { OrientationRitual, hasAckedRitual } from '../components/OrientationRitual'
import { MissionPlayer } from '../components/MissionPlayer'
import {
  lessonById,
  missionById,
  nextHoldId,
  nextMissionId,
  LESSON_LIST,
  type Checkpoint,
  type Lesson as LessonContent,
  type Mission,
  type MissionCard,
} from '../content/lessons'
import { getDoc, useProgress, type HelpKind, type HoldProgress } from '../store/progress'
import {
  completeMission,
  completeWarmup,
  isMissionDone,
  isMissionUnlocked,
  masterHold,
  missionsDoneCount,
} from '../store/missions'
import { ensureTodaysPlan, tomorrowsMission } from '../store/dailyPlan'
import type { Tier } from '../store/rewards'

/** A page shared with someone else, or copied to the clipboard when the Web Share API isn't available. */
type ShareNavigator = Navigator & {
  share?: (data: { text?: string; title?: string; url?: string }) => Promise<void>
}

// ---------------------------------------------------------------------------
// Checkpoints - "before you start this hold, your cube should look like X"
// (unchanged from the pre-mission curriculum: a once-per-session Ready? gate)
// ---------------------------------------------------------------------------

const CHECKPOINT_ACK_PREFIX = 'cubeclimb.checkpoint.'

function hasAckedCheckpoint(holdId: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    return sessionStorage.getItem(CHECKPOINT_ACK_PREFIX + holdId) === '1'
  } catch {
    return false
  }
}

function ackCheckpoint(holdId: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(CHECKPOINT_ACK_PREFIX + holdId, '1')
  } catch {
    // ignore - the Ready card will just ask again next time, which is fine
  }
}

function CheckpointPicture({ checkpoint, tempoScale }: { checkpoint: Checkpoint; tempoScale: number }) {
  if (!checkpoint.display) return null
  return (
    <div className="cc-card" style={{ height: 260, padding: '0.5rem' }}>
      <TwistyCube
        setupAlg={checkpoint.display.setupAlg}
        alg={checkpoint.display.alg}
        stickering={checkpoint.stickering as TwistyCubeProps['stickering']}
        backView={checkpoint.backView ? 'top-right' : 'none'}
        tempoScale={tempoScale}
        controls="none"
      />
    </div>
  )
}

/** The Ready? gate shown before a hold with a checkpoint, once per session. */
function CheckpointGate({
  lesson,
  tempoScale,
  onReady,
}: {
  lesson: LessonContent
  tempoScale: number
  onReady: () => void
}) {
  const [showFallback, setShowFallback] = useState(false)
  const checkpoint = lesson.checkpoint!
  const fallback = checkpoint.fallbackHoldId ? lessonById(checkpoint.fallbackHoldId) : undefined

  return (
    <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Ready for {lesson.title}?</h2>
        <SayIt text={checkpoint.say} />
      </div>
      <CheckpointPicture checkpoint={checkpoint} tempoScale={tempoScale} />
      <p style={{ margin: 0, fontWeight: 700 }}>Your cube should look like this: {checkpoint.look}</p>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>Hold it like this: {checkpoint.hold}</p>

      {!showFallback ? (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            style={{ flex: 1, minWidth: 160 }}
            onClick={() => {
              ackCheckpoint(lesson.id)
              onReady()
            }}
          >
            ✅ Yes, let&apos;s climb
          </button>
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            style={{ flex: 1, minWidth: 160 }}
            onClick={() => setShowFallback(true)}
          >
            🤔 Not yet
          </button>
        </div>
      ) : (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>No worries! Let&apos;s fix that first.</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {fallback && (
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                onClick={() => navigate(`/lesson/${fallback.id}`)}
              >
                Go back to {fallback.title}
              </button>
            )}
            <a href="#/help" className="cc-btn cc-btn-surface" style={{ textDecoration: 'none' }}>
              🧩 Help my cube
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/** Reused once a hold is mastered: a preview of the next wall's starting checkpoint. */
function WhatsNextCard({ nextLesson, tempoScale }: { nextLesson: LessonContent; tempoScale: number }) {
  const checkpoint = nextLesson.checkpoint
  return (
    <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Next: {nextLesson.title} ▶</h2>
      {checkpoint && (
        <>
          <CheckpointPicture checkpoint={checkpoint} tempoScale={tempoScale} />
          <p style={{ margin: 0, fontWeight: 700 }}>Your cube will look like this: {checkpoint.look}</p>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>Hold it like this: {checkpoint.hold}</p>
        </>
      )}
      <button type="button" className="cc-btn cc-btn-primary" onClick={() => navigate(`/lesson/${nextLesson.id}`)}>
        Next: {nextLesson.title} ▶
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mission list
// ---------------------------------------------------------------------------

function medalFor(hold: HoldProgress | undefined, mission: Mission): string {
  const record = hold?.missions?.[mission.id]
  if (record?.tier === 'gold') return '🥇'
  if (record?.tier === 'silver') return '🥈'
  if (record?.tier === 'bronze') return '🥉'
  if (hold?.masteredAt) return '✅'
  return ''
}

function MissionList({ lesson, hold }: { lesson: LessonContent; hold: HoldProgress | undefined }) {
  const missionIds = lesson.missions.map((m) => m.id)
  const done = missionsDoneCount(hold, missionIds)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
        {done} / {missionIds.length} missions done
      </p>
      {lesson.missions.map((mission, i) => {
        const doneThis = isMissionDone(hold, mission.id)
        const unlocked = isMissionUnlocked(hold, missionIds, mission.id)
        const medal = medalFor(hold, mission)
        return (
          <button
            key={mission.id}
            type="button"
            disabled={!unlocked}
            onClick={() => navigate(`/lesson/${lesson.id}/${mission.id}`)}
            className="cc-btn cc-btn-surface"
            style={{
              minHeight: 64,
              justifyContent: 'flex-start',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '0.85rem',
                color: unlocked ? '#fff' : 'var(--cc-ink-soft)',
                background: doneThis ? 'var(--cc-success)' : unlocked ? 'var(--cc-primary)' : 'var(--cc-border)',
              }}
            >
              {unlocked ? i + 1 : '🔒'}
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span style={{ fontWeight: 800 }}>{mission.title}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)', fontWeight: 700 }}>
                ~{mission.estimatedMinutes} min
              </span>
            </span>
            {medal && (
              <span aria-hidden="true" style={{ fontSize: '1.3rem' }}>
                {medal}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface Celebration {
  message: string
  tier?: Tier
  holdMastered: boolean
  /** Set only when the finished mission was today's planned one - the next mission's Look picture. */
  teaser?: { title: string; look: MissionCard }
}

function tierMessage(tier: Tier, who: string): string {
  if (tier === 'gold') return `Gold token! ${who}, you did it all by yourself 🥇`
  if (tier === 'silver') return `Silver token! ${who}, you checked with the camera 🥈`
  return `Bronze token! ${who}, we did it together 🥉`
}

export function Lesson() {
  const { params, path } = useRoute()
  const lesson = lessonById(params.id ?? '')
  const missionId = params.missionId
  const isWarmup = path.endsWith('/warmup')
  const progressDoc = useProgress()
  const profile = progressDoc.profiles.kid

  const [tempoScale, setTempoScale] = useState(1)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [showCopied, setShowCopied] = useState(false)
  const [ritualDone, setRitualDone] = useState(() => hasAckedRitual())
  const [checkpointAcked, setCheckpointAcked] = useState(() => hasAckedCheckpoint(lesson?.id ?? ''))

  useEffect(() => {
    setCheckpointAcked(hasAckedCheckpoint(lesson?.id ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  useEffect(() => {
    setRitualDone(hasAckedRitual())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId])

  if (!lesson) {
    return (
      <div className="cc-card" style={{ padding: '1.5rem', margin: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Hold not found</h1>
        <button type="button" className="cc-btn cc-btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/wall')}>
          Back to the Wall
        </button>
      </div>
    )
  }

  const hold = profile.holds[lesson.id]
  const nextHold = nextHoldId(lesson.id)
  const nextLesson = nextHold ? lessonById(nextHold) : undefined
  const showCheckpointGate = Boolean(lesson.checkpoint) && !hold?.masteredAt && !checkpointAcked

  const mission = missionId ? missionById(lesson.id, missionId) : undefined

  function handleMissionDone(result: { help: HelpKind; tries: number; warmup?: boolean }) {
    if (!mission) return
    const who = progressDoc.settings.kidName

    if (result.warmup) {
      completeWarmup('kid', lesson!.id, mission.id)
      fireConfetti('small')
      const plan = ensureTodaysPlan()
      if (plan.mission && !plan.mission.doneAt) {
        navigate(`/lesson/${plan.mission.holdId}/${plan.mission.missionId}`)
      } else {
        navigate('/wall')
      }
      return
    }

    const tier = completeMission('kid', lesson!.id, mission.id, result.help, result.tries)
    const missionIds = lesson!.missions.map((m) => m.id)
    const freshHold = getDoc().profiles.kid.holds[lesson!.id]
    const allDone = missionsDoneCount(freshHold, missionIds) === missionIds.length

    if (allDone) {
      masterHold('kid', lesson!.id)
      fireConfetti('big')
      setCelebration({
        message: `${who} mastered ${lesson!.title}! 🏔️ A gold token is yours!`,
        tier: 'gold',
        holdMastered: true,
      })
    } else {
      fireConfetti(tier === 'gold' ? 'big' : 'small')
      // completeMission() already stamped cubeDay.mission.doneAt when this
      // was today's planned mission, so ensureTodaysPlan() reflects that now.
      const plan = ensureTodaysPlan()
      const isTodaysMission = plan.mission?.holdId === lesson!.id && plan.mission?.missionId === mission.id
      setCelebration({
        message: tierMessage(tier, who),
        tier,
        holdMastered: false,
        teaser: isTodaysMission ? tomorrowsMission(plan, LESSON_LIST) : undefined,
      })
    }
    setShowCopied(false)
  }

  /** Shares (or copies, when Web Share isn't available) a short line about the mission she just finished. */
  async function shareMissionDone() {
    if (!mission) return
    const emoji = celebration?.tier === 'gold' ? ' 🥇' : celebration?.tier === 'silver' ? ' 🥈' : celebration?.tier === 'bronze' ? ' 🥉' : ''
    const text = `${progressDoc.settings.kidName} just finished "${mission.title}" on her cube climb! 🧗${emoji}`
    const nav = typeof navigator !== 'undefined' ? (navigator as ShareNavigator) : undefined
    try {
      if (nav?.share) {
        await nav.share({ text })
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(text)
        setShowCopied(true)
        setTimeout(() => setShowCopied(false), 2000)
      }
    } catch {
      // Cancelling the share sheet isn't an error - nothing to do.
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 1rem 2rem' }}>
      {!mission && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button type="button" className="cc-btn cc-btn-surface" onClick={() => navigate('/wall')} aria-label="Back to the Wall">
              ◀
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3rem' }}>
                Hold {lesson.number}: {lesson.title}
              </h1>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--cc-ink-soft)', fontWeight: 600 }}>{lesson.goal}</p>
            </div>
          </div>

          <p style={{ margin: 0 }}>{lesson.story}</p>

          {showCheckpointGate ? (
            <CheckpointGate lesson={lesson} tempoScale={tempoScale} onReady={() => setCheckpointAcked(true)} />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                  Speed
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.25}
                    value={tempoScale}
                    onChange={(e) => setTempoScale(Number(e.target.value))}
                  />
                  <span>{tempoScale.toFixed(2)}x</span>
                </label>
              </div>
              <MissionList lesson={lesson} hold={hold} />
              {hold?.masteredAt && nextLesson && <WhatsNextCard nextLesson={nextLesson} tempoScale={tempoScale} />}
            </>
          )}
        </>
      )}

      {mission && !(lesson.id !== 'basecamp' && !ritualDone) && (
        <MissionPlayer
          key={mission.id}
          lesson={lesson}
          mission={mission}
          tempoScale={tempoScale}
          warmup={isWarmup}
          onDone={handleMissionDone}
          onExit={() => navigate(`/lesson/${lesson.id}`)}
        />
      )}

      {mission && lesson.id !== 'basecamp' && !ritualDone && (
        <OrientationRitual tempoScale={tempoScale} onConfirm={() => setRitualDone(true)} />
      )}

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
          <div className="cc-card" style={{ padding: '1.75rem', maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{celebration.message}</h2>

            {celebration.teaser && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '1.05rem' }}>Tomorrow: {celebration.teaser.title}</strong>
                {celebration.teaser.look.display && (
                  <div className="cc-card" style={{ height: 220, width: 220, padding: '0.4rem' }}>
                    <TwistyCube
                      setupAlg={celebration.teaser.look.display.setupAlg}
                      alg=""
                      stickering={celebration.teaser.look.stickering as TwistyCubeProps['stickering']}
                      controls="none"
                    />
                  </div>
                )}
                <p style={{ margin: 0, fontWeight: 700 }}>See you tomorrow, {progressDoc.settings.kidName}! 🧗</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="cc-btn cc-btn-surface" onClick={shareMissionDone}>
                {showCopied ? 'Copied! 📋' : '📤 Show someone'}
              </button>

              {celebration.teaser ? (
                <button
                  type="button"
                  className="cc-btn cc-btn-primary"
                  onClick={() => {
                    setCelebration(null)
                    navigate('/wall')
                  }}
                >
                  Back to the Wall
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="cc-btn cc-btn-surface"
                    onClick={() => {
                      setCelebration(null)
                      navigate(`/lesson/${lesson.id}`)
                    }}
                  >
                    Keep going
                  </button>
                  {celebration.holdMastered && nextHold && (
                    <button
                      type="button"
                      className="cc-btn cc-btn-primary"
                      onClick={() => {
                        setCelebration(null)
                        navigate(`/lesson/${nextHold}`)
                      }}
                    >
                      Next hold ▶
                    </button>
                  )}
                  {celebration.holdMastered && !nextHold && (
                    <button type="button" className="cc-btn cc-btn-primary" onClick={() => navigate('/wall')}>
                      Back to the Wall
                    </button>
                  )}
                  {!celebration.holdMastered && mission && nextMissionId(lesson, mission.id) && (
                    <button
                      type="button"
                      className="cc-btn cc-btn-primary"
                      onClick={() => {
                        setCelebration(null)
                        navigate(`/lesson/${lesson.id}/${nextMissionId(lesson, mission.id)}`)
                      }}
                    >
                      Next mission ▶
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
