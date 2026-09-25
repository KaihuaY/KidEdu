import { useRef, useState, type ChangeEvent } from 'react'
import { blobToDataUrl, downscaleToJpeg } from '../utils/image'
import { addTeacherNote, useTeacherNotes } from '../store/teacherNotes'
import { enqueuePhotoUpload, processPhotoQueue } from '../store/photoUpload'
import { getRecordingStore } from '../store/recordings'
import { localDay } from '../store/sessions'
import { TeacherNoteViewer } from './TeacherNoteViewer'

const THUMB_PX = 240
const THUMB_QUALITY = 0.7
const FULL_PX = 1600
const FULL_QUALITY = 0.8

/** "Sep 20" from a local YYYY-MM-DD, parsed as a local date so it never drifts a day. */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * "📓 Teacher notes": a photo of the teacher's weekly note in Nora's
 * notebook. Shows the newest one (tap to open the full viewer, which can
 * page through every note); "📷 Add note" opens the camera/photo picker,
 * then a tiny composer for which lesson day it's about and an optional
 * caption before it's saved locally and queued for Drive.
 */
export function TeacherNotesCard() {
  const notes = useTeacherNotes()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingDay, setPendingDay] = useState(() => localDay())
  const [pendingCaption, setPendingCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const newest = notes[0]

  function openPicker() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    setError(null)
    setPendingFile(file)
    setPendingDay(localDay())
    setPendingCaption('')
  }

  function cancelPending() {
    setPendingFile(null)
    setError(null)
  }

  async function savePending() {
    if (!pendingFile) return
    setSaving(true)
    setError(null)
    try {
      const [thumbBlob, fullBlob] = await Promise.all([
        downscaleToJpeg(pendingFile, THUMB_PX, THUMB_QUALITY),
        downscaleToJpeg(pendingFile, FULL_PX, FULL_QUALITY),
      ])
      const thumbDataUrl = await blobToDataUrl(thumbBlob)
      const id = addTeacherNote({ day: pendingDay, thumbDataUrl, caption: pendingCaption })
      await getRecordingStore().putPhoto(id, fullBlob)
      enqueuePhotoUpload(id)
      void processPhotoQueue()
      setPendingFile(null)
    } catch {
      setError("Couldn't save that photo - try again?")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="teacher-notes-card" className="cc-card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <strong>📓 Teacher notes</strong>

      {newest ? (
        <button
          type="button"
          data-testid="teacher-note-open-newest"
          onClick={() => setViewerIndex(0)}
          style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            minHeight: 56,
          }}
        >
          <img
            src={newest.thumbDataUrl}
            alt="Latest teacher note"
            style={{ width: 64, height: 64, borderRadius: '0.75rem', objectFit: 'cover', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontWeight: 700 }}>{formatDay(newest.day)}</span>
            {newest.caption && <span style={{ color: 'var(--cc-ink-soft)' }}>{newest.caption}</span>}
            <span style={{ fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>
              {newest.upload.status === 'done' ? '☁️ Saved to Drive' : '💾 Saved on this device · will upload'}
            </span>
          </div>
        </button>
      ) : (
        <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>No notes yet - take a photo of your lesson notebook!</span>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid="teacher-note-file-input"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {!pendingFile && (
        <button type="button" data-testid="teacher-note-add" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} onClick={openPicker}>
          📷 Add note
        </button>
      )}

      {pendingFile && (
        <div data-testid="teacher-note-composer" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--cc-border)', paddingTop: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Which day is this about?
            <input
              type="date"
              data-testid="teacher-note-day"
              value={pendingDay}
              onChange={(e) => setPendingDay(e.target.value)}
              style={{ minHeight: 44 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Caption (optional)
            <input
              type="text"
              data-testid="teacher-note-caption"
              value={pendingCaption}
              onChange={(e) => setPendingCaption(e.target.value)}
              placeholder="Bars 1-8, slow and steady"
              style={{ minHeight: 44 }}
            />
          </label>
          {error && <span style={{ color: 'var(--cc-danger)', fontWeight: 700 }}>{error}</span>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              data-testid="teacher-note-save"
              className="cc-btn cc-btn-primary"
              style={{ minHeight: 56, flex: 1 }}
              disabled={saving}
              onClick={() => void savePending()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} disabled={saving} onClick={cancelPending}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewerIndex !== null && <TeacherNoteViewer notes={notes} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
    </div>
  )
}
