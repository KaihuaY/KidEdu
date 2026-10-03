import { useEffect, useMemo, useState } from 'react'
import { useRecoveredTakeNotice } from '../../audio/recordingSession'
import { navigate } from '../../router'
import { useProgress, type PianoPiece, type PianoTake } from '../../store/progress'
import { allSongTargetsMet, pruneRecordings, setSelfRating, songTargetsForDay, usePiano } from '../../store/piano'
import { goalProgress, pianoDaysDone, practiceSecondsForDay, steadyBeatDots } from '../../store/pianoRewards'
import { formatClock, lastNDays, localDay } from '../../store/sessions'
import { groupPieces, pieceStatus, playsForDay } from '../../store/songStats'
import { claimTomorrowFirstApply, tomorrowFirstFor } from '../../store/tomorrowFirst'
import { randomStatus, readPick, takeFreshSpinRequest, RANDOM_GOAL } from '../../store/randomSong'
import { sickDays } from '../../store/sickDays'
import { StreakCalendar } from '../../components/StreakCalendar'
import { RandomSongPicker } from '../../components/RandomSongPicker'
import { getAudioBackend, startTake } from '../../audio/recordingSession'
import { getRecordingStore, useLocalAudioIds } from '../../store/recordings'
import { buildFileName, processUploadQueue } from '../../store/driveUpload'
import { extensionFor } from '../../audio/mime'
import { kidKey } from '../../store/kid'
import { RingTimer } from '../../components/RingTimer'
import { SongChip, SONG_GRID_STYLE } from '../../components/SongChip'
import { WeekDots } from '../../components/WeekDots'
import { BadgeToast } from '../../components/BadgeToast'
import { CoachCard } from '../../components/CoachCard'
import { Metronome } from '../../components/Metronome'
import { RecordsCard } from '../../components/RecordsCard'
import { SayIt } from '../../components/SayIt'
import { SelfRatingButtons } from '../../components/SelfRatingButtons'
import { TakePlayer } from '../../components/TakePlayer'
import { TeacherNotesCard } from '../../components/TeacherNotesCard'
import { TierStrip } from '../../components/TierStrip'
import { UploadChip } from '../../components/UploadChip'

/** Resolved at call time (not module load) so tests can switch kids - see src/store/kid.ts. */
function pieceStorageKey(): string {
  return kidKey('cubeclimb.piano.piece')
}

function metronomeOpenKey(): string {
  return kidKey('cubeclimb.metronome.panelOpen')
}

function readMetronomeOpen(): boolean {
  try {
    return sessionStorage.getItem(metronomeOpenKey()) === '1'
  } catch {
    return false
  }
}

function storeMetronomeOpen(open: boolean): void {
  try {
    sessionStorage.setItem(metronomeOpenKey(), open ? '1' : '0')
  } catch {
    // ignore - just won't be remembered across a reload
  }
}

function readStoredPieceId(): string | null {
  try {
    const raw = sessionStorage.getItem(pieceStorageKey())
    return raw && raw !== 'free' ? raw : null
  } catch {
    return null
  }
}

function storePieceId(id: string | null): void {
  try {
    sessionStorage.setItem(pieceStorageKey(), id ?? 'free')
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
      <CoachCard take={take} compact />
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
  const [moreSongsOpen, setMoreSongsOpen] = useState(false)

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
  const sickSet = useMemo(() => new Set(sickDays(piano)), [piano])
  const playsToday = useMemo(() => playsForDay(piano.takes, today), [piano.takes, today])
  const songTargets = useMemo(
    () => songTargetsForDay(pianoPieces, piano.takes, today),
    [pianoPieces, piano.takes, today],
  )
  const songTargetsAllMet = useMemo(
    () => allSongTargetsMet(pianoPieces, piano.takes, today),
    [pianoPieces, piano.takes, today],
  )
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
  const groups = useMemo(() => groupPieces(pianoPieces, piano.takes), [pianoPieces, piano.takes])

  // A selected piece that got archived (or removed) since she last picked it
  // falls back to Free play - never silently records against a hidden piece.
  useEffect(() => {
    if (selectedPieceId === null) return
    const piece = pianoPieces.find((p) => p.id === selectedPieceId)
    if (!piece || pieceStatus(piece) === 'archived') {
      setSelectedPieceId(null)
      storePieceId(null)
    }
  }, [selectedPieceId, pianoPieces])

  // How many takes exist of each piece (all-time, not just today) - a "📈
  // Journey" button only makes sense once there's more than one take to
  // compare.
  const pieceTakeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of piano.takes) {
      if (t.isNote || !t.pieceId) continue
      counts.set(t.pieceId, (counts.get(t.pieceId) ?? 0) + 1)
    }
    return counts
  }, [piano.takes])

  function pickPiece(id: string | null) {
    setSelectedPieceId(id)
    storePieceId(id)
  }

  // "Tomorrow, start with…" chosen on yesterday's done screen: pre-select it
  // the first time Piano home opens on that day (once per device), so a
  // later manual pick is never undone by a reload.
  const firstSongToday = tomorrowFirstFor(progress, today)
  useEffect(() => {
    if (firstSongToday && claimTomorrowFirstApply(today)) pickPiece(firstSongToday.id)
    // On mount only - the claim is what makes this a one-time nudge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Surprise song (store/randomSong.ts): the grown-up's 🎲 list, today's count
  // out of 10, and the pick waiting to be recorded on this device. The done
  // screen's "Next surprise song" button leaves a one-shot flag so Piano home
  // opens straight into a fresh spin.
  const [pickerOpen, setPickerOpen] = useState<null | 'open' | 'fresh'>(() => (takeFreshSpinRequest() ? 'fresh' : null))
  const random = useMemo(() => randomStatus(progress, today), [progress, today])
  const randomDone = Math.min(random.done, random.goal)
  const pendingPick = random.poolSize > 0 ? readPick(today) : null
  const pendingPiece = pendingPick ? pianoPieces.find((p) => p.id === pendingPick.pieceId) : undefined

  function handleRandomRecord(pieceId: string) {
    // Same rule as handleRecord: startTake must run inside the tap.
    pickPiece(pieceId)
    void startTake(pieceId, { random: true })
    navigate('/piano/record')
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
        <div className="cc-card" style={{ padding: '0.85rem 1rem', fontWeight: 700, background: 'var(--cc-tint-warm)' }}>
          💾 We saved {recoveredCount === 1 ? 'an unfinished recording' : `${recoveredCount} unfinished recordings`} from earlier. It is in today&apos;s list.
        </div>
      )}

      <div className="cc-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <RingTimer size={120} progress={goalProgress(countedSec, goalMin)} label={formatClock(countedSec)} sublabel={`of ${goalMin} min`} />
        {random.poolSize > 0 && (
          <button
            type="button"
            data-testid="random-ring"
            aria-label={`Surprise songs today: ${randomDone} of ${random.goal}. ${random.goal} earns a gold box.`}
            onClick={() => setPickerOpen('open')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--cc-ink)' }}
          >
            <RingTimer size={96} color="var(--cc-accent)" progress={randomDone / random.goal} label={`${randomDone}/${random.goal}`} sublabel="🎲 songs" />
            <span data-testid="random-reward-caption" style={{ fontSize: '0.8rem', fontWeight: 700, color: random.earned ? 'var(--cc-success)' : 'var(--cc-ink-soft)' }}>
              {random.earned ? '🟡 earned today!' : `${RANDOM_GOAL} = 🟡 gold box`}
            </span>
          </button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <WeekDots days={week} done={daysDone} sick={sickSet} />
          <button
            type="button"
            data-testid="plays-today"
            onClick={() => navigate('/piano/songs')}
            style={{ minHeight: 44, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', fontWeight: 700, color: 'var(--cc-ink)' }}
          >
            {playsToday === 0 ? '🎵 No songs yet today' : `🎵 ${playsToday} song${playsToday === 1 ? '' : 's'} played today`}
          </button>
          {todayParentStars && (
            <span style={{ fontWeight: 700 }}>
              {'⭐'.repeat(todayParentStars)} from your grown-up
            </span>
          )}
        </div>
      </div>

      <TierStrip onOpenRandom={() => setPickerOpen('open')} />

      <StreakCalendar />

      {pickerOpen && (
        <RandomSongPicker
          today={today}
          freshSpin={pickerOpen === 'fresh'}
          onRecord={handleRandomRecord}
          onClose={() => setPickerOpen(null)}
        />
      )}

      <div className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <strong>What are you playing?</strong>
        {random.poolSize > 0 ? (
          <>
            <button
              type="button"
              data-testid="surprise-me"
              className="cc-btn cc-btn-accent"
              style={{ minHeight: 56 }}
              onClick={() => setPickerOpen('open')}
            >
              🎲 Surprise me!
            </button>
            {pendingPiece && !pickerOpen && (
              <div
                data-testid="random-pending"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', fontWeight: 700 }}
              >
                <span>
                  🎲 Your surprise song: {pendingPiece.emoji} {pendingPiece.name.trim()}
                </span>
                <button
                  type="button"
                  data-testid="random-pending-record"
                  className="cc-btn cc-btn-primary"
                  style={{ minHeight: 56 }}
                  onClick={() => handleRandomRecord(pendingPiece.id)}
                >
                  ▶ Record it
                </button>
              </div>
            )}
          </>
        ) : (
          pianoPieces.length > 0 && (
            <span data-testid="random-empty-hint" style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
              🎲 Ask a grown-up to add songs to the surprise list in Settings.
            </span>
          )
        )}
        {firstSongToday && selectedPieceId === firstSongToday.id && (
          <p data-testid="tomorrow-banner" style={{ margin: 0, fontWeight: 700, color: 'var(--cc-primary)' }}>
            ⭐ You chose to start with {firstSongToday.name.trim()} today!
          </p>
        )}
        <div style={SONG_GRID_STYLE} data-testid="week-songs">
          {groups.week.map((piece) => (
            <SongChip
              key={piece.id}
              piece={piece}
              selected={selectedPieceId === piece.id}
              onClick={() => pickPiece(piece.id)}
              testId={`song-chip-${piece.id}`}
            />
          ))}
          <SongChip
            piece={{ id: 'free', name: 'Free play', emoji: '🎵' }}
            selected={selectedPieceId === null}
            onClick={() => pickPiece(null)}
            testId="song-chip-free"
          />
        </div>
        {groups.more.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              data-testid="more-songs"
              className="cc-btn cc-btn-surface"
              style={{ minHeight: 56, justifyContent: 'space-between', display: 'flex' }}
              onClick={() => setMoreSongsOpen((open) => !open)}
              aria-expanded={moreSongsOpen}
            >
              <span>More songs ({groups.more.length})</span>
              <span aria-hidden>{moreSongsOpen ? '▲' : '▼'}</span>
            </button>
            {moreSongsOpen && (
              <div style={SONG_GRID_STYLE}>
                {groups.more.map((piece) => (
                  <SongChip
                    key={piece.id}
                    piece={piece}
                    selected={selectedPieceId === piece.id}
                    onClick={() => pickPiece(piece.id)}
                    small
                    testId={`song-chip-${piece.id}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {selectedPiece && (pieceTakeCounts.get(selectedPiece.id) ?? 0) >= 2 && (
          <button
            type="button"
            data-testid="journey-button"
            className="cc-btn cc-btn-surface"
            style={{ minHeight: 56 }}
            onClick={() => navigate(`/piano/song/${selectedPiece.id}`)}
          >
            📈 See how {selectedPiece.name.trim()} has grown
          </button>
        )}
        {pianoPieces.length === 0 && (
          <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
            Ask a grown-up to add your pieces in Settings.
          </span>
        )}
        {selectedPiece?.goal && (
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-primary)' }}>🎯 This week: {selectedPiece.goal}</p>
        )}
        {songTargets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {songTargets.map(({ piece, done, target }) => (
              <span key={piece.id} data-testid="song-target-row" style={{ fontWeight: 700 }}>
                🎯 {piece.name} · {Math.min(done, target)} of {target} today
              </span>
            ))}
            {songTargetsAllMet && (
              <span data-testid="songs-done" style={{ fontWeight: 800, color: 'var(--cc-success)' }}>
                Songs done ✅
              </span>
            )}
          </div>
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

      <RecordsCard />

      <TeacherNotesCard />

      <button
        type="button"
        data-testid="my-journal"
        className="cc-btn cc-btn-surface"
        style={{ minHeight: 56 }}
        onClick={() => navigate('/piano/journal')}
      >
        📔 My journal
      </button>

      <button
        type="button"
        data-testid="my-days"
        className="cc-btn cc-btn-surface"
        style={{ minHeight: 56 }}
        onClick={() => navigate(`/piano/day/${today}`)}
      >
        📅 Days
      </button>

      <button
        type="button"
        data-testid="my-songs"
        className="cc-btn cc-btn-surface"
        style={{ minHeight: 56 }}
        onClick={() => navigate('/piano/songs')}
      >
        🎵 My songs
      </button>

      <button type="button" className="cc-btn cc-btn-surface" style={{ alignSelf: 'center' }} onClick={() => navigate('/piano/review')}>
        👀 Grown-up review
      </button>
    </div>
  )
}
