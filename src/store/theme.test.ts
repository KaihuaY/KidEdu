import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getTheme, setTheme } from './theme'

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

describe('theme', () => {
  it('defaults to light on a device that never chose a theme', () => {
    expect(getTheme()).toBe('light')
  })

  it('remembers dark once set', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
  })

  it('remembers light once set back', () => {
    setTheme('dark')
    setTheme('light')
    expect(getTheme()).toBe('light')
    const stored = localStorage.getItem('cubeclimb.theme')
    expect(stored === null || stored === 'light').toBe(true)
  })

  it('ignores garbage stored values and falls back to light', () => {
    localStorage.setItem('cubeclimb.theme', 'not-a-theme')
    expect(getTheme()).toBe('light')
  })

  it('falls back to light without throwing when localStorage.getItem throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem(): never {
          throw new Error('storage disabled')
        },
        setItem(): never {
          throw new Error('storage disabled')
        },
        removeItem(): never {
          throw new Error('storage disabled')
        },
      },
      configurable: true,
      writable: true,
    })
    expect(() => getTheme()).not.toThrow()
    expect(getTheme()).toBe('light')
  })

  it('touches only the cubeclimb.theme key, never cubeclimb.progress or any other key', () => {
    setTheme('dark')
    setTheme('light')
    const storage = localStorage as unknown as MemoryStorage
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key) keys.push(key)
    }
    expect(keys.every((k) => k === 'cubeclimb.theme')).toBe(true)
    expect(localStorage.getItem('cubeclimb.progress')).toBeNull()
  })

  it('applyTheme is a no-op without document (node)', () => {
    expect(typeof document).toBe('undefined')
    expect(() => applyTheme('dark')).not.toThrow()
    expect(() => applyTheme('light')).not.toThrow()
  })
})
