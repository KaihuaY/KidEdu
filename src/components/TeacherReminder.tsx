// A reminder shown at the end of the daily ring: what the teacher asked this
// week, with a grown-up PIN to confirm Nora worked on it. Confirmed days per
// week reaching the target (Settings) earns the Teacher's star - one gold
// token plus badges. Computed from src/store/teacherNotes.ts's
// shouldRemindTeacher(); never shown for a grown-up's voice note.
import { useMemo, useState } from 'react'
import { useProgress } from '../store/progress'
import { confirmTeacherDay, shouldRemindTeacher } from '../store/teacherNotes'
import { markNudgeShown } from '../store/journal'
import { PinGate } from './PinGate'
import { fireConfetti } from './Confetti'

interface ConfirmResult {
  confirmedDays: number
  target: number
  starJustAwarded: boolean
}

export function TeacherReminder({ day, ringDone, isNote }: { day: string; ringDone: boolean; isNote?: boolean }) {
  const progress = useProgress()
  const note = useMemo(
    () => shouldRemindTeacher(progress, day, ringDone, isNote ?? false),
    // Recomputed only when the day/ring/note-flag change - not on every doc
    // change, so confirming doesn't make the card disappear mid-answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, ringDone, isNote],
  )
  const [dismissed, setDismissed] = useState(false)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [pinOpen, setPinOpen] = useState(false)

  if (!note || dismissed) return null

  const items = note.items ?? []

  function handleLater() {
    if (!note) return
    markNudgeShown(day, 'teacher')
    setDismissed(true)
  }

  function handleUnlock() {
    if (!note) return
    setPinOpen(false)
    const outcome = confirmTeacherDay(day, note.id)
    setResult(outcome)
    if (outcome.starJustAwarded) fireConfetti('big')
  }

  return (
    <div
      className="cc-card"
      data-testid="teacher-reminder"
      style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 360 }}
    >
      <strong>📓 Your teacher asked this week:</strong>

      {items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontWeight: 700, fontSize: '1.05rem' }}>
          {items.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : note.caption ? (
        <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>{note.caption}</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img
            src={note.thumbDataUrl}
            alt="Teacher note"
            style={{ width: 64, height: 64, borderRadius: '0.6rem', objectFit: 'cover', flexShrink: 0 }}
          />
          <span>See the note</span>
        </div>
      )}

      {!result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            type="button"
            data-testid="teacher-confirm"
            className="cc-btn cc-btn-primary"
            style={{ minHeight: 56 }}
            onClick={() => setPinOpen(true)}
          >
            Grown-up: she worked on this ✅
          </button>
          <button
            type="button"
            data-testid="teacher-later"
            className="cc-btn cc-btn-surface"
            style={{ minHeight: 56 }}
            onClick={handleLater}
          >
            Not today
          </button>
        </div>
      ) : (
        <>
          <p data-testid="teacher-confirmed" style={{ margin: 0, fontWeight: 700 }}>
            Confirmed ✅ · {result.confirmedDays} of {result.target} days this week
          </p>
          {result.starJustAwarded && (
            <p data-testid="teacher-star" style={{ margin: 0, color: 'var(--cc-accent)', fontWeight: 800 }}>
              ⭐ Teacher's star! +🟡
            </p>
          )}
        </>
      )}

      {pinOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--cc-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 50,
          }}
        >
          <div
            data-testid="teacher-pin"
            className="cc-card"
            style={{ padding: '1.25rem', maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Confirm today's teacher work</h2>
            <PinGate pin={progress.settings.pin} title="Grown-up PIN" onUnlock={handleUnlock} />
            <button
              type="button"
              data-testid="teacher-pin-cancel"
              className="cc-btn cc-btn-surface"
              style={{ minHeight: 56 }}
              onClick={() => setPinOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
