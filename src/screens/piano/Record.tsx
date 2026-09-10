import { useMemo } from 'react'
import { navigate } from '../../router'
import { useProgress } from '../../store/progress'
import { setSelfRating, usePiano } from '../../store/piano'
import { goalProgress, practiceSecondsForDay, steadyBeatDots } from '../../store/pianoRewards'
import { formatClock, localDay } from '../../store/sessions'
import { dismiss, stopTake, useRecordingSession } from '../../audio/recordingSession'
import { RingTimer } from '../../components/RingTimer'
import { Aurora } from '../../components/Aurora'
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

export function Record() {
  const session = useRecordingSession()
  const progress = useProgress()
  const piano = usePiano()
  const kidName = progress.settings.kidName
  const goalMin = progress.settings.goalMinutes.piano
  const countMode = progress.settings.pianoCountMode ?? 'recording'

  // The take in progress isn't saved to the doc yet, so "today's seconds so
  // far" only ever reflects takes already saved.
  const todayBeforeThisTake = useMemo(
    () => practiceSecondsForDay(piano.takes, localDay(), countMode),
    [piano.takes, countMode],
  )

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
        <Aurora />
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

    return (
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Nice playing, {kidName}! 🎶</p>
        <p style={{ margin: 0, fontWeight: 700 }}>You practised for {formatClock(take.durationSec)}</p>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          I heard you playing for {formatClock(take.activeSec)}
        </p>
        {steadyBeatDots(take.steadiness) && (
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--cc-ink-soft)' }}>
            Steady beat: <span style={{ letterSpacing: '0.15em', color: 'var(--cc-primary)' }}>{steadyBeatDots(take.steadiness)}</span>
          </p>
        )}
        {session.goalJustReached && (
          <>
            <p style={{ margin: 0, fontWeight: 800, color: 'var(--cc-primary)' }}>You filled the ring! 🟤 +1 token</p>
            <p style={{ margin: 0, fontWeight: 700 }}>See you tomorrow! 🎹</p>
          </>
        )}
        <SelfRatingButtons value={liveSelfRating} onChange={(rating) => setSelfRating(take.id, rating)} />
        {take.hasAudio && <TakePlayer take={take} />}
        <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 56 }} onClick={backToPiano}>
          ✅ Done
        </button>
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
