import type { PianoTake, TakeMetrics } from '../store/progress'
import { requestFeedback, useCoachStage } from '../store/coach'
import { formatClock } from '../store/sessions'

function formatPercent(v: number): string {
  return `${Math.round(v * 100)} %`
}

/**
 * Every measurement in plain words, e.g. "Played 1:12 · Long pauses 1
 * (longest 2.4 s) · Loud/soft range 14 dB · Got through 85 % of the piece ·
 * Sticky spots 3 · Speed 92 % of best take · Match 0.91".
 *
 * `tempoBpm` / `tempoDrift` / `steadiness` are deliberately never shown here
 * - they're unreliable on real music (see TakeMetrics.paceVsBest's doc
 * comment in progress.ts); `paceVsBest` is the trustworthy speed measure.
 */
function metricLines(m: TakeMetrics): string[] {
  const lines: string[] = [`Played ${formatClock(Math.round(m.playedSec))}`]

  lines.push(
    `Long pauses ${m.hesitations}${m.hesitations > 0 ? ` (longest ${m.longestPauseSec.toFixed(1)} s)` : ''}`,
  )

  lines.push(`Loud/soft range ${Math.round(m.dynamicRangeDb)} dB`)

  if (m.coverage !== undefined) lines.push(`Got through ${formatPercent(m.coverage)} of the piece`)
  if (m.stumbles !== undefined) lines.push(`Sticky spots ${m.stumbles.length}`)
  if (m.paceVsBest !== undefined) lines.push(`Speed ${formatPercent(m.paceVsBest)} of best take`)
  if (m.matchToBest !== undefined) lines.push(`Match ${m.matchToBest.toFixed(2)}`)

  return lines
}

/**
 * Grown-up-only coach feedback for one take: the written parent note, a
 * plain-words metrics readout, a source tag, and a refresh button. Rendered
 * only inside ParentReview, itself PIN-gated - `ai.parent` and raw numbers
 * must never appear anywhere else (see CoachCard for the kid-facing text).
 */
export function CoachNote({ take }: { take: PianoTake }) {
  const stage = useCoachStage(take.id)
  const ai = take.ai

  if (!ai) {
    return (
      <div data-testid="coach-note" className="cc-card" style={{ padding: '0.9rem' }}>
        <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No coach feedback for this take yet.</p>
      </div>
    )
  }

  const writing = stage === 'writing'

  return (
    <div data-testid="coach-note" className="cc-card" style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {ai.parent?.note ? (
        <p style={{ margin: 0 }}>{ai.parent.note}</p>
      ) : (
        <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No written note for this take yet.</p>
      )}
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>{metricLines(ai.metrics).join(' · ')}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>
          {ai.source === 'claude' ? 'written by Claude' : 'built-in phrases'}
        </span>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 56 }}
          disabled={writing}
          onClick={() => void requestFeedback(take.id, { force: true })}
        >
          ↻ Refresh feedback
        </button>
      </div>
    </div>
  )
}
