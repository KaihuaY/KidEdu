// Regression: Home blanked when the family board summarised Amelia's synced
// file, which (written by an older build) had no `teacherNotes` section.
import { describe, expect, it } from 'vitest'
import { summarize } from '../family'
import { defaultDoc, normalizeDoc, type ProgressDoc } from '../progress'

/** Amelia's real file shape from 2026-09-29: the sections an older build wrote, nothing else. */
function oldBuildDoc(): Partial<ProgressDoc> {
  const d = defaultDoc()
  const { schemaVersion, settings, profiles, rewards, solveLog, piano, notes, collection } = d
  return { schemaVersion, settings, profiles, rewards, solveLog, piano, notes, collection }
}

describe('another kid’s doc from an older build', () => {
  it('normalizeDoc fills the sections the file never had', () => {
    const doc = normalizeDoc(oldBuildDoc())
    expect(doc.teacherNotes.items).toEqual([])
    expect(doc.collection.bracelets).toEqual([])
    expect(doc.piano.journal ?? []).toEqual([])
  })

  it('summarize does not throw on a raw doc missing whole sections', () => {
    const raw = oldBuildDoc() as ProgressDoc
    expect(() => summarize(raw, '2026-09-29')).not.toThrow()
    expect(summarize(raw, '2026-09-29').teacherStars).toBe(0)
  })

  it('summarize survives a doc missing collection too (round-5 era file)', () => {
    const raw = oldBuildDoc()
    delete raw.collection
    const s = summarize(raw as ProgressDoc, '2026-09-29')
    expect(s.cardsOwned).toBe(0)
    expect(s.beads).toBe(0)
    expect(s.braceletsFinished).toBe(0)
  })
})
