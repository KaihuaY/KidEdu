import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProgress, type TeacherNote } from '../store/progress'
import { deleteTeacherNote, driveImageUrl, driveViewUrl, setTeacherNoteCaption } from '../store/teacherNotes'
import { getRecordingStore } from '../store/recordings'
import { PinGate } from './PinGate'

/** "Sep 20" from a local YYYY-MM-DD, parsed as a local date so it never drifts a day. */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface PhotoCandidate {
  kind: 'local' | 'drive' | 'thumb'
  src: string
}

/**
 * The photo itself: the local full-size copy if this device still has one,
 * else Drive's embeddable thumbnail endpoint, else the small stored
 * thumbnail - falling through to the next candidate if one fails to load
 * (e.g. a stale/unreachable Drive link). Mounted fresh (`key={note.id}` by
 * the parent) for every note, so this component's own state starts clean
 * without needing an effect to reset it.
 */
function NotePhoto({ note }: { note: TeacherNote }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    void getRecordingStore()
      .getPhoto(note.id)
      .then((blob) => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setPhotoUrl(objectUrl)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // `note` never changes under this component - it's remounted (fresh
    // mount, fresh effect) whenever the viewer moves to a different note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const driveUrl = driveImageUrl(note)
  const candidates: PhotoCandidate[] = [
    photoUrl ? { kind: 'local', src: photoUrl } : undefined,
    driveUrl ? { kind: 'drive', src: driveUrl } : undefined,
    { kind: 'thumb', src: note.thumbDataUrl },
  ].filter((c): c is PhotoCandidate => !!c)
  const current = candidates.find((c) => !failed.has(c.src))
  if (!current) return null

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, alignSelf: 'stretch' }}>
      <img
        data-testid="teacher-note-photo"
        data-src-kind={current.kind}
        src={current.src}
        alt="Teacher note"
        onError={() => setFailed((f) => new Set(f).add(current.src))}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', borderRadius: '0.75rem' }}
      />
    </div>
  )
}

/** The editable caption + save-state chip, same fresh-mount-per-note trick as NotePhoto above. */
function CaptionEditor({ note }: { note: TeacherNote }) {
  const [draft, setDraft] = useState(note.caption ?? '')

  function commit() {
    if (draft !== (note.caption ?? '')) setTeacherNoteCaption(note.id, draft)
  }

  return (
    <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <input
        type="text"
        data-testid="teacher-note-caption-edit"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder="Add a caption…"
        style={{ minHeight: 44 }}
      />
      <span style={{ color: '#fff', fontSize: '0.8rem' }}>
        {note.upload.status === 'done' ? '☁️ Saved to Drive' : '💾 Saved on this device · will upload'}
      </span>
    </div>
  )
}

/**
 * Full-screen photo viewer for teacher notes: ⇦/⇨ page between every note
 * passed in; deleting asks for the grown-up PIN first (PinGate) since it's
 * the only destructive action a kid could reach from Piano home.
 */
export function TeacherNoteViewer({
  notes,
  initialIndex,
  onClose,
}: {
  notes: TeacherNote[]
  initialIndex: number
  onClose: () => void
}) {
  const progress = useProgress()
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(notes.length - 1, 0)))
  const note = notes[index]
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // The list can shrink out from under us (a note gets deleted while open) -
  // close rather than render with nothing to show.
  useEffect(() => {
    if (!note) onClose()
  }, [note, onClose])

  if (!note) return null
  if (typeof document === 'undefined') return null

  function goto(delta: number) {
    setIndex((i) => Math.max(0, Math.min(notes.length - 1, i + delta)))
  }

  function handleDeleted() {
    deleteTeacherNote(note.id)
    setConfirmingDelete(false)
    if (notes.length <= 1) onClose()
    else setIndex((i) => Math.min(i, notes.length - 2))
  }

  const driveLink = driveViewUrl(note)

  return createPortal(
    <div
      data-testid="teacher-note-viewer"
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,10,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem 1rem' }}>
        <span style={{ color: '#fff', fontWeight: 700 }}>{formatDay(note.day)}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} onClick={onClose}>
            ✕ Close
          </button>
          {driveLink && (
            <a
              className="cc-btn cc-btn-surface"
              data-testid="teacher-note-open-drive"
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ minHeight: 56, textDecoration: 'none' }}
            >
              Open in Drive ↗
            </a>
          )}
          <button
            type="button"
            data-testid="teacher-note-delete"
            className="cc-btn"
            style={{ minHeight: 56, minWidth: 56, background: 'var(--cc-danger)', color: '#fff' }}
            aria-label="Delete this note"
            onClick={() => setConfirmingDelete(true)}
          >
            🗑️
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0 0.5rem' }}>
        <button
          type="button"
          data-testid="teacher-note-prev"
          aria-label="Previous note"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 56, minWidth: 56, flexShrink: 0 }}
          disabled={index === 0}
          onClick={() => goto(-1)}
        >
          ⇦
        </button>
        <NotePhoto key={note.id} note={note} />
        <button
          type="button"
          data-testid="teacher-note-next"
          aria-label="Next note"
          className="cc-btn cc-btn-surface"
          style={{ minHeight: 56, minWidth: 56, flexShrink: 0 }}
          disabled={index === notes.length - 1}
          onClick={() => goto(1)}
        >
          ⇨
        </button>
      </div>

      <CaptionEditor key={note.id} note={note} />

      {confirmingDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--cc-bg)', zIndex: 110, display: 'flex', flexDirection: 'column' }}>
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            style={{ alignSelf: 'flex-end', margin: '1rem', minHeight: 56 }}
            onClick={() => setConfirmingDelete(false)}
          >
            Cancel
          </button>
          <PinGate pin={progress.settings.pin} title="Delete this note?" onUnlock={handleDeleted} />
        </div>
      )}
    </div>,
    document.body,
  )
}
