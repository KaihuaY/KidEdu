import { useEffect, useMemo, useRef, useState } from 'react'
import { useRoute, navigate } from '../router'
import { TwistyCube, type TwistyCubeProps } from '../components/TwistyCube'
import { MoveArrows } from '../components/MoveArrows'
import { SayIt } from '../components/SayIt'
import { fireConfetti } from '../components/Confetti'
import { VirtualCubeInput } from '../input/CubeInput'
import { SOLVED, parseAlg } from '../engine/cube'
import { describeMove } from '../engine/notation'
import {
  caseDisplay,
  lessonById,
  nextHoldId,
  type Checkpoint,
  type LearnCard,
  type Lesson as LessonContent,
} from '../content/lessons'
import { useProgress, update, type HoldProgress, type StageProgress } from '../store/progress'
import { maxStars, starsForTier, tierForClimbTries, tierForStageTries, xpForTier, type Tier } from '../store/rewards'

type StageId = 'learn' | 'watch' | 'try' | 'spot' | 'climb'
const STAGE_ORDER: StageId[] = ['learn', 'watch', 'try', 'spot', 'climb']
const STAGE_LABEL: Record<StageId, string> = {
  learn: 'Learn',
  watch: 'Watch',
  try: 'Try',
  spot: 'Spot it',
  climb: 'Climb',
}

/**
 * Progress docs saved before the Learn stage existed have no 'learn' record,
 * and a missing record must never re-lock a hold for someone already past it.
 * So: a missing record counts as "not done" for a fresh climber, but once
 * Watch is complete, Learn counts as done too - it stays open and clickable,
 * it just doesn't block the stages above it.
 */
function stageIsDone(hold: HoldProgress | undefined, stage: StageId): boolean {
  if (hold?.stages[stage]?.completedAt) return true
  return stage === 'learn' && Boolean(hold?.stages.watch?.completedAt)
}

/** How many leading stages are unlocked, given what's already complete. */
function unlockedStageCount(hold: HoldProgress | undefined): number {
  const completed = STAGE_ORDER.filter((s) => stageIsDone(hold, s)).length
  return Math.min(completed + 1, STAGE_ORDER.length)
}

/** "U2" -> ["U","U"] so a sequence can be tapped with only quarter-turn buttons. */
function expandDoubles(alg: string): string[] {
  const out: string[] = []
  for (const token of parseAlg(alg)) {
    if (token.endsWith('2')) {
      const base = token.slice(0, -1)
      out.push(base, base)
    } else {
      out.push(token)
    }
  }
  return out
}

function emptyStageProgress(): StageProgress {
  return { bestTries: null, stars: 0, attempts: 0, minutes: 0 }
}

function awardStage(
  profileId: 'kid' | 'parent',
  holdId: string,
  stageId: StageId,
  tries: number,
  tier: Tier,
  giveToken = true,
): void {
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? { stages: {} }
    const prev = hold.stages[stageId] ?? emptyStageProgress()
    const nextStage: StageProgress = {
      bestTries: prev.bestTries === null ? tries : Math.min(prev.bestTries, tries),
      stars: maxStars(prev.stars, starsForTier(tier)),
      attempts: prev.attempts + tries,
      minutes: prev.minutes,
      completedAt: prev.completedAt ?? Date.now(),
    }
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: { ...profile.holds, [holdId]: { ...hold, stages: { ...hold.stages, [stageId]: nextStage } } },
        tokens: giveToken ? { ...profile.tokens, [tier]: profile.tokens[tier] + 1 } : profile.tokens,
        xp: profile.xp + (giveToken ? xpForTier(tier) : 5),
      },
    }
  })
}

/** Returns true if this call is the moment the hold first becomes mastered. */
function masterHold(profileId: 'kid' | 'parent', holdId: string): boolean {
  let justMastered = false
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? { stages: {} }
    if (hold.masteredAt) return profiles
    justMastered = true
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: { ...profile.holds, [holdId]: { ...hold, masteredAt: Date.now() } },
        tokens: { ...profile.tokens, gold: profile.tokens.gold + 1 },
      },
    }
  })
  return justMastered
}

function addStageMinutes(profileId: 'kid' | 'parent', holdId: string, stageId: StageId, minutes: number): void {
  if (minutes <= 0) return
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? { stages: {} }
    const prev = hold.stages[stageId] ?? emptyStageProgress()
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: {
          ...profile.holds,
          [holdId]: { ...hold, stages: { ...hold.stages, [stageId]: { ...prev, minutes: prev.minutes + minutes } } },
        },
      },
    }
  })
}

/** Tracks wall-clock time spent on one stage and flushes it to progress when it closes. */
function useStageMinutesTracker(profileId: 'kid' | 'parent', holdId: string, stageId: StageId): void {
  useEffect(() => {
    const startedAt = Date.now()
    return () => {
      const minutes = (Date.now() - startedAt) / 60000
      addStageMinutes(profileId, holdId, stageId, minutes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, holdId, stageId])
}

// ---------------------------------------------------------------------------

function MoveLabel({ move, showLetters }: { move: string; showLetters: boolean }) {
  return (
    <span>
      {describeMove(move)}
      {showLetters ? <span style={{ opacity: 0.6, fontWeight: 700 }}> ({move})</span> : null}
    </span>
  )
}

function ChecklistItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setChecked((c) => !c)}
      className="cc-btn cc-btn-surface"
      aria-pressed={checked}
      style={{
        width: '100%',
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: '0.75rem',
        minHeight: 56,
        padding: '0.5rem 0.9rem',
        background: checked ? 'var(--cc-success)' : 'var(--cc-surface)',
        color: checked ? '#fff' : 'var(--cc-ink)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1.4rem', lineHeight: 1 }}>
        {checked ? '✅' : '⬜'}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: 'normal' }}>{label}</span>
    </button>
  )
}

function LearnChecklist({ cardKey, items }: { cardKey: string; items: string[] }) {
  return (
    <div className="cc-card" style={{ padding: '0.9rem', background: 'var(--cc-bg)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <strong>Do it on your cube</strong>
      {items.map((item, i) => (
        <ChecklistItem key={`${cardKey}-${i}`} label={item} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checkpoints - "before you start this hold, your cube should look like X"
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
    // ignore - the Ready card will just ask again next stage, which is fine
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

/** Reused at the end of Climb once mastered: a preview of the next wall's starting checkpoint. */
function WhatsNextCard({ nextLesson, tempoScale }: { nextLesson: LessonContent; tempoScale: number }) {
  const checkpoint = nextLesson.checkpoint
  return (
    <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
        Next: {nextLesson.title} ▶
      </h2>
      {checkpoint && (
        <>
          <CheckpointPicture checkpoint={checkpoint} tempoScale={tempoScale} />
          <p style={{ margin: 0, fontWeight: 700 }}>Your cube will look like this: {checkpoint.look}</p>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>Hold it like this: {checkpoint.hold}</p>
        </>
      )}
      <button
        type="button"
        className="cc-btn cc-btn-primary"
        onClick={() => navigate(`/lesson/${nextLesson.id}`)}
      >
        Next: {nextLesson.title} ▶
      </button>
    </div>
  )
}

function LearnPanel({
  lesson,
  tempoScale,
  showLetters,
  onComplete,
}: {
  lesson: LessonContent
  tempoScale: number
  showLetters: boolean
  onComplete: () => void
}) {
  const [index, setIndex] = useState(0)
  const cards: LearnCard[] = lesson.stages.learn.cards
  const card = cards[Math.min(index, cards.length - 1)]
  const isLast = index >= cards.length - 1
  const hasAlg = Boolean(card.display?.alg)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {card.display && (
        <div className="cc-card" style={{ height: 300, padding: '0.5rem' }}>
          <TwistyCube
            key={`${lesson.id}-${index}`}
            setupAlg={card.display.setupAlg}
            alg={card.display.alg}
            stickering={card.stickering as TwistyCubeProps['stickering']}
            backView={card.backView ? 'top-right' : 'none'}
            tempoScale={tempoScale}
            controls={hasAlg ? 'bottom-row' : 'none'}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{card.title}</h3>
        <SayIt text={card.say} />
      </div>
      <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
        {card.text}
        {showLetters && card.display?.alg ? (
          <span style={{ opacity: 0.7, fontWeight: 800 }}> ({card.display.alg})</span>
        ) : null}
      </p>

      {card.checklist && card.checklist.length > 0 && (
        <LearnChecklist cardKey={`${lesson.id}-${index}`} items={card.checklist} />
      )}

      {isLast && (
        <a
          href="#/help"
          className="cc-btn cc-btn-surface"
          style={{ textDecoration: 'none', justifyContent: 'center' }}
        >
          🧩 Help with my cube
        </a>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          ◀ Prev
        </button>
        <span style={{ alignSelf: 'center', fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
          {index + 1} / {cards.length}
        </span>
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          onClick={() => {
            if (isLast) onComplete()
            else setIndex((i) => i + 1)
          }}
        >
          {isLast ? 'Got it! ✓' : 'Next ▶'}
        </button>
      </div>

      <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)' }}>
        <strong>Show me on the real cube</strong>
        <p style={{ margin: '0.4rem 0 0' }}>{lesson.realCubeHint}</p>
      </div>
    </div>
  )
}

function WatchPanel({
  lesson,
  tempoScale,
  showLetters,
  onComplete,
}: {
  lesson: LessonContent
  tempoScale: number
  showLetters: boolean
  onComplete: () => void
}) {
  const [index, setIndex] = useState(0)
  const demo = lesson.stages.watch.demos[index]
  const isLast = index === lesson.stages.watch.demos.length - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="cc-card" style={{ height: 280, padding: '0.5rem' }}>
        <TwistyCube
          setupAlg={demo.setupAlg ?? 'z2'}
          alg={demo.alg}
          tempoScale={tempoScale}
          controls="bottom-row"
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{demo.title}</h3>
        <SayIt text={demo.say} />
      </div>
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)', fontWeight: 600 }}>
        {demo.say}
        {showLetters ? <span style={{ opacity: 0.7 }}> ({demo.alg || 'no moves'})</span> : null}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          ◀ Prev
        </button>
        <span style={{ alignSelf: 'center', fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
          {index + 1} / {lesson.stages.watch.demos.length}
        </span>
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          onClick={() => {
            if (isLast) onComplete()
            else setIndex((i) => i + 1)
          }}
        >
          {isLast ? 'Done watching ✓' : 'Next ▶'}
        </button>
      </div>

      <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)' }}>
        <strong>Show me on the real cube</strong>
        <p style={{ margin: '0.4rem 0 0' }}>{lesson.realCubeHint}</p>
      </div>
    </div>
  )
}

interface RunnerResult {
  tries: number
}

function useSequenceRunner(sequence: string, onSuccess: (result: RunnerResult) => void) {
  const expected = useMemo(() => expandDoubles(sequence), [sequence])
  const cubeRef = useRef(new VirtualCubeInput(SOLVED))
  const [progress, setProgress] = useState<string[]>([])
  const [tries, setTries] = useState(1)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    cubeRef.current = new VirtualCubeInput(SOLVED)
    setProgress([])
    setTries(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence])

  function tapMove(move: string) {
    const wanted = expected[progress.length]
    if (move !== wanted) {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel()
          window.speechSynthesis.speak(new SpeechSynthesisUtterance('Oops, try again!'))
        } catch {
          // ignore
        }
      }
      cubeRef.current = new VirtualCubeInput(SOLVED)
      setProgress([])
      setTries((t) => t + 1)
      return
    }
    cubeRef.current.apply(move)
    const next = [...progress, move]
    if (next.length === expected.length) {
      // Reset immediately so the runner is ready for another attempt (Climb
      // does 3 back-to-back runs on the same runner instance) - capture the
      // tries this successful attempt took before resetting the counter.
      const completedTries = tries
      cubeRef.current = new VirtualCubeInput(SOLVED)
      setProgress([])
      setTries(1)
      onSuccess({ tries: completedTries })
      return
    }
    setProgress(next)
  }

  return {
    expected,
    progress,
    alg: progress.join(' '),
    nextExpected: expected[progress.length],
    tries,
    shake,
    tapMove,
  }
}

function TryPanel({
  lesson,
  tempoScale,
  showLetters,
  onComplete,
}: {
  lesson: LessonContent
  tempoScale: number
  showLetters: boolean
  onComplete: (tries: number) => void
}) {
  const runner = useSequenceRunner(lesson.stages.try.sequence, ({ tries }) => onComplete(tries))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{lesson.stages.try.prompt}</p>
        <SayIt text={lesson.stages.try.say} />
      </div>
      <div
        className="cc-card"
        style={{
          height: 260,
          padding: '0.5rem',
          animation: runner.shake ? 'cc-shake 400ms' : undefined,
        }}
      >
        <TwistyCube setupAlg="z2" alg={runner.alg} tempoScale={tempoScale} controls="none" />
      </div>
      {runner.nextExpected && (
        <div className="cc-card" style={{ padding: '0.75rem 1rem', background: 'var(--cc-bg)' }}>
          Next move: <strong><MoveLabel move={runner.nextExpected} showLetters={showLetters} /></strong>
        </div>
      )}
      <MoveArrows onMove={runner.tapMove} />
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>Tries this attempt: {runner.tries}</p>
    </div>
  )
}

function ClimbPanel({
  lesson,
  tempoScale,
  showLetters,
  onComplete,
}: {
  lesson: LessonContent
  tempoScale: number
  showLetters: boolean
  onComplete: (totalTries: number) => void
}) {
  const [run, setRun] = useState(1)
  const [totalTries, setTotalTries] = useState(0)
  // Holds that teach more than one trick (e.g. Middle Traverse) cycle through
  // `sequences` one per run instead of repeating the same `sequence` every
  // time - falls back to `sequence` for every single-trick hold.
  const sequences = lesson.stages.climb.sequences
  const currentSequence =
    sequences && sequences.length > 0 ? sequences[(run - 1) % sequences.length] : lesson.stages.climb.sequence
  const runner = useSequenceRunner(currentSequence, ({ tries }) => {
    const newTotal = totalTries + tries
    if (run >= lesson.stages.climb.runs) {
      onComplete(newTotal)
    } else {
      setTotalTries(newTotal)
      setRun((r) => r + 1)
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
          Climb run {run} of {lesson.stages.climb.runs}
        </p>
        <SayIt text={`Do it ${lesson.stages.climb.runs} times in a row!`} />
      </div>
      <div
        className="cc-card"
        style={{ height: 260, padding: '0.5rem', animation: runner.shake ? 'cc-shake 400ms' : undefined }}
      >
        <TwistyCube setupAlg="z2" alg={runner.alg} tempoScale={tempoScale} controls="none" />
      </div>
      {runner.nextExpected && (
        <div className="cc-card" style={{ padding: '0.75rem 1rem', background: 'var(--cc-bg)' }}>
          Next move: <strong><MoveLabel move={runner.nextExpected} showLetters={showLetters} /></strong>
        </div>
      )}
      <MoveArrows onMove={runner.tapMove} />
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
        Tries so far: {totalTries + runner.tries}
      </p>
    </div>
  )
}

function SpotPanel({
  lesson,
  tempoScale,
  onComplete,
}: {
  lesson: LessonContent
  tempoScale: number
  onComplete: (tries: number) => void
}) {
  const [attempts, setAttempts] = useState(1)
  const [hint, setHint] = useState<string | null>(null)
  const options = lesson.stages.spot.options

  function pick(correct: boolean) {
    if (correct) {
      onComplete(attempts)
      return
    }
    setAttempts((a) => a + 1)
    setHint('Not quite - look closely at the yellow pattern and try another cube.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{lesson.stages.spot.question}</p>
        <SayIt text={lesson.stages.spot.question} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            className="cc-btn cc-btn-surface"
            onClick={() => pick(option.correct)}
            style={{ flexDirection: 'column', padding: '0.5rem', height: 'auto' }}
            aria-label={option.label}
          >
            <div style={{ width: '100%', maxWidth: 220, height: 250, margin: '0 auto' }}>
              <TwistyCube
                {...caseDisplay(option.alg)}
                visualization="2D"
                controls="none"
                tempoScale={tempoScale}
              />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{option.label}</span>
          </button>
        ))}
      </div>
      {hint && (
        <div className="cc-card" style={{ padding: '0.75rem 1rem', background: 'var(--cc-bg)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function Lesson() {
  const { params } = useRoute()
  const lesson = lessonById(params.id ?? '')
  const progressDoc = useProgress()
  const profile = progressDoc.profiles.kid

  // Notation letters alongside move arrows used to be a parent-only toggle;
  // now that there's only the kid profile, it just stays off.
  const showLetters = false
  const [tempoScale, setTempoScale] = useState(1)
  const [celebration, setCelebration] = useState<string | null>(null)

  const hold = lesson ? profile.holds[lesson.id] : undefined
  const unlockedCount = unlockedStageCount(hold)

  const [currentStage, setCurrentStage] = useState<StageId>(() => {
    const firstIncomplete = STAGE_ORDER.find((s) => !stageIsDone(hold, s))
    return firstIncomplete ?? 'climb'
  })
  const [checkpointAcked, setCheckpointAcked] = useState(() => hasAckedCheckpoint(lesson?.id ?? ''))

  // Navigating straight from one hold to the next (e.g. the "Next hold ▶"
  // button in the celebration dialog, or the What's next card) keeps this
  // component mounted, so both the stage-tab pointer and the checkpoint gate
  // need to re-sync to the newly arrived-at hold rather than carrying over
  // stale state from the previous one.
  useEffect(() => {
    const firstIncomplete = STAGE_ORDER.find((s) => !stageIsDone(hold, s))
    setCurrentStage(firstIncomplete ?? 'climb')
    setCheckpointAcked(hasAckedCheckpoint(lesson?.id ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  useStageMinutesTracker('kid', lesson?.id ?? '', currentStage)

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

  function celebrate(tier: Tier, message: string) {
    fireConfetti(tier === 'gold' ? 'big' : 'small')
    setCelebration(message)
  }

  function handleStageComplete(stageId: StageId, tries: number) {
    const tier = stageId === 'climb' ? tierForClimbTries(tries) : tierForStageTries(tries)
    const who = progressDoc.settings.kidName
    if (stageId === 'learn' || stageId === 'watch') {
      // Learning/watching is not an achievement yet: mark it done (+5 XP) but
      // no box token, and nudge straight on to the next stage.
      awardStage('kid', lesson!.id, stageId, tries, tier, false)
      celebrate(
        'bronze',
        stageId === 'learn'
          ? `Great learning, ${who}! Now watch it in action. 🧗`
          : `Nice watching, ${who}! Now try it yourself. 💪`,
      )
      const at = STAGE_ORDER.indexOf(stageId)
      if (at + 1 < STAGE_ORDER.length) setCurrentStage(STAGE_ORDER[at + 1])
      return
    }
    awardStage('kid', lesson!.id, stageId, tries, tier)

    if (stageId === 'climb') {
      const justMastered = masterHold('kid', lesson!.id)
      if (justMastered) {
        celebrate('gold', `${who} mastered ${lesson!.title}! 🏔️ A gold token is yours!`)
      } else {
        celebrate(tier, `Nice climb! You earned a ${tier} medal.`)
      }
      return
    }

    const niceTier = tier === 'gold' ? 'Gold' : tier === 'silver' ? 'Silver' : 'Bronze'
    if (tries === 1 && stageId !== 'spot') {
      celebrate(tier, `${who}, you got it in 1 try! ${niceTier} box earned!`)
    } else {
      celebrate(tier, `Great job! ${niceTier} box earned.`)
    }
    // Auto-advance to the next stage tab once this one is done.
    const idx = STAGE_ORDER.indexOf(stageId)
    if (idx + 1 < STAGE_ORDER.length) setCurrentStage(STAGE_ORDER[idx + 1])
  }

  const nextHold = nextHoldId(lesson.id)
  const nextLesson = nextHold ? lessonById(nextHold) : undefined
  const showCheckpointGate = Boolean(lesson.checkpoint) && !hold?.masteredAt && !checkpointAcked

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 1rem 2rem' }}>
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

      {showCheckpointGate && (
        <CheckpointGate
          lesson={lesson}
          tempoScale={tempoScale}
          onReady={() => setCheckpointAcked(true)}
        />
      )}

      {!showCheckpointGate && (
      <>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {STAGE_ORDER.map((stage, i) => {
          const locked = i >= unlockedCount
          const done = stageIsDone(hold, stage)
          return (
            <button
              key={stage}
              type="button"
              disabled={locked}
              onClick={() => setCurrentStage(stage)}
              className="cc-btn"
              style={{
                flex: 1,
                minWidth: 80,
                background: currentStage === stage ? 'var(--cc-primary)' : 'var(--cc-surface)',
                color: currentStage === stage ? '#fff' : 'var(--cc-ink)',
                border: currentStage === stage ? 'none' : '2px solid var(--cc-border)',
                boxShadow: 'none',
              }}
            >
              {done ? '✓ ' : ''}
              {STAGE_LABEL[stage]}
            </button>
          )
        })}
      </div>

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

      {currentStage === 'learn' && (
        <LearnPanel
          key={lesson.id}
          lesson={lesson}
          tempoScale={tempoScale}
          showLetters={showLetters}
          onComplete={() => handleStageComplete('learn', 1)}
        />
      )}
      {currentStage === 'watch' && (
        <WatchPanel
          lesson={lesson}
          tempoScale={tempoScale}
          showLetters={showLetters}
          onComplete={() => handleStageComplete('watch', 1)}
        />
      )}
      {currentStage === 'try' && (
        <TryPanel
          key={lesson.id}
          lesson={lesson}
          tempoScale={tempoScale}
          showLetters={showLetters}
          onComplete={(tries) => handleStageComplete('try', tries)}
        />
      )}
      {currentStage === 'spot' && (
        <SpotPanel
          key={lesson.id}
          lesson={lesson}
          tempoScale={tempoScale}
          onComplete={(tries) => handleStageComplete('spot', tries)}
        />
      )}
      {currentStage === 'climb' && (
        <ClimbPanel
          key={lesson.id}
          lesson={lesson}
          tempoScale={tempoScale}
          showLetters={showLetters}
          onComplete={(totalTries) => handleStageComplete('climb', totalTries)}
        />
      )}

      {currentStage === 'climb' && hold?.masteredAt && nextLesson && (
        <WhatsNextCard nextLesson={nextLesson} tempoScale={tempoScale} />
      )}
      </>
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
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{celebration}</h2>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="cc-btn cc-btn-surface" onClick={() => setCelebration(null)}>
                Keep going
              </button>
              {hold?.masteredAt && nextHold && (
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
              {!nextHold && hold?.masteredAt && (
                <button type="button" className="cc-btn cc-btn-primary" onClick={() => navigate('/wall')}>
                  Back to the Wall
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
