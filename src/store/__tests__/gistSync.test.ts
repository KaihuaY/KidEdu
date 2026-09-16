import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToken, setToken, start, stop } from '../gistSync'
import { defaultDoc, getDoc, resetAll, update, type ProgressDoc } from '../progress'
import { clearKid, setKid } from '../kid'
import { clearRemoteKids, getRemoteKid } from '../family'

// Same in-memory localStorage mock as progress.test.ts / kid.test.ts.
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

interface FakeGist {
  id: string
  files: Record<string, { content: string }>
  updated_at: string
}

/**
 * A tiny in-memory stand-in for the bits of the GitHub Gists API gistSync.ts
 * uses: listing, creating, reading, and PATCHing one gist. `gists` is the
 * live backing array so tests can assert on it after a sync runs.
 */
function fakeGithub(initial: FakeGist[] = []) {
  const gists = initial
  let nextId = 1
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    if (url.pathname === '/gists' && method === 'GET') {
      return new Response(JSON.stringify(gists.map((g) => ({ id: g.id, files: g.files }))), { status: 200 })
    }
    if (url.pathname === '/gists' && method === 'POST') {
      const body = JSON.parse(init!.body as string) as { files: Record<string, { content: string }> }
      const created: FakeGist = { id: `gist-${nextId++}`, files: body.files, updated_at: new Date().toISOString() }
      gists.push(created)
      return new Response(JSON.stringify(created), { status: 201 })
    }
    const match = /^\/gists\/([^/]+)$/.exec(url.pathname)
    if (match && method === 'GET') {
      const gist = gists.find((g) => g.id === match[1])
      if (!gist) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(gist), { status: 200 })
    }
    if (match && method === 'PATCH') {
      const gist = gists.find((g) => g.id === match[1])
      if (!gist) return new Response('not found', { status: 404 })
      const body = JSON.parse(init!.body as string) as { files: Record<string, { content: string }> }
      gist.files = { ...gist.files, ...body.files }
      gist.updated_at = new Date().toISOString()
      return new Response(JSON.stringify(gist), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
  return { fetch: fetchFn, gists }
}

function docWithXp(xp: number): ProgressDoc {
  const doc = defaultDoc()
  doc.profiles.kid.xp = xp
  doc.profiles.updatedAt = Date.now()
  return doc
}

function gistFile(doc: ProgressDoc): { content: string } {
  return { content: JSON.stringify(doc) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  clearToken() // resets gistSync's in-memory state (timers, cached gist id, status) too
  resetAll()
  clearKid()
  clearRemoteKids()
})

describe('single-kid write', () => {
  it('creates a gist holding only this device\'s own file', async () => {
    update('profiles', (p) => ({ ...p, kid: { ...p.kid, xp: 7 } }))
    const { fetch, gists } = fakeGithub([])
    vi.stubGlobal('fetch', fetch)
    setToken('tok')
    start()

    await vi.waitFor(() => expect(gists).toHaveLength(1))
    expect(Object.keys(gists[0].files)).toEqual(['cubeclimb-progress.json'])
    const uploaded = JSON.parse(gists[0].files['cubeclimb-progress.json'].content) as ProgressDoc
    expect(uploaded.profiles.kid.xp).toBe(7)

    stop()
    vi.unstubAllGlobals()
  })
})

describe('multi-kid read', () => {
  it("routes the other kid's file to the family store, never merging it locally", async () => {
    const noraDoc = docWithXp(5)
    const ameliaDoc = docWithXp(99)
    const { fetch } = fakeGithub([
      {
        id: 'gist-1',
        files: {
          'cubeclimb-progress.json': gistFile(noraDoc),
          'cubeclimb-progress.amelia.json': gistFile(ameliaDoc),
        },
        updated_at: new Date().toISOString(),
      },
    ])
    vi.stubGlobal('fetch', fetch)
    setToken('tok')
    start() // device stays on the default kid (nora)

    await vi.waitFor(() => expect(getRemoteKid('amelia')).toBeDefined())
    expect(getRemoteKid('amelia')?.doc.profiles.kid.xp).toBe(99)
    // Nora's own doc merged in her file's xp, never Amelia's.
    expect(getDoc().profiles.kid.xp).toBe(5)

    // Amelia's file must never have been PATCHed by Nora's device.
    for (const call of fetch.mock.calls) {
      const init = call[1] as RequestInit | undefined
      if (init?.method !== 'PATCH') continue
      const body = JSON.parse(init.body as string) as { files: Record<string, unknown> }
      expect(Object.keys(body.files)).not.toContain('cubeclimb-progress.amelia.json')
    }

    stop()
    vi.unstubAllGlobals()
  })
})

describe('gist discovery', () => {
  it('finds an existing gist by Nora\'s file name', async () => {
    const { fetch, gists } = fakeGithub([
      { id: 'gist-1', files: { 'cubeclimb-progress.json': gistFile(docWithXp(1)) }, updated_at: new Date().toISOString() },
    ])
    vi.stubGlobal('fetch', fetch)
    setToken('tok')
    start()

    await vi.waitFor(() => expect(gists).toHaveLength(1)) // no second gist created
    expect(gists[0].id).toBe('gist-1')

    stop()
    vi.unstubAllGlobals()
  })

  it("finds an existing gist by Amelia's file name, even from Nora's device", async () => {
    const { fetch, gists } = fakeGithub([
      { id: 'gist-1', files: { 'cubeclimb-progress.amelia.json': gistFile(docWithXp(1)) }, updated_at: new Date().toISOString() },
    ])
    vi.stubGlobal('fetch', fetch)
    setToken('tok')
    start() // Nora's device: discovery must still see this gist via Amelia's file name

    await vi.waitFor(() => expect(gists).toHaveLength(1))
    await vi.waitFor(() => expect(gists[0].files['cubeclimb-progress.json']).toBeDefined())
    // Amelia's file is untouched.
    expect(JSON.parse(gists[0].files['cubeclimb-progress.amelia.json'].content).profiles.kid.xp).toBe(1)

    stop()
    vi.unstubAllGlobals()
  })
})

describe("Amelia's device", () => {
  it("adds her file to an existing gist without touching Nora's file", async () => {
    const noraDoc = docWithXp(11)
    const { fetch, gists } = fakeGithub([
      { id: 'gist-1', files: { 'cubeclimb-progress.json': gistFile(noraDoc) }, updated_at: new Date().toISOString() },
    ])
    vi.stubGlobal('fetch', fetch)
    setKid('amelia')
    update('profiles', (p) => ({ ...p, kid: { ...p.kid, xp: 23 } }))
    setToken('tok')
    start()

    await vi.waitFor(() => expect(gists[0].files['cubeclimb-progress.amelia.json']).toBeDefined())
    expect(gists).toHaveLength(1) // reused the existing gist, not a new one
    const ameliaUploaded = JSON.parse(gists[0].files['cubeclimb-progress.amelia.json'].content) as ProgressDoc
    expect(ameliaUploaded.profiles.kid.xp).toBe(23)
    // Nora's file is byte-for-byte untouched.
    expect(JSON.parse(gists[0].files['cubeclimb-progress.json'].content).profiles.kid.xp).toBe(11)

    stop()
    vi.unstubAllGlobals()
  })
})
