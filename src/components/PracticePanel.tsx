import { useEffect, useMemo, useRef, useState } from 'react'
import { TwistyCube } from './TwistyCube'
import { MoveArrows } from './MoveArrows'
import { SayIt } from './SayIt'
import { VirtualCubeInput } from '../input/CubeInput'
import { SOLVED, parseAlg } from '../engine/cube'
import { describeMove } from '../content/moveNames'

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

export function MoveLabel({ move, showLetters }: { move: string; showLetters: boolean }) {
  const described = describeMove(move)
  return (
    <span>
      {described.name}
      {described.detail ? ` (${described.detail})` : ''}
      {showLetters ? <span style={{ opacity: 0.6, fontWeight: 700 }}> ({move})</span> : null}
    </span>
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

export interface PracticePanelProps {
  prompt: string
  say: string
  sequence: string
  /** When given, each sequence runs once in order and only the LAST completion calls onComplete. */
  sequences?: string[]
  tempoScale: number
  showLetters?: boolean
  onComplete: (tries: number) => void
}

/** A tap-along drill: taps MoveArrows in order, animating the sequence on a TwistyCube as she goes. */
export function PracticePanel({
  prompt,
  say,
  sequence,
  sequences,
  tempoScale,
  showLetters = false,
  onComplete,
}: PracticePanelProps) {
  const list = sequences && sequences.length > 0 ? sequences : [sequence]
  const [index, setIndex] = useState(0)
  const [totalTries, setTotalTries] = useState(0)
  const current = list[index]

  const runner = useSequenceRunner(current, ({ tries }) => {
    const newTotal = totalTries + tries
    if (index + 1 >= list.length) {
      onComplete(newTotal)
    } else {
      setTotalTries(newTotal)
      setIndex((i) => i + 1)
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{prompt}</p>
        <SayIt text={say} />
      </div>
      {list.length > 1 && (
        <p style={{ margin: 0, color: 'var(--cc-ink-soft)', fontWeight: 700, fontSize: '0.85rem' }}>
          {index + 1} / {list.length}
        </p>
      )}
      <div
        className="cc-card"
        style={{ height: 260, padding: '0.5rem', animation: runner.shake ? 'cc-shake 400ms' : undefined }}
      >
        <TwistyCube setupAlg="z2" alg={runner.alg} tempoScale={tempoScale} controls="none" />
      </div>
      {runner.nextExpected && (
        <div className="cc-card" data-expected-move={runner.nextExpected} style={{ padding: '0.75rem 1rem', background: 'var(--cc-bg)' }}>
          Next move: <strong><MoveLabel move={runner.nextExpected} showLetters={showLetters} /></strong>
        </div>
      )}
      <MoveArrows onMove={runner.tapMove} />
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>Tries this attempt: {runner.tries}</p>
    </div>
  )
}
