import { useEffect, useMemo, useState } from 'react'
import { useRecoveredTakeNotice } from '../../audio/recordingSession'
import { navigate } from '../../router'
import { useProgress, type PianoPiece, type PianoTake } from '../../store/progress'
import { pruneRecordings, setSelfRating, usePiano } from '../../store/piano'
import { goalProgress, pianoDaysDone, practiceSecondsForDay, steadyBeatDots } from '../../store/pianoRewards'
import { formatClock, lastNDays, localDay } from '../../store/sessions'
import { getAudioBackend, startTake } from '../../audio/recordingSession'
import { getRecordingStore, useLocalAudioIds } from '../../store/recordings'
import { buildFileName, processUploadQueue } from '../../store/driveUpload'
import { extensionFor } from '../../audio/mime'
import { RingTimer } from '../../components/RingTimer'
import { WeekDots } from '../../components/WeekDots'
import { BadgeToast } from '../../components/BadgeToast'
import { Metronome } from '../../components/Metronome'
import { SayIt } from '../../components/SayIt'
import { SelfRatingButtons } from '../../components/SelfRatingButtons'
import { TakePlayer } from '../../components/TakePlayer'
import { UploadChip } from '../../components/UploadChip'

const PIECE_STORAGE_KEY = 'cubeclimb.piano.piece'
const METRONOME_OPEN_KEY = 'cubeclimb.metronome.panelOpen'

function readMetronomeOpen(): boolean {
  try {
    return sessionStorage.getItem(METRONOME_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function storeMetronomeOpen(open: boolean): void {
  try {
    sessionStorage.setItem(METRONOME_OPEN_KEY, open ? '1' : '0')
  } catch {
    // ignore - just won't be remembered across a reload
  }
}

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

/** True when the platform can share an audio file of this mime type through the native share sheet. */
function useCanShareFiles(mimeType: string): boolean {
  return useMemo(() => {
    try {
      if (typeof navigator === 'undefined') return false
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
      // A tiny probe file is enough - canShare only checks type/shape, not content.
      const probe = new File([new Uint8Array(1)], `probe.${extensionFor(mimeType)}`, { type: mimeType })
      return navigator.canShare({ files: [probe] })
    } catch {
      return false
    }
  }, [mimeType])
}

/** Share (native share sheet) or download the local blob for a take. Renders nothing without a local blob. */
function ShareOrDownload({ take, piece }: { take: PianoTake; piece: PianoPiece | undefined }) {
  const canShare = useCanShareFiles(take.mimeType)
  const [busy, setBusy] = useState(false)

  async function handleShare() {
    setBusy(true)
    try {
      const blob = await getRecordingStore().get(take.id)
      if (!blob) return
      const file = new File([blob], buildFileName(take, piece?.name ?? null), { type: take.mimeType })
      await navigator.share({ files: [file] })
    } catch {
      // The share sheet was cancelled or failed silently - nothing to report.
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    try {
      const blob = await getRecordingStore().get(take.id)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildFileName(take, piece?.name ?? null)
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  if (canShare) {
    return (
      <button type="button" className="cc-btn cc-btn-surface" disabled={busy} onClick={() => void handleShare()}>
        📤 Share
      </button>
    )
  }

  return (
    <button type="button" className="cc-btn cc-btn-surface" disabled={busy} onClick={() => void handleDownload()}>
      ⬇ Download
    </button>
  )
}

function TakeCard({ take, piece }: { take: PianoTake; piece: PianoPiece | undefined }) {
  const localAudioIds = useLocalAudioIds()
  const isLocal = localAudioIds.has(take.id)

  const wallTime = new Date(take.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="cc-card" style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong>{pieceLabel(piece)}</strong>
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>{wallTime}</span>
      </div>
      <span style={{ fontWeight: 700 }}>{formatClock(take.activeSec)} played</span>
      {steadyBeatDots(take.steadiness) && (
        <span style={{ fontSize: '0.9rem', color: 'var(--cc-ink-soft)' }}>
          Steady beat: <span style={{ letterSpacing: '0.15em', color: 'var(--cc-primary)' }}>{steadyBeatDots(take.steadiness)}</span>
        </span>
      )}
      {piece?.goal && <span style={{ color: 'var(--cc-ink-soft)' }}>{take.goalHit ? '🎯 ✅' : '🎯 ⬜'}</span>}
      <SelfRatingButtons value={take.selfRating} onChange={(rating) => setSelfRating(take.id, rating)} />
      <TakePlayer take={take} />
      {isLocal && <ShareOrDownload take={take} piece={piece} />}
      <UploadChip take={take} />
    </div>
  )
}

export function PianoHome() {
  const progress = useProgress()
  const piano = usePiano()
  const { kidName, pianoPieces, goalMinutes, recordingKeepDays } = progress.settings
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(() => readStoredPieceId())
  const [metronomeOpen, setMetronomeOpen] = useState<boolean>(() => readMetronomeOpen())

  useEffect(() => {
    void pruneRecordings(recordingKeepDays)
    // Runs once on mount - recordingKeepDays rarely changes mid-session, and
    // pruning again on a re-render for an unrelated reason is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Catches anything the 30s worker timer hasn't gotten to yet the moment
    // Piano home is opened - the worker (main.tsx) already runs this on the
    // same cadence, this is just "don't make her wait for the next tick".
    void processUploadQueue()
  }, [])

  const today = localDay()
  const countMode = progress.settings.pianoCountMode ?? 'recording'
  const countedSec = practiceSecondsForDay(piano.takes, today, countMode)
  const goalMin = goalMinutes.piano
  const week = lastNDays(7, today)
  const daysDone = useMemo(() => pianoDaysDone(piano), [piano])
  // A grown-up's voice note is recorded through the same take pipeline but
  // is never one of Nora's own takes - see src/store/notes.ts.
  const todayTakes = useMemo(
    () =>
      piano.takes
        .filter((t) => t.day === today && !t.isNote)
        .slice()
        .reverse(),
    [piano.takes, today],
  )
  const todayParentStars = piano.days[today]?.parentStars
  const supported = getAudioBackend().isSupported()
  const recoveredCount = useRecoveredTakeNotice()

  const selectedPiece = pianoPieces.find((p) => p.id === selectedPieceId)

  function pickPiece(id: string | null) {
    setSelectedPieceId(id)
    storePieceId(id)
  }

  function toggleMetronomeOpen() {
    const next = !metronomeOpen
    setMetronomeOpen(next)
    storeMetronomeOpen(next)
  }

  function handleRecord() {
    // Must run synchronously from this tap handler - Safari only grants the
    // mic prompt inside the gesture that requested it.
    void startTake(selectedPieceId)
    navigate('/piano/record')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <BadgeToast />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Piano time, {kidName}! 🎹</h1>
        <SayIt text={`Piano time, ${kidName}!`} />
      </div>

      {recoveredCount > 0 && (
        <div className="cc-card" style={{ padding: '0.85rem 1rem', fontWeight: 700, background: '#fff8e6' }}>
          💾 We saved {recoveredCount === 1 ? 'an unfinished recording' : `${recoveredCount} unfinished recordings`} from earlier. It is in today&apos;s list.
        </div>
      )}

      <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <RingTimer size={120} progress={goalProgress(countedSec, goalMin)} label={formatClock(countedSec)} sublabel={`of ${goalMin} min`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <WeekDots days={week} done={daysDone} />
          {todayParentStars && (
            <span style={{ fontWeight: 700 }}>
              {'⭐'.repeat(todayParentStars)} from your grown-up
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
        {selectedPiece?.goal && (
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-primary)' }}>🎯 This week: {selectedPiece.goal}</p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 56, justifyContent: 'space-between', display: 'flex' }}
          onClick={toggleMetronomeOpen}
          aria-expanded={metronomeOpen}
        >
          <span>🎵 Metronome</span>
          <span aria-hidden>{metronomeOpen ? '▲' : '▼'}</span>
        </button>
        {metronomeOpen && <Metronome pieceId={selectedPieceId} />}
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
