import { useEffect, useMemo, useRef, useState } from 'react'
import { navigate } from '../../router'
import { useProgress, type PianoPiece, type PianoTake, type Records } from '../../store/progress'
import { repetitionsForPiece, setSelfRating, setTakeGoalHit, tokenEmojis, usePiano } from '../../store/piano'
import { goalProgress, practiceSecondsForDay, steadyBeatDots } from '../../store/pianoRewards'
import { useRecords, type RecordKey } from '../../store/records'
import { dayOffset, formatClock, localDay } from '../../store/sessions'
import { bumpLiveRepetition, dismiss, stopTake, useRecordingSession } from '../../audio/recordingSession'
import { getLastTakeBpm, nudgeBpm, setRememberedBpm } from '../../audio/metronome'
import { shouldAskFeeling } from '../../store/feeling'
import { shouldRemindTeacher } from '../../store/teacherNotes'
import { nudgeFor } from '../../store/journal'
import { fireConfetti } from '../../components/Confetti'
import { RingTimer } from '../../components/RingTimer'
import { Aurora } from '../../components/Aurora'
import { CoachCard } from '../../components/CoachCard'
import { DoneRow } from '../../components/DoneRow'
import { FeelingPicker } from '../../components/FeelingPicker'
import { JournalNudge } from '../../components/JournalNudge'
import { TomorrowFirstPicker } from '../../components/TomorrowFirstPicker'
import { TeacherReminder } from '../../components/TeacherReminder'
import { countsAsRandom, randomStatus, requestFreshSpin, RANDOM_MIN_SECONDS } from '../../store/randomSong'
import { MetronomeStrip } from '../../components/Metronome'
import { SelfRatingButtons } from '../../components/SelfRatingButtons'
import { TakePlayer } from '../../components/TakePlayer'

const QUIET_HINT_SEC = 20

const ERROR_MESSAGES: Record<string, string> = {
  denied:
    "I can't hear you yet. Ask a grown-up to turn on the microphone for this app: on iPad, tap the ᴬA button in Safari's address bar → Website Settings → Microphone → Allow (or Settings → Safari → Microphone).",
  unsupported: "This browser can't record. Try Safari or Chrome.",
  busy: 'Something is using the microphone. Close other apps and try again.',
  unknown: 'Something is using the microphone. Close other apps and try again.',
}

function backToPiano(): void {
  dismiss()
  navigate('/piano')
}

/**
 * The surprise-song lines on the done screen: how many of today's 10 are done
 * (and how many are left for the gold box), the "too short to count" note, the
 * gold celebration. (The "next surprise song" button lives in the pinned bar.)
 */
function RandomSongLine({ take, justEarned }: { take: PianoTake; justEarned: boolean }) {
  const progress = useProgress()
  const status = randomStatus(progress, take.day)
  const done = Math.min(status.done, status.goal)
  const left = Math.max(0, status.goal - status.done)

  return (
    <>
      {!countsAsRandom(take) ? (
        <p data-testid="random-too-short" style={{ margin: 0, fontWeight: 700, color: 'var(--cc-ink-soft)', textAlign: 'center' }}>
          🎲 A surprise song needs at least {RANDOM_MIN_SECONDS} seconds to count.
        </p>
      ) : justEarned ? (
        <p data-testid="random-gold" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-accent)', textAlign: 'center' }}>
          🎲 {status.goal} surprise songs today! 🟡 A gold box for you!
        </p>
      ) : status.earned ? (
        <p data-testid="random-progress" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)', textAlign: 'center' }}>
          🎲 Another surprise song! Today&apos;s 🟡 gold box is already yours.
        </p>
      ) : (
        <p data-testid="random-progress" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)', textAlign: 'center' }}>
          🎲 Surprise song {done} of {status.goal}! {left} more for the 🟡 gold box
        </p>
      )}
    </>
  )
}

/** One kid-facing celebration line for a record `key` that was just beaten, reading the fresh value from `records`. */
function recordMessage(key: RecordKey, records: Records, pieces: PianoPiece[]): string | null {
  const entry = records[key]
  if (!entry) return null
  switch (key) {
    case 'longestTakeSec':
      return `🏆 New record: longest take ${formatClock(entry.value)}!`
    case 'mostSecondsInDay':
      return `🏆 New record: ${Math.round(entry.value / 60)} minutes in one day!`
    case 'mostPlaysOfSong': {
      const piece = entry.pieceId ? pieces.find((p) => p.id === entry.pieceId) : undefined
      return piece
        ? `🏆 New record: ${entry.value} plays of ${piece.name.trim()} in a day!`
        : `🏆 New record: ${entry.value} plays of one song in a day!`
    }
    case 'longestStreakDays':
      return `🏆 New record: ${entry.value}-day streak!`
  }
}

/**
 * Body of the teacher fold row. TeacherReminder renders null once the store says
 * "confirmed" or "dismissed", so on a fresh mount (the row was closed and
 * reopened) show a short note instead of an empty row.
 */
function TeacherBody({ day, ringDone, isNote }: { day: string; ringDone: boolean; isNote: boolean }) {
  const progress = useProgress()
  const [showCard] = useState(() => Boolean(shouldRemindTeacher(progress, day, ringDone, isNote)))
  if (showCard) return <TeacherReminder day={day} ringDone={ringDone} isNote={isNote} />
  const confirmed = Boolean(progress.piano.days[day]?.teacherConfirmed)
  return (
    <p
      data-testid={confirmed ? 'teacher-confirmed-today' : 'teacher-skipped-today'}
      style={{ margin: 0, fontWeight: 700, color: confirmed ? 'var(--cc-success)' : 'var(--cc-ink-soft)' }}
    >
      {confirmed ? 'Confirmed ✅ for today' : 'Okay, not today 🙂'}
    </p>
  )
}

/** Body of the journal fold row: the nudge, or a short note once it has been answered (JournalNudge renders null then). */
function JournalBody({ take, ringJustReached }: { take: PianoTake; ringJustReached: boolean }) {
  const progress = useProgress()
  const [showCard] = useState(() => nudgeFor(progress, take.day, ringJustReached, take.isNote ?? false) !== null)
  if (showCard) return <JournalNudge take={take} ringJustReached={ringJustReached} />
  const wrote = (progress.piano.journal ?? []).some((e) => e.takeIds?.includes(take.id))
  return (
    <p
      data-testid={wrote ? 'journal-saved-today' : 'journal-skipped-today'}
      style={{ margin: 0, fontWeight: 700, color: wrote ? 'var(--cc-success)' : 'var(--cc-ink-soft)' }}
    >
      {wrote ? 'Saved to your journal 📔' : 'Okay, maybe later 🙂'}
    </p>
  )
}

export function Record() {
  const session = useRecordingSession()
  const progress = useProgress()
  const piano = usePiano()
  const records = useRecords()
  const kidName = progress.settings.kidName
  const goalMin = progress.settings.goalMinutes.piano
  const countMode = progress.settings.pianoCountMode ?? 'recording'
  const [fasterTempoSaved, setFasterTempoSaved] = useState(false)
  const today = localDay()

  // The take in progress isn't saved to the doc yet, so "today's seconds so
  // far" only ever reflects takes already saved.
  const todayBeforeThisTake = useMemo(
    () => practiceSecondsForDay(piano.takes, today, countMode),
    [piano.takes, today, countMode],
  )

  // Whether to show the feeling picker on the done screen - memoised the same
  // way JournalNudge memoises nudgeFor, keyed on the finished take's id, so
  // answering (or "not now") doesn't hide it again on an unrelated re-render.
  const doneInfo =
    session.status === 'done' && !session.discarded
      ? { take: piano.takes.find((t) => t.id === session.take.id) ?? session.take, goalJustReached: session.goalJustReached }
      : null
  const askFeeling = useMemo(
    () => (doneInfo ? shouldAskFeeling(progress, doneInfo.take.day, doneInfo.goalJustReached, doneInfo.take.isNote ?? false) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doneInfo?.take.id],
  )

  // Which fold rows exist on the done screen - memoised on the take id like
  // askFeeling, so answering inside a row never makes the row vanish.
  const teacherRow = useMemo(
    () =>
      doneInfo
        ? Boolean(
            shouldRemindTeacher(
              progress,
              doneInfo.take.day,
              doneInfo.goalJustReached || Boolean(progress.piano.days[doneInfo.take.day]?.goalReachedAt),
              doneInfo.take.isNote ?? false,
            ),
          )
        : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doneInfo?.take.id],
  )
  const journalNudge = useMemo(
    () => (doneInfo ? nudgeFor(progress, doneInfo.take.day, doneInfo.goalJustReached, doneInfo.take.isNote ?? false) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doneInfo?.take.id],
  )

  // Song repeat target for the piece being recorded, if it has one - "today"
  // adds this in-progress take's own live tally (session.repetitions) to
  // whatever she already logged on other takes of the same piece today.
  const recordingPieceId = session.status === 'recording' ? session.pieceId : null
  const targetPiece = progress.settings.pianoPieces.find((p) => p.id === recordingPieceId)
  const songTarget = targetPiece?.timesPerDay ?? 0
  const hasSongTarget = songTarget >= 1
  const otherRepsToday = useMemo(
    () => (hasSongTarget && targetPiece ? repetitionsForPiece(piano.takes, targetPiece.id, today) : 0),
    [hasSongTarget, targetPiece, piano.takes, today],
  )
  const liveReps = session.status === 'recording' ? session.repetitions : 0
  const songRepsToday = otherRepsToday + liveReps
  const songTargetReached = hasSongTarget && songRepsToday >= songTarget
  const celebratedTargetRef = useRef(false)

  useEffect(() => {
    if (songTargetReached && !celebratedTargetRef.current) {
      celebratedTargetRef.current = true
      fireConfetti('small')
    }
  }, [songTargetReached])

  if (session.status === 'idle') {
    return (
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>Nothing is recording.</p>
        <button type="button" className="cc-btn cc-btn-surface" onClick={() => navigate('/piano')}>
          ⬅ Back to piano
        </button>
      </div>
    )
  }

  if (session.status === 'starting') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Getting my ears ready… 👂</p>
      </div>
    )
  }

  if (session.status === 'recording') {
    const totalCounted = todayBeforeThisTake + (countMode === 'heard' ? session.activeSec : session.wallSec)
    const progressRatio = goalProgress(totalCounted, goalMin)
    const chip = session.hearing
      ? { text: '🎵 I hear you!', color: 'var(--cc-success)' }
      : session.silentSec >= QUIET_HINT_SEC
        ? { text: "🤫 I can't hear the piano. Play something!", color: 'var(--cc-accent)' }
        : { text: '👂 Listening…', color: 'var(--cc-ink-soft)' }

    return (
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          padding: '1.5rem',
        }}
      >
        <RingTimer size={180} progress={progressRatio} label={formatClock(Math.round(totalCounted))} sublabel={`of ${goalMin} min`} />
        <Aurora height={hasSongTarget ? 90 : 170} />
        {hasSongTarget && targetPiece && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              alignItems: 'center',
              width: '100%',
              maxWidth: 320,
            }}
          >
            <span data-testid="song-target" style={{ fontWeight: 700 }}>
              {targetPiece.emoji} {targetPiece.name} · {Math.min(songRepsToday, songTarget)} of {songTarget} today
            </span>
            <button
              type="button"
              data-testid="rep-plus"
              className="cc-btn cc-btn-primary"
              style={{ minHeight: 96, width: '100%', fontSize: '1.2rem' }}
              onClick={() => bumpLiveRepetition()}
            >
              🎵 Played it! +1
            </button>
            {songTargetReached && (
              <span style={{ fontWeight: 800, color: 'var(--cc-success)' }}>Target done! ✨</span>
            )}
          </div>
        )}
        <MetronomeStrip />
        <span style={{ fontWeight: 800, color: chip.color }}>{chip.text}</span>
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
          Recording for {formatClock(Math.round(session.wallSec))}
        </span>
        {!session.wakeLock && (
          <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>Keep the screen on while you play.</span>
        )}
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          style={{ minHeight: 96, width: '100%', maxWidth: 320, fontSize: '1.4rem' }}
          onClick={() => void stopTake('user')}
        >
          ⏹ Stop
        </button>
      </div>
    )
  }

  if (session.status === 'saving') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.2rem', fontWeight: 800 }}>Saving your music… 💾</p>
      </div>
    )
  }

  if (session.status === 'done') {
    if (session.discarded) {
      return (
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700, textAlign: 'center' }}>
            That was very short. Try again when you&apos;re ready!
          </p>
          <button type="button" className="cc-btn cc-btn-surface" onClick={backToPiano}>
            ⬅ Back to piano
          </button>
        </div>
      )
    }

    // session.take is a snapshot from the moment recording stopped, before
    // the waveform (computed async) is written back onto the saved take
    // (see recordingSession.ts) - read the live copy from the store so the
    // player picks it up as soon as it's ready.
    const take = piano.takes.find((t) => t.id === session.take.id) ?? session.take
    const liveSelfRating = take.selfRating
    const piece = progress.settings.pianoPieces.find((p) => p.id === take.pieceId)
    // Captured once when this take started (see src/audio/metronome.ts) -
    // undefined if the metronome wasn't running, in which case there's no
    // tempo to suggest going faster from.
    const lastTakeBpm = getLastTakeBpm()
    const showFasterNudge = !take.isNote && (take.steadiness ?? 0) >= 0.8 && lastTakeBpm !== undefined
    const fasterBpm = lastTakeBpm !== undefined ? nudgeBpm(lastTakeBpm, 4) : undefined

    const ringDone = session.goalJustReached || Boolean(progress.piano.days[take.day]?.goalReachedAt)
    const dayState = progress.piano.days[take.day]
    const feeling = dayState?.feeling
    const showFeelingRow = askFeeling || feeling !== undefined
    const dots = steadyBeatDots(take.steadiness)
    const randomState = randomStatus(progress, take.day)
    const showNextSurprise = Boolean(take.random) && !take.isNote && randomState.poolSize > 0 && !randomState.earned
    const tomorrowDay = dayOffset(take.day, 1)
    const tomorrowChoice = progress.piano.tomorrowFirst?.forDay === tomorrowDay ? progress.piano.tomorrowFirst.pieceId : undefined
    const tomorrowName = tomorrowChoice ? progress.settings.pianoPieces.find((p) => p.id === tomorrowChoice)?.name.trim() : undefined
    const showTomorrow = !take.isNote && ringDone
    const journalAttention = journalNudge ? !(dayState?.nudges ?? []).includes(journalNudge.id) : false

    return (
      <div
        data-testid="done-screen"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 1rem 0', alignItems: 'stretch', maxWidth: 440, margin: '0 auto', width: '100%' }}
      >
        <div
          className="cc-card"
          data-testid="done-summary"
          style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center' }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Nice playing, {kidName}! 🎶</h2>
          <p data-testid="done-times" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
            {formatClock(take.durationSec)} practised · heard {formatClock(take.activeSec)}
            {dots && (
              <>
                {' · steady '}
                <span style={{ letterSpacing: '0.15em', color: 'var(--cc-primary)' }}>{dots}</span>
              </>
            )}
          </p>
          {session.goalJustReached && (
            <>
              <p data-testid="mark-reached-1" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)' }}>
                You filled the ring! {tokenEmojis(session.marksJustReached.find((m) => m.index === 0)?.tokens ?? { gold: 0, silver: 0, bronze: 0 }) || '🎉'}
              </p>
              <p style={{ margin: 0, fontWeight: 700 }}>See you tomorrow! 🎹</p>
            </>
          )}
          {(session.marksJustReached.find((m) => m.index === 0)?.sickBridged ?? 0) > 0 && (
            <p data-testid="streak-sick" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)' }}>
              🤒 Welcome back! Your {piano.streak.current}-day chain waited for you.
            </p>
          )}
          {session.marksJustReached.find((m) => m.index === 0)?.frozenDay && (
            <p data-testid="streak-frozen" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)' }}>
              ❄️ Your streak freeze kept your {piano.streak.current}-day chain going!
            </p>
          )}
          {session.marksJustReached
            .filter((m) => m.index > 0)
            .map((m) => (
              <p key={m.index} data-testid={`mark-reached-${m.index + 1}`} style={{ margin: 0, fontWeight: 800, color: 'var(--cc-accent)' }}>
                {m.minutes} minutes of piano today! {tokenEmojis(m.tokens) || '🎉'}
              </p>
            ))}
          {session.songBeadIds && session.songBeadIds.length > 0 && (
            <p data-testid="song-target-beads" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)' }}>
              Target done! ✨ +2 beads 📿
            </p>
          )}
          {take.random && !take.isNote && <RandomSongLine take={take} justEarned={session.randomGold} />}
          {records &&
            session.recordsBeaten.map((key) => {
              const msg = recordMessage(key, records, progress.settings.pianoPieces)
              if (!msg) return null
              return (
                <p key={key} data-testid="record-beaten" style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)' }}>
                  {msg}
                </p>
              )
            })}
          {showFasterNudge && fasterBpm !== undefined && (
            fasterTempoSaved ? (
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--cc-success)' }}>Saved {fasterBpm} bpm for next time 🎯</p>
            ) : (
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ minHeight: 56, width: '100%' }}
                onClick={() => {
                  setRememberedBpm(take.pieceId, fasterBpm)
                  setFasterTempoSaved(true)
                }}
              >
                Steady! Try it a little faster next time: {fasterBpm} ▶
              </button>
            )
          )}
          {piece?.goal && !take.isNote && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', width: '100%' }}>
              <strong style={{ textAlign: 'center' }}>🎯 {piece.goal} — did you do it?</strong>
              {take.goalHit === undefined ? (
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 56, flex: 1 }} onClick={() => setTakeGoalHit(take.id, true)}>
                    ✅ Yes
                  </button>
                  <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56, flex: 1 }} onClick={() => setTakeGoalHit(take.id, false)}>
                    Not yet
                  </button>
                </div>
              ) : (
                <span style={{ fontWeight: 700, color: take.goalHit ? 'var(--cc-success)' : 'var(--cc-ink-soft)' }}>
                  {take.goalHit ? 'Goal done ✅' : 'Okay - next time! 💪'}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <SelfRatingButtons value={liveSelfRating} onChange={(rating) => setSelfRating(take.id, rating)} />
          <CoachCard take={take} />
        </div>

        {showFeelingRow && (
          <DoneRow id="feeling" icon="💗" title="How do you feel today?" status={feeling !== undefined ? `${feeling}/10` : undefined} attention={feeling === undefined}>
            <FeelingPicker day={take.day} />
          </DoneRow>
        )}
        {teacherRow && (
          <DoneRow
            id="teacher"
            icon="📓"
            title="Your teacher's note"
            status={dayState?.teacherConfirmed ? '✅ confirmed' : undefined}
            attention={!dayState?.teacherConfirmed}
          >
            <TeacherBody day={take.day} ringDone={ringDone} isNote={take.isNote ?? false} />
          </DoneRow>
        )}
        {journalNudge && (
          <DoneRow id="journal" icon="✍️" title="Write in your journal" attention={journalAttention}>
            <JournalBody take={take} ringJustReached={session.goalJustReached} />
          </DoneRow>
        )}
        {showTomorrow && (
          <DoneRow id="tomorrow" icon="⭐" title="Tomorrow, start with…" status={tomorrowName} attention={!tomorrowName}>
            <TomorrowFirstPicker today={take.day} />
          </DoneRow>
        )}
        {take.hasAudio && (
          <DoneRow id="listen" icon="▶" title="Listen to this take">
            <TakePlayer take={take} />
          </DoneRow>
        )}

        <div
          data-testid="done-bar"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 5,
            display: 'flex',
            gap: '0.5rem',
            padding: '0.75rem 0 0.75rem',
            background: 'var(--cc-bg)',
            borderTop: '1px solid var(--cc-border)',
          }}
        >
          <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 56, flex: 1 }} onClick={backToPiano}>
            ✅ Done
          </button>
          {showNextSurprise && (
            <button
              type="button"
              data-testid="random-next"
              className="cc-btn cc-btn-accent"
              style={{ minHeight: 56, flex: 1 }}
              onClick={() => {
                requestFreshSpin()
                backToPiano()
              }}
            >
              🎲 Next surprise song
            </button>
          )}
        </div>
      </div>
    )
  }

  // session.status === 'error'
  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
      <p style={{ margin: 0, fontWeight: 700, textAlign: 'center' }}>{ERROR_MESSAGES[session.error]}</p>
      <button type="button" className="cc-btn cc-btn-surface" onClick={backToPiano}>
        ⬅ Back
      </button>
    </div>
  )
}
