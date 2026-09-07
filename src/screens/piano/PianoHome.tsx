import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../../router'
import { useProgress, type PianoPiece, type PianoTake } from '../../store/progress'
import { pruneRecordings, setSelfRating, usePiano } from '../../store/piano'
import { activeSecondsForDay, goalProgress, pianoDaysDone } from '../../store/pianoRewards'
import { formatClock, lastNDays, localDay } from '../../store/sessions'
import { getAudioBackend, startTake } from '../../audio/recordingSession'
import { getRecordingStore, useLocalAudioIds } from '../../store/recordings'
import { RingTimer } from '../../components/RingTimer'
import { WeekDots } from '../../components/WeekDots'
import { SayIt } from '../../components/SayIt'
import { SelfRatingButtons } from '../../components/SelfRatingButtons'

const PIECE_STORAGE_KEY = 'cubeclimb.piano.piece'

function readStoredPieceId(): string | null {
  try {
    const raw = sessionStorage.getItem(PIECE_STORAGE_KEY)
    return raw && raw !== 'free' ? raw : null
  } catch {
    return null
  }
}

function storePieceId(id: string | null): void {
  try {
    sessionStorage.setItem(PIECE_STORAGE_KEY, id ?? 'free')
  } catch {
    // ignore - just won't be remembered across a reload
  }
}

function pieceLabel(piece: PianoPiece | undefined): string {
  return piece ? `${piece.emoji} ${piece.name}` : '🎵 Free play'
}

function TakeCard({ take, piece }: { take: PianoTake; piece: PianoPiece | undefined }) {
  const localAudioIds = useLocalAudioIds()
  const isLocal = localAudioIds.has(take.id)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  async function handleListen() {
    if (objectUrl || loadingAudio) return
    setLoadingAudio(true)
    try {
      const blob = await getRecordingStore().get(take.id)
      if (blob) setObjectUrl(URL.createObjectURL(blob))
    } finally {
      setLoadingAudio(false)
    }
  }

  const wallTime = new Date(take.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const uploadLine =
    take.upload?.status === 'done'
      ? '☁️ Saved to Drive'
      : take.upload?.status === 'pending' || take.upload?.status === 'uploading'
        ? '☁️ Waiting to upload'
        : take.upload?.status === 'failed'
          ? '☁️ Upload failed'
          : null

  return (
    <div className="cc-card" style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong>{pieceLabel(piece)}</strong>
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>{wallTime}</span>
      </div>
      <span style={{ fontWeight: 700 }}>{formatClock(take.activeSec)} played</span>
      <SelfRatingButtons value={take.selfRating} onChange={(rating) => setSelfRating(take.id, rating)} />
      {isLocal ? (
        objectUrl ? (
          <audio controls playsInline src={objectUrl} style={{ width: '100%' }} />
        ) : (
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            disabled={loadingAudio}
            onClick={() => void handleListen()}
          >
            ▶ {loadingAudio ? 'Loading…' : 'Listen'}
          </button>
        )
      ) : take.upload?.driveUrl ? (
        <audio controls src={take.upload.driveUrl} style={{ width: '100%' }} />
      ) : (
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>Recorded on another device</span>
      )}
      {uploadLine && <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>{uploadLine}</span>}
    </div>
  )
}

export function PianoHome() {
  const progress = useProgress()
  const piano = usePiano()
  const { kidName, parentName, pianoPieces, goalMinutes, recordingKeepDays } = progress.settings
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(() => readStoredPieceId())

  useEffect(() => {
    void pruneRecordings(recordingKeepDays)
    // Runs once on mount - recordingKeepDays rarely changes mid-session, and
    // pruning again on a re-render for an unrelated reason is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = localDay()
  const activeSec = activeSecondsForDay(piano.takes, today)
  const goalMin = goalMinutes.piano
  const week = lastNDays(7, today)
  const daysDone = useMemo(() => pianoDaysDone(piano), [piano])
  const todayTakes = useMemo(() => piano.takes.filter((t) => t.day === today).slice().reverse(), [piano.takes, today])
  const todayParentStars = piano.days[today]?.parentStars
  const supported = getAudioBackend().isSupported()

  function pickPiece(id: string | null) {
    setSelectedPieceId(id)
    storePieceId(id)
  }

  function handleRecord() {
    // Must run synchronously from this tap handler - Safari only grants the
    // mic prompt inside the gesture that requested it.
    void startTake(selectedPieceId)
    navigate('/piano/record')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Piano time, {kidName}! 🎹</h1>
        <SayIt text={`Piano time, ${kidName}!`} />
      </div>

      <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <RingTimer size={120} progress={goalProgress(activeSec, goalMin)} label={formatClock(activeSec)} sublabel={`of ${goalMin} min`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <WeekDots days={week} done={daysDone} />
          {todayParentStars && (
            <span style={{ fontWeight: 700 }}>
              {'⭐'.repeat(todayParentStars)} from {parentName}
            </span>
          )}
        </div>
      </div>

      <div className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <strong>What are you playing?</strong>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {pianoPieces.map((piece) => (
            <button
              key={piece.id}
              type="button"
              className={`cc-btn ${selectedPieceId === piece.id ? 'cc-btn-primary' : 'cc-btn-surface'}`}
              style={{ minHeight: 56 }}
              onClick={() => pickPiece(piece.id)}
            >
              {piece.emoji} {piece.name}
            </button>
          ))}
          <button
            type="button"
            className={`cc-btn ${selectedPieceId === null ? 'cc-btn-primary' : 'cc-btn-surface'}`}
            style={{ minHeight: 56 }}
            onClick={() => pickPiece(null)}
          >
            🎵 Free play
          </button>
        </div>
        {pianoPieces.length === 0 && (
          <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
            Ask a grown-up to add your pieces in Settings.
          </span>
        )}
      </div>

      {supported ? (
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          style={{ minHeight: 96, width: '100%', fontSize: '1.3rem' }}
          onClick={handleRecord}
        >
          🎙️ Record
        </button>
      ) : (
        <div className="cc-card" style={{ padding: '1.1rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>This browser can&apos;t hear the piano. Try Safari or Chrome.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <strong>Today&apos;s playing</strong>
        {todayTakes.length === 0 ? (
          <span style={{ color: 'var(--cc-ink-soft)' }}>No takes yet today.</span>
        ) : (
          todayTakes.map((take) => (
            <TakeCard key={take.id} take={take} piece={pianoPieces.find((p) => p.id === take.pieceId)} />
          ))
        )}
      </div>

      <button type="button" className="cc-btn cc-btn-surface" style={{ alignSelf: 'center' }} onClick={() => navigate('/piano/review')}>
        👀 Grown-up review
      </button>
    </div>
  )
}
