import { describe, expect, it } from 'vitest'
import { checkSecret, KIDS } from '../access'

describe('checkSecret', () => {
  it("matches Nora's word", async () => {
    expect(await checkSecret('climb')).toBe('nora')
  })

  it("matches Amelia's word", async () => {
    expect(await checkSecret('star')).toBe('amelia')
  })

  it('returns null for a word that matches nobody', async () => {
    expect(await checkSecret('nope')).toBeNull()
  })

  it('is case-insensitive', async () => {
    expect(await checkSecret('CLIMB')).toBe('nora')
    expect(await checkSecret('Star')).toBe('amelia')
  })

  it('trims whitespace', async () => {
    expect(await checkSecret('  climb  ')).toBe('nora')
    expect(await checkSecret('  star  ')).toBe('amelia')
  })

  it('returns null for an empty or blank word', async () => {
    expect(await checkSecret('')).toBeNull()
    expect(await checkSecret('   ')).toBeNull()
  })

  it('lists exactly one secret per known kid', () => {
    expect(KIDS.map((k) => k.id).sort()).toEqual(['amelia', 'nora'])
  })
})
