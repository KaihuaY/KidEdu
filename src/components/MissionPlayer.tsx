import { useEffect, useMemo, useState } from 'react'
import { TwistyCube, type TwistyCubeProps } from './TwistyCube'
import { SayIt } from './SayIt'
import { MissionCheck } from './MissionCheck'
import { ScanHelp } from './ScanHelp'
import { PracticePanel } from './PracticePanel'
import { PickStep } from './PickStep'
import { FollowAlong } from './FollowAlong'
import { NAMED_ALGS } from '../engine/notation'
import { parseAlg } from '../engine/cube'
import type { HelpKind } from '../store/progress'
import { useProgress } from '../store/progress'
import { useMissionMinutesTracker } from '../store/missions'
import type { Lesson, Mission } from '../content/lessons'
import { expandSteps, type PickChoices } from '../content/missionSteps'

export interface MissionPlayerProps {
  lesson: Lesson
  mission: Mission
  tempoScale: number
  onDone: (result: { help: HelpKind; tries: number; warmup?: boolean }) => void
  onExit: () => void
  /** Skip Look, run the Do steps, then a light "still got it?" check instead of the full MissionCheck. */
  warmup?: boolean
}

type Phase = 'look' | 'do' | 'check' | 'scan'

const HELP_ORDER: HelpKind[] = ['none', 'scan', 'walkthrough']

function bumpHelp(prev: HelpKind, next: HelpKind): HelpKind {
  return HELP_ORDER.indexOf(next) > HELP_ORDER.indexOf(prev) ? next : prev
}

// Where she is inside a mission survives leaving the Cube tab (Settings,
// Piano, ...) and coming back: kept per mission in sessionStorage, cleared
// when the mission is completed.
interface SavedSpot {
  phase: Phase
  stepIndex: number
  help: HelpKind
  tries: number
  pickChoices: PickChoices
}

function spotKey(holdId: string, missionId: string): string {
  return `cubeclimb.mission.${holdId}.${missionId}`
}

/** Defensively parses a saved pickChoices blob - drops anything that isn't a whole-number key with a number|'all' value. */
function readPickChoices(raw: unknown): PickChoices {
  const out: PickChoices = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const topIndex = Number(key)
    if (!Number.isInteger(topIndex)) continue
    if (value === 'all' || typeof value === 'number') out[topIndex] = value
  }
  return out
}

function readSpot(holdId: string, missionId: string): SavedSpot | null {
  try {
    const raw = sessionStorage.getItem(spotKey(holdId, missionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedSpot>
    const phase: Phase = parsed.phase === 'do' || parsed.phase === 'check' ? parsed.phase : 'look'
    return {
      phase,
      stepIndex: typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0,
      help: parsed.help === 'scan' || parsed.help === 'walkthrough' ? parsed.help : 'none',
      tries: typeof parsed.tries === 'number' ? parsed.tries : 1,
      pickChoices: readPickChoices(parsed.pickChoices),
    }
  } catch {
    return null
  }
}

function writeSpot(holdId: string, missionId: string, spot: SavedSpot): void {
  try {
    // A scan in progress can't be resumed, so it comes back as the check screen.
    sessionStorage.setItem(spotKey(holdId, missionId), JSON.stringify({ ...spot, phase: spot.phase === 'scan' ? 'check' : spot.phase }))
  } catch {
    // ignore - she just restarts the mission from Look
  }
}

export function clearMissionSpot(holdId: string, missionId: string): void {
  try {
    sessionStorage.removeItem(spotKey(holdId, missionId))
  } catch {
    // ignore
  }
}

/** How many moves a Do card's display animates - a follow-along only makes sense when this is >= 1. */
function moveCountOf(display: { setupAlg: string; alg: string } | undefined): number {
  if (!display || !display.alg) return 0
  return parseAlg(display.alg).length
}

/** One mission's Look -> Do -> Check -> (Show me my cube) flow. */
export function MissionPlayer({ lesson, mission, tempoScale, onDone, onExit, warmup = false }: MissionPlayerProps) {
  const saved = readSpot(lesson.id, mission.id)
  const progressDoc = useProgress()
  const showMoveLetters = Boolean(progressDoc.settings.showMoveLetters)

  const [phase, setPhase] = useState<Phase>(() => {
    if (warmup) return saved?.phase === 'check' ? 'check' : 'do'
    return saved?.phase ?? 'look'
  })
  const [pickChoices, setPickChoices] = useState<PickChoices>(() => saved?.pickChoices ?? {})
  const expanded = useMemo(() => expandSteps(mission.steps, pickChoices), [mission.steps, pickChoices])
  const [stepIndex, setStepIndex] = useState(() => Math.min(saved?.stepIndex ?? 0, Math.max(0, expanded.length - 1)))
  const [help, setHelp] = useState<HelpKind>(saved?.help ?? 'none')
  const [tries, setTries] = useState(saved?.tries ?? 1)

  useMissionMinutesTracker('kid', lesson.id, mission.id)

  useEffect(() => {
    writeSpot(lesson.id, mission.id, { phase, stepIndex, help, tries, pickChoices })
  }, [lesson.id, mission.id, phase, stepIndex, help, tries, pickChoices])

  function finish(result: { help: HelpKind; tries: number; warmup?: boolean }) {
    clearMissionSpot(lesson.id, mission.id)
    onDone(result)
  }

  const entry = expanded[Math.min(stepIndex, expanded.length - 1)]
  const step = entry?.step
  const isLastStep = stepIndex >= expanded.length - 1

  function goToDo() {
    setStepIndex(0)
    setPhase('do')
  }

  function advanceStep() {
    if (isLastStep) setPhase('check')
    else setStepIndex((i) => i + 1)
  }

  function choosePick(topIndex: number, choice: number | 'all') {
    setPickChoices((prev) => ({ ...prev, [topIndex]: choice }))
    // stepIndex stays put on purpose - once the pick at this array position
    // is expanded, the same numeric index lands on the first `then` step.
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="cc-btn cc-btn-surface" onClick={onExit} aria-label="Back to missions">
          ◀
        </button>
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{mission.title}</h1>
      </div>

      {phase === 'look' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {mission.look.display && (
            <div className="cc-card" style={{ height: 280, padding: '0.5rem' }}>
              <TwistyCube
                setupAlg={mission.look.display.setupAlg}
                alg={mission.look.display.alg}
                stickering={mission.look.stickering as TwistyCubeProps['stickering']}
                backView={mission.look.backView ? 'top-right' : 'none'}
                tempoScale={tempoScale}
                controls={mission.look.display.alg ? 'bottom-row' : 'none'}
              />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{mission.look.title}</h2>
            <SayIt text={mission.look.say} />
          </div>
          <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{mission.look.text}</p>
          <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 64 }} onClick={goToDo}>
            Let's do it ▶
          </button>
        </div>
      )}

      {phase === 'do' && step && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.2rem' }} aria-label="Step progress">
            {expanded.map((_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: i < stepIndex ? 'var(--cc-success)' : i === stepIndex ? 'var(--cc-primary)' : 'var(--cc-border)',
                }}
              />
            ))}
          </div>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
            Step {stepIndex + 1} of {expanded.length}
          </p>

          {step.kind === 'pick' && (
            <PickStep
              title={step.title}
              text={step.text}
              say={step.say}
              options={step.options}
              tempoScale={tempoScale}
              onChoose={(choice) => choosePick(entry.topIndex, choice)}
            />
          )}

          {step.kind === 'practice' && (
            <PracticePanel
              prompt={step.prompt}
              say={step.say}
              sequence={step.sequence}
              sequences={step.sequences}
              tempoScale={tempoScale}
              showLetters={showMoveLetters}
              onComplete={() => advanceStep()}
            />
          )}

          {step.kind === 'do' &&
            (() => {
              const moves = moveCountOf(step.display)
              const useFollowAlong = step.followAlong !== false && moves > 0
              return (
                <>
                  {!useFollowAlong && step.display && (
                    <div className="cc-card" style={{ height: 280, padding: '0.5rem' }}>
                      <TwistyCube
                        key={stepIndex}
                        setupAlg={step.display.setupAlg}
                        alg={step.display.alg}
                        stickering={step.stickering as TwistyCubeProps['stickering']}
                        backView={step.backView ? 'top-right' : 'none'}
                        tempoScale={tempoScale}
                        controls="bottom-row"
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{step.title}</h2>
                    <SayIt text={step.say} />
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{step.text}</p>

                  {useFollowAlong && step.display && (
                    <FollowAlong
                      key={stepIndex}
                      display={step.display}
                      stickering={step.stickering}
                      backView={step.backView}
                      tempoScale={tempoScale}
                      showLetters={showMoveLetters}
                      onFinished={advanceStep}
                    />
                  )}

                  {step.namedAlgId &&
                    (() => {
                      const named = NAMED_ALGS.find((a) => a.id === step.namedAlgId)
                      if (!named) return null
                      return (
                        <div
                          className="cc-card"
                          style={{ padding: '0.75rem 1rem', background: 'var(--cc-bg)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                            <strong>{named.kidName}</strong>
                            {showMoveLetters &&
                              named.alg.split(' ').map((m, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontFamily: 'ui-monospace, Consolas, monospace',
                                    fontSize: '1.1rem',
                                    fontWeight: 800,
                                    padding: '0.25rem 0.55rem',
                                    borderRadius: '0.6rem',
                                    background: 'var(--cc-surface)',
                                    border: '1px solid var(--cc-border)',
                                  }}
                                >
                                  {m}
                                </span>
                              ))}
                          </div>
                          {named.why && (
                            <details>
                              <summary
                                style={{
                                  cursor: 'pointer',
                                  minHeight: 56,
                                  display: 'flex',
                                  alignItems: 'center',
                                  fontWeight: 700,
                                }}
                              >
                                🔍 Why does this work?
                              </summary>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{named.why.text}</p>
                                <SayIt text={named.why.say} />
                              </div>
                            </details>
                          )
                          }
                        </div>
                      )
                    })()}

                  {step.checklist && step.checklist.length > 0 && (
                    <div className="cc-card" style={{ padding: '0.9rem', background: 'var(--cc-bg)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <strong>Do it on your cube</strong>
                      {step.checklist.map((item, i) => (
                        <p key={i} style={{ margin: 0, fontWeight: 700 }}>
                          ⬜ {item}
                        </p>
                      ))}
                    </div>
                  )}

                  {!useFollowAlong && (
                    <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 64 }} onClick={advanceStep}>
                      {isLastStep ? 'Check it ▶' : 'Next ▶'}
                    </button>
                  )}
                </>
              )
            })()}
        </div>
      )}

      {phase === 'check' &&
        (warmup ? (
          <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Still got it? ✅</h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                style={{ flex: 1, minWidth: 160, minHeight: 64 }}
                onClick={() => finish({ help: 'none', tries, warmup: true })}
              >
                ✅ Yes!
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ flex: 1, minWidth: 160, minHeight: 64 }}
                onClick={goToDo}
              >
                🔁 Show me again
              </button>
            </div>
          </div>
        ) : (
          <MissionCheck
            mission={mission}
            tempoScale={tempoScale}
            onYes={() => finish({ help, tries })}
            onShowAgain={goToDo}
            onScan={mission.goalPhase ? () => setPhase('scan') : undefined}
            onNotYet={() => setTries((t) => t + 1)}
          />
        ))}

      {phase === 'scan' && (
        <ScanHelp
          mission={mission}
          tempoScale={tempoScale}
          onPassed={() => {
            const nextHelp = bumpHelp(help, 'scan')
            setHelp(nextHelp)
            finish({ help: nextHelp, tries })
          }}
          onWalkedThrough={() => {
            const nextHelp = bumpHelp(help, 'walkthrough')
            setHelp(nextHelp)
            finish({ help: nextHelp, tries })
          }}
          onCancel={() => setPhase('check')}
        />
      )}
    </div>
  )
}
