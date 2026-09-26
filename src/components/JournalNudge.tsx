// A soft, once-a-day invitation to write in her practice journal, shown on
// the Record.tsx done screen under the coach card. Computed from
// src/store/journal.ts's nudgeFor(); never shown for a grown-up's voice note.
import { useMemo, useState } from 'react'
import { addJournalEntry, JOURNAL_MAX_CHARS, JOURNAL_PROMPTS, markNudgeShown, MOODS, nudgeFor } from '../store/journal'
import { useProgress, type PianoTake } from '../store/progress'

export function JournalNudge({ take, ringJustReached }: { take: PianoTake; ringJustReached: boolean }) {
  const progress = useProgress()
  const nudge = useMemo(
    () => nudgeFor(progress, take.day, ringJustReached, take.isNote ?? false),
    // Recomputed only when the take changes (or the ring flag for that take) -
    // not on every doc change, so answering doesn't make the nudge disappear
    // mid-write for a reason unrelated to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [take.id],
  )
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | undefined>(undefined)
  const [prompt, setPrompt] = useState<string | undefined>(nudge?.prompt)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!nudge || dismissed) return null

  if (saved) {
    return (
      <div className="cc-card" data-testid="journal-nudge" style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: 'var(--cc-success)' }}>
        Saved to your journal 📔
      </div>
    )
  }

  function handleSave() {
    if (!nudge) return
    markNudgeShown(take.day, nudge.id)
    addJournalEntry({ day: take.day, text, mood, prompt, takeIds: [take.id] })
    setSaved(true)
  }

  function handleLater() {
    if (!nudge) return
    markNudgeShown(take.day, nudge.id)
    setDismissed(true)
  }

  return (
    <div
      className="cc-card"
      data-testid="journal-nudge"
      style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 320 }}
    >
      <strong style={{ textAlign: 'center' }}>{nudge.title}</strong>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            className="cc-btn cc-btn-surface"
            data-testid={`nudge-mood-${m.value}`}
            aria-label={m.label}
            aria-pressed={mood === m.value}
            style={{
              minHeight: 56,
              minWidth: 56,
              padding: 0,
              fontSize: '1.4rem',
              background: mood === m.value ? 'var(--cc-primary)' : 'var(--cc-surface)',
              border: mood === m.value ? 'none' : '2px solid var(--cc-border)',
            }}
            onClick={() => setMood(m.value)}
          >
            {m.emoji}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
        {JOURNAL_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="cc-btn cc-btn-surface"
            data-testid={`nudge-prompt-${JOURNAL_PROMPTS.indexOf(p)}`}
            style={{
              minHeight: 44,
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              background: prompt === p ? 'var(--cc-primary)' : 'var(--cc-surface)',
              color: prompt === p ? 'var(--cc-primary-ink)' : 'var(--cc-ink)',
              border: prompt === p ? 'none' : '2px solid var(--cc-border)',
            }}
            onClick={() => setPrompt(prompt === p ? undefined : p)}
          >
            {p}
          </button>
        ))}
      </div>
      <textarea
        data-testid="nudge-text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, JOURNAL_MAX_CHARS))}
        maxLength={JOURNAL_MAX_CHARS}
        rows={3}
        placeholder={prompt ?? 'Write a line about today…'}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          data-testid="nudge-save"
          style={{ minHeight: 56, flex: 1 }}
          disabled={!text.trim() && !mood}
          onClick={handleSave}
        >
          Save ✍️
        </button>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          data-testid="nudge-later"
          style={{ minHeight: 56, flex: 1 }}
          onClick={handleLater}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
