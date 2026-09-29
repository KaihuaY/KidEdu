import { describe, expect, it } from 'vitest'
import type { TeacherNote } from '../progress'
import { driveFileIdOf, driveImageUrl, driveViewUrl } from '../teacherNotes'

function note(upload: Partial<TeacherNote['upload']> = {}): TeacherNote {
  return {
    id: 'n1',
    day: '2026-09-20',
    takenAt: Date.parse('2026-09-20T10:00:00'),
    thumbDataUrl: 'data:,',
    upload: { status: 'done', attempts: 0, updatedAt: Date.now(), ...upload },
  }
}

describe('driveFileIdOf', () => {
  it('uses upload.driveFileId directly when present', () => {
    expect(driveFileIdOf(note({ driveFileId: 'ABC123' }))).toBe('ABC123')
  })

  it('parses the id out of a `…?id=<id>` download link', () => {
    expect(driveFileIdOf(note({ driveUrl: 'https://drive.google.com/uc?export=download&id=XYZ789' }))).toBe('XYZ789')
  })

  it('parses the id out of a `…/d/<id>/view` link', () => {
    expect(driveFileIdOf(note({ driveUrl: 'https://drive.google.com/file/d/QRS456/view' }))).toBe('QRS456')
  })

  it('is undefined when neither driveFileId nor a parseable driveUrl exists', () => {
    expect(driveFileIdOf(note())).toBeUndefined()
    expect(driveFileIdOf(note({ driveUrl: 'https://example.com/nope' }))).toBeUndefined()
  })
})

describe('driveImageUrl / driveViewUrl', () => {
  it('build the thumbnail and view URLs from the file id', () => {
    const n = note({ driveFileId: 'ABC123' })
    expect(driveImageUrl(n)).toBe('https://drive.google.com/thumbnail?id=ABC123&sz=w1600')
    expect(driveImageUrl(n, 400)).toBe('https://drive.google.com/thumbnail?id=ABC123&sz=w400')
    expect(driveViewUrl(n)).toBe('https://drive.google.com/file/d/ABC123/view')
  })

  it('are undefined when there is no file id', () => {
    const n = note()
    expect(driveImageUrl(n)).toBeUndefined()
    expect(driveViewUrl(n)).toBeUndefined()
  })
})
