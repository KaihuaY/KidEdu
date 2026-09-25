import { useMemo, useState } from 'react'
import { navigate, useRoute } from '../../router'
import { useProgress, type PianoPiece, type PianoTake } from '../../store/progress'
import { dayDigest } from '../../store/dayDigest'
import { tokenEmojis } from '../../store/piano'
import { RECORD_LABELS, type RecordKey } from '../../store/records'
import { MOODS } from '../../store/journal'
import { dayOffset, formatClock, localDay } from '../../store/sessions'
import { DateStrip } from '../../components/DateStrip'
import { CoachCard } from '../../components/CoachCard'
import { TakePlayer } from '../../components/TakePlayer'
import { TeacherNoteViewer } from '../../components/TeacherNoteViewer'

/** "Today", "Yesterday", or "Monday, Sep 1" for any other local day. */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === dayOffset(today, -1)) return 'Yesterday'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function pieceLabel(pieceId: string | null, pieces: PianoPiece[]): string {
  const piece = pieceId ? pieces.find((p) => p.id === pieceId) : undefined
  return piece ? `${piece.emoji} ${piece.name}` : '🎵 Free play'
}

function formatRecordValue(key: RecordKey, value: number, pieceName: string | undefined): string {
  switch (key) {
    case 'longestTakeSec':
      return formatClock(value)
    case 'mostSecondsInDay':
      return `${Math.round(value / 60)} min`
    case 'mostPlaysOfSong':
      return pieceName ? `${value} × ${pieceName}` : `${value} plays`
    case 'longestStreakDays':
      return `${value} day${value === 1 ? '' : 's'}`
  }
}

function DayTakeRow({ take, pieces }: { take: PianoTake; pieces: PianoPiece[] }) {
  const [open, setOpen] = useState(false)
  const wallTime = new Date(take.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="cc-card" style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <button
        type="button"
        data-testid="day-take-row"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 44, textAlign: 'left' }}
      >
        <strong>{pieceLabel(take.pieceId, pieces)}</strong>
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>
          {wallTime} · {formatClock(take.durationSec)}
        </span>
      </button>
      <CoachCard take={take} compact />
      {open && <TakePlayer take={take} />}
    </div>
  )
}

/**
 * One day of piano, for the kid to look back on: what she played, the marks
 * she reached, what she wrote in her journal, any teacher note from that
 * week, records set that day, and any grown-up stars. Never shows the
 * parent-only coach note (CoachNote) - only the kid-facing CoachCard.
 */
export function DayView() {
  const { path } = useRoute()
  const day = path.replace(/^\/piano\/day\//, '').replace(/\/$/, '')
  const progress = useProgress()
  const today = localDay()
  const digest = useMemo(() => dayDigest(progress, day), [progress, day])
  const [noteViewerIndex, setNoteViewerIndex] = useState<number | null>(null)

  const isEmpty = digest.takes.length === 0 && digest.journal.length === 0 && digest.records.length === 0 && !digest.parentStars

  return (
    <div data-testid="day-view" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>{dayLabel(day, today)}</h1>

      <DateStrip selected={day} onSelect={(d) => navigate(`/piano/day/${d}`)} />

      {isEmpty && (
        <div className="cc-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>No piano this day</p>
        </div>
      )}

      {!isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>🎹 Played · {formatClock(digest.playedSec)}</strong>
          {digest.songs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {digest.songs.map((s) => (
                <div key={String(s.pieceId)} data-testid="day-song-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span>{pieceLabel(s.pieceId, progress.settings.pianoPieces)}</span>
                  <span style={{ color: 'var(--cc-ink-soft)' }}>
                    {s.plays} play{s.plays === 1 ? '' : 's'} · {formatClock(s.sec)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {digest.takes.length === 0 ? (
            <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>No takes recorded this day.</span>
          ) : (
            digest.takes.map((t) => <DayTakeRow key={t.id} take={t} pieces={progress.settings.pianoPieces} />)
          )}
        </div>
      )}

      {!isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>🎯 Marks</strong>
          {digest.marks.map((mark) => (
            <div key={mark.index} data-testid="day-mark-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>
                {mark.minutes} min · {tokenEmojis(mark.tokens) || '—'}
              </span>
              <span aria-hidden="true">{mark.reached ? '✓' : '·'}</span>
            </div>
          ))}
        </div>
      )}

      {digest.journal.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>📔 Journal</strong>
          {digest.journal.map((e) => (
            <div key={e.id} data-testid="day-journal-entry" className="cc-card" style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>
                {e.mood ? `${MOODS.find((m) => m.value === e.mood)?.emoji} ` : ''}
                {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.text}</p>
            </div>
          ))}
        </div>
      )}

      {digest.teacherNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>📓 Teacher note this week</strong>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {digest.teacherNotes.map((n, i) => (
              <button
                key={n.id}
                type="button"
                data-testid="day-teacher-note-thumb"
                onClick={() => setNoteViewerIndex(i)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <img src={n.thumbDataUrl} alt="Teacher note" style={{ width: 64, height: 64, borderRadius: '0.75rem', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
          {noteViewerIndex !== null && (
            <TeacherNoteViewer notes={digest.teacherNotes} initialIndex={noteViewerIndex} onClose={() => setNoteViewerIndex(null)} />
          )}
        </div>
      )}

      {digest.records.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ fontSize: '1.05rem' }}>🏆 Records set today</strong>
          {digest.records.map(({ key, entry }) => {
            const piece = entry.pieceId ? progress.settings.pianoPieces.find((p) => p.id === entry.pieceId) : undefined
            const label = RECORD_LABELS[key]
            return (
              <div key={key} data-testid="day-record-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span>
                  {label.emoji} {label.title}
                </span>
                <span style={{ fontWeight: 700 }}>{formatRecordValue(key, entry.value, piece?.name)}</span>
              </div>
            )
          })}
        </div>
      )}

      {digest.parentStars && (
        <p style={{ margin: 0, fontWeight: 700 }}>{'⭐'.repeat(digest.parentStars)} from your grown-up</p>
      )}

      <button type="button" className="cc-btn cc-btn-surface" style={{ alignSelf: 'center' }} onClick={() => navigate('/piano')}>
        ⬅ Back to piano
      </button>
    </div>
  )
}
