import { beforeEach, describe, expect, it } from 'vitest'
import { clearKid, getKid, isKidId, kidKey, setKid } from '../kid'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
})

describe('kid', () => {
  it('defaults to nora on a device that never chose a kid (every pre-kid install)', () => {
    expect(getKid()).toBe('nora')
    expect(localStorage.getItem('cubeclimb.kid')).toBeNull()
  })

  it('ignores garbage in the kid key', () => {
    localStorage.setItem('cubeclimb.kid', 'someone-else')
    expect(getKid()).toBe('nora')
  })

  it('remembers and clears the chosen kid', () => {
    setKid('amelia')
    expect(getKid()).toBe('amelia')
    clearKid()
    expect(getKid()).toBe('nora')
  })

  it("never changes Nora's key names and suffixes everyone else's", () => {
    expect(kidKey('cubeclimb.progress')).toBe('cubeclimb.progress')
    expect(kidKey('cubeclimb.progress', 'nora')).toBe('cubeclimb.progress')
    expect(kidKey('cubeclimb.progress', 'amelia')).toBe('cubeclimb.progress.amelia')
    setKid('amelia')
    expect(kidKey('cubeclimb.recordings')).toBe('cubeclimb.recordings.amelia')
    expect(kidKey('cubeclimb-progress') + '.json').toBe('cubeclimb-progress.amelia.json')
  })

  it('type-guards kid ids', () => {
    expect(isKidId('nora')).toBe(true)
    expect(isKidId('amelia')).toBe(true)
    expect(isKidId('Nora')).toBe(false)
    expect(isKidId(null)).toBe(false)
  })
})
