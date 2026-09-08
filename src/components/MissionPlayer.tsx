import { useState } from 'react'
import { TwistyCube, type TwistyCubeProps } from './TwistyCube'
import { SayIt } from './SayIt'
import { MissionCheck } from './MissionCheck'
import { ScanHelp } from './ScanHelp'
import { PracticePanel } from './PracticePanel'
import { NAMED_ALGS } from '../engine/notation'
import type { HelpKind } from '../store/progress'
import { useMissionMinutesTracker } from '../store/missions'
import type { Lesson, Mission, MissionStep } from '../content/lessons'

export interface MissionPlayerProps {
  lesson: Lesson
  mission: Mission
  tempoScale: number
  onDone: (result: { help: HelpKind; tries: number }) => void
  onExit: () => void
}

type Phase = 'look' | 'do' | 'check' | 'scan'

const HELP_ORDER: HelpKind[] = ['none', 'scan', 'walkthrough']

function bumpHelp(prev: HelpKind, next: HelpKind): HelpKind {
  return HELP_ORDER.indexOf(next) > HELP_ORDER.indexOf(prev) ? next : prev
}

/** One mission's Look -> Do -> Check -> (Show me my cube) flow. */
export function MissionPlayer({ lesson, mission, tempoScale, onDone, onExit }: MissionPlayerProps) {
  const [phase, setPhase] = useState<Phase>('look')
  const [stepIndex, setStepIndex] = useState(0)
  const [help, setHelp] = useState<HelpKind>('none')
  const [tries, setTries] = useState(1)

  useMissionMinutesTracker('kid', lesson.id, mission.id)

  const step: MissionStep | undefined = mission.steps[stepIndex]
  const isLastStep = stepIndex >= mission.steps.length - 1

  function goToDo() {
    setStepIndex(0)
    setPhase('do')
  }

  function advanceStep() {
    if (isLastStep) setPhase('check')
    else setStepIndex((i) => i + 1)
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
            {mission.steps.map((_, i) => (
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
            Step {stepIndex + 1} of {mission.steps.length}
          </p>

          {step.kind === 'do' ? (
            <>
              {step.display && (
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
              {step.namedAlgId &&
                (() => {
                  const named = NAMED_ALGS.find((a) => a.id === step.namedAlgId)
                  if (!named) return null
                  return (
                    <div className="cc-card" style={{ padding: '0.75rem 1rem', background: 'var(--cc-bg)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      <strong>{named.kidName}</strong>
                      {named.alg.split(' ').map((m, i) => (
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
              <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 64 }} onClick={advanceStep}>
                {isLastStep ? 'Check it ▶' : 'Next ▶'}
              </button>
            </>
          ) : (
            <PracticePanel
              prompt={step.prompt}
              say={step.say}
              sequence={step.sequence}
              sequences={step.sequences}
              tempoScale={tempoScale}
              onComplete={() => advanceStep()}
            />
          )}
        </div>
      )}

      {phase === 'check' && (
        <MissionCheck
          mission={mission}
          tempoScale={tempoScale}
          onYes={() => onDone({ help, tries })}
          onShowAgain={goToDo}
          onScan={mission.goalPhase ? () => setPhase('scan') : undefined}
          onNotYet={() => setTries((t) => t + 1)}
        />
      )}

      {phase === 'scan' && (
        <ScanHelp
          mission={mission}
          tempoScale={tempoScale}
          onPassed={() => {
            const nextHelp = bumpHelp(help, 'scan')
            setHelp(nextHelp)
            onDone({ help: nextHelp, tries })
          }}
          onWalkedThrough={() => {
            const nextHelp = bumpHelp(help, 'walkthrough')
            setHelp(nextHelp)
            onDone({ help: nextHelp, tries })
          }}
          onCancel={() => setPhase('check')}
        />
      )}
    </div>
  )
}
