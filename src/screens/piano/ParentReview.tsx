import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../../router'
import { useProgress, type ParentStars, type PianoPiece, type PianoSection, type PianoTake, type SelfRating } from '../../store/progress'
import { markAudioPruned, setParentStars, usePiano } from '../../store/piano'
import { activeSecondsForDay, daysNeedingParentRating, takesForDay } from '../../store/pianoRewards'
import { dayOffset, formatClock, localDay } from '../../store/sessions'
import { formatBytes, getRecordingStore } from '../../store/recordings'
import { PinGate } from '../../components/PinGate'
import { TakePlayer } from '../../components/TakePlayer'
import { UploadChip } from '../../components/UploadChip'
import { fireConfetti } from '../../components/Confetti'

const SELF_RATING_EMOJI: Record<SelfRating, string> = { 1: '😕', 2: '🙂', 3: '🤩' }

function pieceLabel(piece: PianoPiece | undefined): string {
  return piece ? `${piece.emoji} ${piece.name}` : '🎵 Free play'
}

/** "Today", "Yesterday", or "Monday, Sep 1" for any other local day. */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  if (day === dayOffset(today, -1)) return 'Yesterday'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function TakeRow({ take, piece }: { take: PianoTake; piece: PianoPiece | undefined }) {
  const wallTime = new Date(take.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong>{pieceLabel(piece)}</strong>
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>{wallTime}</span>
      </div>
      <span>
        {formatClock(take.activeSec)} played of {formatClock(take.durationSec)}
      </span>
      {take.selfRating && (
        <span style={{ color: 'var(--cc-ink-soft)' }}>
          {'Nora felt: '}
          {SELF_RATING_EMOJI[take.selfRating]}
        </span>
      )}
      <TakePlayer take={take} />
      <UploadChip take={take} />
    </div>
  )
}

function DayCard({
  day,
  today,
  piano,
  pianoPieces,
  kidName,
  onRated,
}: {
  day: string
  today: string
  piano: PianoSection
  pianoPieces: PianoPiece[]
  kidName: string
  onRated: (day: string, message: string) => void
}) {
  const takes = useMemo(() => takesForDay(piano.takes, day), [piano.takes, day])
  const activeSec = activeSecondsForDay(piano.takes, day)

  function rate(stars: ParentStars) {
    const tier = setParentStars(day, stars)
    if (tier) {
      fireConfetti('small')
      onRated(day, `Gave ${kidName} a ${tier} token 🎉`)
    } else {
      onRated(day, 'Stars saved')
    }
  }

  return (
    <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong style={{ fontSize: '1.05rem' }}>{dayLabel(day, today)}</strong>
        <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 700 }}>{formatClock(activeSec)} played</span>
      </div>
      {takes.map((take) => (
        <TakeRow key={take.id} take={take} piece={pianoPieces.find((p) => p.id === take.pieceId)} />
      ))}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {([1, 2, 3] as ParentStars[]).map((n) => (
          <button
            key={n}
            type="button"
            className="cc-btn cc-btn-surface"
            style={{ minHeight: 56, flex: 1, fontSize: '1.1rem' }}
            onClick={() => rate(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            {'⭐'.repeat(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ParentReview() {
  const progress = useProgress()
  const [unlocked, setUnlocked] = useState(false)

  if (!unlocked) {
    return <PinGate pin={progress.settings.pin} onUnlock={() => setUnlocked(true)} title="Grown-up listen" />
  }

  return <ParentReviewContent />
}

function ParentReviewContent() {
  const progress = useProgress()
  const piano = usePiano()
  const { kidName, pianoPieces } = progress.settings
  const today = localDay()

  const needsRating = useMemo(() => daysNeedingParentRating(piano, today), [piano, today])
  const ratedDays = useMemo(
    () =>
      Object.keys(piano.days)
        .filter((day) => piano.days[day]?.parentStars)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
    [piano],
  )

  const [justRated, setJustRated] = useState<Record<string, string>>({})
  function handleRated(day: string, message: string) {
    setJustRated((prev) => ({ ...prev, [day]: message }))
  }

  const visibleDays = useMemo(() => {
    const set = new Set([...needsRating, ...Object.keys(justRated)])
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  }, [needsRating, justRated])

  const [recordingStats, setRecordingStats] = useState<{ count: number; bytes: number } | null>(null)
  useEffect(() => {
    const store = getRecordingStore()
    Promise.all([store.list(), store.usageBytes()]).then(([items, bytes]) => {
      setRecordingStats({ count: items.length, bytes })
    })
    // Runs once on mount - the recordings store lives outside React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  async function handleDeleteAll() {
    const store = getRecordingStore()
    const items = await store.list()
    await store.clear()
    markAudioPruned(items.map((item) => item.id))
    setConfirmingDelete(false)
    setRecordingStats({ count: 0, bytes: 0 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Listen to {kidName}&apos;s playing</h1>
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>
        Give each day 1–3 stars. 2 stars = a silver token, 3 stars = a gold token.
      </p>

      {visibleDays.length === 0 ? (
        <div className="cc-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>All caught up - nothing waiting for a rating.</p>
        </div>
      ) : (
        visibleDays.map((day) => {
          const rated = !!piano.days[day]?.parentStars
          if (rated) {
            return (
              <div
                key={day}
                className="cc-card"
                style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
              >
                <div>
                  <strong>{dayLabel(day, today)}</strong>
                  <div style={{ color: 'var(--cc-ink-soft)' }}>{'⭐'.repeat(piano.days[day]?.parentStars ?? 0)}</div>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--cc-primary)' }}>{justRated[day] ?? 'Stars saved'}</span>
              </div>
            )
          }
          return (
            <DayCard
              key={day}
              day={day}
              today={today}
              piano={piano}
              pianoPieces={pianoPieces}
              kidName={kidName}
              onRated={handleRated}
            />
          )
        })
      )}

      {ratedDays.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Rated days ({ratedDays.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
            {ratedDays.map((day) => (
              <div key={day} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>{dayLabel(day, today)}</span>
                <span>{'⭐'.repeat(piano.days[day]?.parentStars ?? 0)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          Recordings on this device: {recordingStats?.count ?? '…'} ·{' '}
          {recordingStats ? formatBytes(recordingStats.bytes) : '…'}
        </p>
        {!confirmingDelete ? (
          <button type="button" className="cc-btn cc-btn-surface" onClick={() => setConfirmingDelete(true)}>
            🗑️ Delete all recordings on this device
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="cc-btn"
              style={{ background: 'var(--cc-danger)', color: '#fff' }}
              onClick={() => void handleDeleteAll()}
            >
              Really delete?
            </button>
            <button type="button" className="cc-btn cc-btn-surface" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <button type="button" className="cc-btn cc-btn-surface" style={{ alignSelf: 'center' }} onClick={() => navigate('/piano')}>
        ⬅ Back to piano
      </button>
    </div>
  )
}
