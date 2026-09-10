import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../../router'
import { useProgress, type ParentStars, type PianoPiece, type PianoSection, type PianoTake, type SelfRating } from '../../store/progress'
import { markAudioPruned, setParentStars, usePiano } from '../../store/piano'
import { daysNeedingParentRating, heardSecondsForDay, steadyBeatDots, takesForDay } from '../../store/pianoRewards'
import { dayOffset, formatClock, localDay } from '../../store/sessions'
import { formatBytes, getRecordingStore } from '../../store/recordings'
import { addNote } from '../../store/notes'
import { dismiss, isRecordingActive, startTake, stopTake, useRecordingSession } from '../../audio/recordingSession'
import { PinGate } from '../../components/PinGate'
import { TakePlayer } from '../../components/TakePlayer'
import { UploadChip } from '../../components/UploadChip'
import { BadgeToast } from '../../components/BadgeToast'
import { fireConfetti } from '../../components/Confetti'

const NOTE_MAX_LENGTH = 140
const VOICE_NOTE_MAX_SECONDS = 15

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
      {steadyBeatDots(take.steadiness) && (
        <span style={{ color: 'var(--cc-ink-soft)' }}>
          Steady beat: <span style={{ letterSpacing: '0.15em', color: 'var(--cc-primary)' }}>{steadyBeatDots(take.steadiness)}</span>
        </span>
      )}
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

/**
 * Lets a grown-up leave a note for one day's practice: a short typed text,
 * or a 15s voice note recorded through the same take pipeline as practice
 * (flagged `isNote` in startTake so it never counts toward goals or shows up
 * in Nora's own take list - see src/store/pianoRewards.ts / PianoHome.tsx).
 * `recordingNote` tracks whether *this* card is the one that started the
 * current global recording session, so two DayCards rendered at once never
 * both react to the same in-flight recording.
 */
function DayNoteComposer({ day, kidName }: { day: string; kidName: string }) {
  const session = useRecordingSession()
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [recordingNote, setRecordingNote] = useState(false)

  useEffect(() => {
    if (!recordingNote) return
    if (session.status === 'done') {
      if (!session.discarded) {
        addNote({ about: 'piano', day, audioTakeId: session.take.id })
        setSent(true)
      }
      setRecordingNote(false)
      dismiss()
    } else if (session.status === 'error') {
      setRecordingNote(false)
      dismiss()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, recordingNote])

  function sendTextNote() {
    const trimmed = text.trim()
    if (!trimmed) return
    addNote({ about: 'piano', day, text: trimmed })
    setText('')
    setSent(true)
  }

  function startVoiceNote() {
    setRecordingNote(true)
    void startTake('note', { isNote: true, maxSeconds: VOICE_NOTE_MAX_SECONDS })
  }

  const isRecordingNow = recordingNote && isRecordingActive(session)
  const busyElsewhere = !recordingNote && isRecordingActive(session)

  if (sent) {
    return (
      <div style={{ borderTop: '1px solid var(--cc-border)', paddingTop: '0.75rem' }}>
        <span style={{ color: 'var(--cc-success)', fontWeight: 700 }}>Note sent 💌</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--cc-border)', paddingTop: '0.75rem' }}>
      <strong style={{ fontSize: '0.9rem' }}>💬 Add a note</strong>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX_LENGTH))}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        placeholder={`A little note for ${kidName}…`}
        disabled={isRecordingNow}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          disabled={!text.trim() || isRecordingNow}
          onClick={sendTextNote}
        >
          Send 💌
        </button>
        {isRecordingNow ? (
          <button
            type="button"
            className="cc-btn"
            style={{ background: 'var(--cc-danger)', color: '#fff' }}
            disabled={session.status !== 'recording'}
            onClick={() => void stopTake('user')}
          >
            {session.status === 'recording' ? '⏹ Stop' : session.status === 'starting' ? 'Getting ready…' : 'Saving…'}
          </button>
        ) : (
          <button type="button" className="cc-btn cc-btn-surface" disabled={busyElsewhere} onClick={startVoiceNote}>
            🎙️ Say it ({VOICE_NOTE_MAX_SECONDS} s)
          </button>
        )}
      </div>
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
  const activeSec = heardSecondsForDay(piano.takes, day)

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
      <DayNoteComposer day={day} kidName={kidName} />
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
      <BadgeToast />
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
