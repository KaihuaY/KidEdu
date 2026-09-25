import { useState } from 'react'
import { addJournalEntry, appendJournalEntry, journalForDay, JOURNAL_MAX_CHARS, JOURNAL_PROMPTS, MOODS, useJournal } from '../store/journal'
import { localDay } from '../store/sessions'

/** "9:41 AM" from a timestamp. */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * "📔 My journal": pick a mood, optionally start from a prompt chip, write a
 * few words, Save - then every entry already written for `day` (default
 * today) underneath, each with a "+ add a line" to keep adding through the
 * day without starting a new entry. Mounted on the Journal screen and (via a
 * nudge, owned elsewhere) from Piano home.
 */
export function JournalCard({ day = localDay() }: { day?: string }) {
  const allEntries = useJournal()
  const entries = journalForDay(allEntries, day)

  const [mood, setMood] = useState<1 | 2 | 3 | 4 | undefined>(undefined)
  const [prompt, setPrompt] = useState<string | undefined>(undefined)
  const [text, setText] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [moreText, setMoreText] = useState('')

  function pickPrompt(i: number) {
    const p = JOURNAL_PROMPTS[i]
    setPrompt(p)
    if (!text.trim()) setText(`${p} `)
  }

  function save() {
    const id = addJournalEntry({ day, text, mood, prompt })
    if (!id) return
    setText('')
    setMood(undefined)
    setPrompt(undefined)
  }

  function submitMore(entryId: string) {
    if (!moreText.trim()) return
    appendJournalEntry(entryId, moreText)
    setMoreText('')
    setAddingTo(null)
  }

  return (
    <div data-testid="journal-card" className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <strong>📔 My journal</strong>

      <div role="group" aria-label="How did practice feel?" style={{ display: 'flex', gap: '0.5rem' }}>
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            data-testid={`journal-mood-${m.value}`}
            className="cc-btn cc-btn-surface"
            aria-pressed={mood === m.value}
            aria-label={m.label}
            style={{
              minHeight: 56,
              minWidth: 56,
              fontSize: '1.4rem',
              background: mood === m.value ? 'var(--cc-primary)' : undefined,
            }}
            onClick={() => setMood(m.value)}
          >
            {m.emoji}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {JOURNAL_PROMPTS.map((p, i) => (
          <button
            key={p}
            type="button"
            data-testid={`journal-prompt-${i}`}
            className={`cc-btn ${prompt === p ? 'cc-btn-primary' : 'cc-btn-surface'}`}
            style={{ minHeight: 44, fontSize: '0.8rem' }}
            onClick={() => pickPrompt(i)}
          >
            {p}
          </button>
        ))}
      </div>

      <textarea
        data-testid="journal-text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, JOURNAL_MAX_CHARS))}
        maxLength={JOURNAL_MAX_CHARS}
        rows={3}
        placeholder="Write about today's practice…"
        style={{ width: '100%', resize: 'vertical' }}
      />
      <span style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)', alignSelf: 'flex-end' }}>
        {text.length}/{JOURNAL_MAX_CHARS}
      </span>

      <button
        type="button"
        data-testid="journal-save"
        className="cc-btn cc-btn-primary"
        style={{ minHeight: 56 }}
        disabled={!text.trim() && !mood}
        onClick={save}
      >
        Save
      </button>

      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', borderTop: '1px solid var(--cc-border)', paddingTop: '0.6rem' }}>
          {entries.map((e) => (
            <div key={e.id} data-testid="journal-entry" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.8rem' }}>
                {e.mood ? `${MOODS.find((m) => m.value === e.mood)?.emoji} ` : ''}
                {formatTime(e.at)}
              </span>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.text}</p>
              {addingTo === e.id ? (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    value={moreText}
                    onChange={(ev) => setMoreText(ev.target.value)}
                    style={{ flex: 1, minHeight: 44 }}
                    placeholder="Add a line…"
                  />
                  <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 44 }} onClick={() => submitMore(e.id)}>
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="cc-btn cc-btn-surface"
                  style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: '0.8rem' }}
                  onClick={() => {
                    setAddingTo(e.id)
                    setMoreText('')
                  }}
                >
                  + add a line
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
