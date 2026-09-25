import { useEffect, useMemo } from 'react'
import { navigate, useRoute } from '../../router'
import { useProgress } from '../../store/progress'
import { usePiano } from '../../store/piano'
import { requestJourney } from '../../store/coach'
import { bestTakeId, milestones, pieceSeries } from '../../store/songProgress'
import { formatTotal, recentSeries, songStats } from '../../store/songStats'
import { localDay } from '../../store/sessions'
import { CoachCard } from '../../components/CoachCard'
import { MiniBarChart } from '../../components/MiniBarChart'
import { MiniLineChart } from '../../components/MiniLineChart'
import { TakePlayer } from '../../components/TakePlayer'

/** "2026-09-08" -> "Sep 8", for the stats card's first/last-played line. */
function monthDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Short day label for a chart's x-axis, e.g. "9/6" for 2026-09-06. */
function shortDayLabel(day: string): string {
  const parts = day.split('-')
  const m = Number(parts[1])
  const d = Number(parts[2])
  return `${m}/${d}`
}

function percentFormat(v: number): string {
  return `${Math.round(v * 100)}%`
}

function countFormat(v: number): string {
  return String(Math.round(v))
}

/**
 * A piece's whole story so far, for Nora: the written "how this song has
 * grown" summary, ribbons for what she's earned, a few small charts, her
 * best take, and every take of this piece. Kid-facing only - never renders
 * `ai.parent` text, `journeys[..].parent`, or a raw metrics table (see
 * ParentReview's "Song journeys" card for that, behind the PIN).
 *
 * Charts only ever use `hesitations`, `stumbles.length`, `coverage` and
 * `paceVsBest` - `tempoBpm` / `tempoDrift` / `steadiness` are unreliable on
 * real music (see TakeMetrics.paceVsBest's doc comment) and are never
 * charted here.
 */
export function SongJourney() {
  const { path } = useRoute()
  const pieceId = decodeURIComponent(path.replace(/^\/piano\/song\//, '').replace(/\/$/, ''))
  const progress = useProgress()
  const piano = usePiano()
  const piece = progress.settings.pianoPieces.find((p) => p.id === pieceId)
  const journey = piano.journeys?.[pieceId]

  useEffect(() => {
    void requestJourney(pieceId)
  }, [pieceId])

  const series = useMemo(() => pieceSeries(piano.takes, pieceId), [piano.takes, pieceId])
  const ribbons = useMemo(() => milestones(piano.takes, pieceId), [piano.takes, pieceId])
  const bestId = useMemo(() => bestTakeId(piano.takes, pieceId), [piano.takes, pieceId])
  const bestTake = bestId ? piano.takes.find((t) => t.id === bestId) : undefined
  // The plain take list shows every take of the piece, even one whose
  // matchToBest looked like a different piece and so was dropped from the
  // series/milestones/best-take math above.
  const pieceTakes = useMemo(
    () =>
      piano.takes
        .filter((t) => t.pieceId === pieceId && !t.isNote)
        .slice()
        .sort((a, b) => b.startedAt - a.startedAt),
    [piano.takes, pieceId],
  )

  const hasCoverage = series.some((p) => p.coverage !== undefined)
  const hasStumbles = series.some((p) => p.stumbles !== undefined)
  const hasPace = series.some((p) => p.pace !== undefined)

  const countMode = progress.settings.pianoCountMode ?? 'recording'
  const stats = useMemo(() => songStats(piano.takes, pieceId, countMode), [piano.takes, pieceId, countMode])
  const today = localDay()
  const dailySeries = useMemo(() => recentSeries(stats, today, 21), [stats, today])
  const barPoints = useMemo(
    () => dailySeries.map((d) => ({ label: monthDayLabel(d.day), value: d.plays, secondary: d.sec })),
    [dailySeries],
  )

  return (
    <div data-testid="song-journey" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', padding: '1rem 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>
          {piece ? `${piece.emoji} ${piece.name}` : '🎵 This song'}
        </h1>
        <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} onClick={() => navigate('/piano')}>
          ⬅ Back
        </button>
      </div>

      {stats.takes > 0 && (
        <div data-testid="song-stats" className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <strong style={{ fontSize: '1rem' }}>
            ▶ {stats.plays} play{stats.plays === 1 ? '' : 's'} · ⏱ {formatTotal(stats.totalSec)} · 📅 {stats.daysPlayed} day
            {stats.daysPlayed === 1 ? '' : 's'}
          </strong>
          {stats.firstDay && stats.lastDay && (
            <span style={{ fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
              first {monthDayLabel(stats.firstDay)} · last {monthDayLabel(stats.lastDay)}
            </span>
          )}
          <MiniBarChart points={barPoints} title="Plays per day" unit="plays" />
          <span style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>bars = plays, line = minutes</span>
        </div>
      )}

      {journey?.kid ? (
        <div className="cc-card" style={{ padding: '1.1rem' }}>
          <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.5 }}>{journey.kid}</p>
        </div>
      ) : (
        <div className="cc-card" style={{ padding: '1.1rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>
            Play this song a few more times and your journey will appear here ✨
          </p>
        </div>
      )}

      {ribbons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ribbons.map((ribbon) => (
            <div
              key={ribbon.id}
              className="cc-card"
              style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}
            >
              <strong style={{ fontSize: '0.95rem' }}>{ribbon.text}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>{ribbon.day}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <MiniLineChart
          title="Long pauses"
          goodDirection="down"
          min={0}
          format={countFormat}
          points={series.map((p) => ({ label: shortDayLabel(p.day), value: p.hesitations }))}
        />
        {hasStumbles && (
          <MiniLineChart
            title="Sticky spots"
            goodDirection="down"
            min={0}
            format={countFormat}
            points={series.map((p) => ({ label: shortDayLabel(p.day), value: p.stumbles }))}
          />
        )}
        {hasCoverage && (
          <MiniLineChart
            title="How far I got"
            goodDirection="up"
            min={0}
            max={1}
            format={percentFormat}
            points={series.map((p) => ({ label: shortDayLabel(p.day), value: p.coverage }))}
          />
        )}
        {hasPace && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <MiniLineChart
              title="Speed vs my best take"
              goodDirection="up"
              neutral
              format={percentFormat}
              points={series.map((p) => ({ label: shortDayLabel(p.day), value: p.pace }))}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)', paddingLeft: '0.25rem' }}>
              Slow practice is smart practice - speed is not a score.
            </span>
          </div>
        )}
      </div>

      {bestTake?.hasAudio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong>My best take so far ⭐</strong>
          <div className="cc-card" style={{ padding: '1rem' }}>
            <TakePlayer take={bestTake} />
          </div>
        </div>
      )}

      {pieceTakes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong>Every time I played it</strong>
          {pieceTakes.map((take) => (
            <div key={take.id} className="cc-card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--cc-ink-soft)' }}>
                {new Date(take.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <CoachCard take={take} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
