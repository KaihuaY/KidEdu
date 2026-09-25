import { describe, expect, it } from 'vitest'
import { similarity, THEMES, themeForDay, tooSimilar, VOICES, voiceForDay } from '../coachVariety'

describe('THEMES / VOICES', () => {
  it('has exactly 7 themes and 5 voices, each with a non-empty label and description', () => {
    expect(THEMES).toHaveLength(7)
    expect(VOICES).toHaveLength(5)
    for (const t of THEMES) {
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(10)
    }
    for (const v of VOICES) {
      expect(v.label.length).toBeGreaterThan(0)
      expect(v.description.length).toBeGreaterThan(10)
    }
  })

  it('theme ids and voice ids are unique', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length)
  })
})

describe('themeForDay / voiceForDay', () => {
  it('is deterministic: the same day always picks the same theme and voice', () => {
    expect(themeForDay('2026-09-24')).toEqual(themeForDay('2026-09-24'))
    expect(voiceForDay('2026-09-24')).toEqual(voiceForDay('2026-09-24'))
  })

  it('picks a value that is actually in the catalog', () => {
    for (let i = 1; i <= 28; i++) {
      const day = `2026-03-${String(i).padStart(2, '0')}`
      expect(THEMES.map((t) => t.id)).toContain(themeForDay(day).id)
      expect(VOICES.map((v) => v.id)).toContain(voiceForDay(day).id)
    }
  })

  it('spreads across at least 5 distinct theme+voice combinations over 30 days', () => {
    const combos = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const day = `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`
      combos.add(`${themeForDay(day).id}:${voiceForDay(day).id}`)
    }
    expect(combos.size).toBeGreaterThanOrEqual(5)
  })

  it('themes and voices vary independently enough that not every day sharing a theme shares a voice', () => {
    // Group 30 days by theme, and check at least one theme bucket sees more than one voice.
    const byTheme = new Map<string, Set<string>>()
    for (let i = 0; i < 30; i++) {
      const day = `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`
      const theme = themeForDay(day).id
      const voices = byTheme.get(theme) ?? new Set<string>()
      voices.add(voiceForDay(day).id)
      byTheme.set(theme, voices)
    }
    const anyThemeSawMultipleVoices = [...byTheme.values()].some((v) => v.size > 1)
    expect(anyThemeSawMultipleVoices).toBe(true)
  })
})

describe('similarity', () => {
  it('is 1 for identical text', () => {
    expect(similarity('You played so steadily today', 'You played so steadily today')).toBe(1)
  })

  it('is 0 for completely different text', () => {
    expect(similarity('the quick brown fox jumps', 'purple otter climbs mountains')).toBe(0)
  })

  it('is 0 when either text has no words of 3+ letters', () => {
    expect(similarity('', 'you played so well')).toBe(0)
    expect(similarity('a to is', 'you played so well today')).toBe(0)
  })

  it('is between 0 and 1 for partial overlap, and ignores case and punctuation', () => {
    const s = similarity('You played the whole song today!', 'you PLAYED the whole thing yesterday.')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })

  it('is symmetric', () => {
    const a = 'You kept the music going the whole way with no long pauses'
    const b = 'You kept right on going with no long pauses at all today'
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 10)
  })
})

describe('tooSimilar', () => {
  const recent = ['You played so steadily today, Nora - nice focus!', 'You made it further through the piece today than before.']

  it('is true when a text is a near-restatement of a recent one', () => {
    expect(tooSimilar('You played so steadily today, Nora - such nice focus!', recent)).toBe(true)
  })

  it('is false when a text is genuinely different from every recent one', () => {
    expect(tooSimilar('The quiet parts were so soft and the loud parts really popped today.', recent)).toBe(false)
  })

  it('is false against an empty recent list', () => {
    expect(tooSimilar('anything at all', [])).toBe(false)
  })
})
