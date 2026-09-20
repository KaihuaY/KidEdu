import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeAndCoach,
  coachStatus,
  getCoachStage,
  requestFeedback,
  requestJourney,
} from '../coach'
import { decodeToMono, analyzeTake, compareToReference, type Fingerprint, type ReferenceComparison } from '../../audio/takeAnalysis'
import { getDoc, resetAll, update, type PianoTake, type TakeMetrics } from '../progress'
import { saveTake, setTakeAi } from '../piano'
import { clearKid } from '../kid'
import { getAnalysisStore } from '../analysisStore'

vi.mock('../../audio/takeAnalysis', () => ({
  decodeToMono: vi.fn(),
  analyzeTake: vi.fn(),
  compareToReference: vi.fn(),
}))

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

const BLOB = new Blob([new Uint8Array(10)])
const SCRIPT_CFG = { scriptUrl: 'https://script.google.com/exec', secret: 'shh', folderName: 'Nora Piano' }

function makeTake(overrides: Partial<PianoTake> = {}): PianoTake {
  return {
    id: 'take-1',
    day: '2026-09-20',
    pieceId: null,
    startedAt: Date.now(),
    durationSec: 60,
    activeSec: 40,
    mimeType: 'audio/webm',
    sizeBytes: 1000,
    hasAudio: true,
    deviceId: 'device-1',
    ...overrides,
  }
}

function makeMetrics(overrides: Partial<TakeMetrics> = {}): TakeMetrics {
  return { v: 1, playedSec: 42, hesitations: 1, longestPauseSec: 2.3, dynamicRangeDb: 12, ...overrides }
}

function makeFingerprint(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return { blockSec: 0.5, blocks: 10, data: new Float32Array(120), ...overrides }
}

function mockDecode(): void {
  vi.mocked(decodeToMono).mockResolvedValue({ pcm: new Float32Array(1000), sampleRate: 11025 })
}

function okFetch(body: Record<string, unknown>): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch
}

function claudeFeedbackBody(overrides: Partial<{ praise: string; tryNext: string; note: string }> = {}) {
  return {
    ok: true,
    model: 'claude-opus-5',
    usage: { input_tokens: 10, output_tokens: 10 },
    usedToday: 3,
    result: {
      kid: { praise: overrides.praise ?? 'You played so steadily today!', tryNext: overrides.tryNext ?? 'Want to try it once more slowly?' },
      parent: { note: overrides.note ?? 'She played well today with good focus throughout the whole take, showing real progress.' },
    },
  }
}

function enableDrive(): void {
  update('settings', (s) => ({ ...s, driveUpload: SCRIPT_CFG }))
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
  clearKid()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('analyzeAndCoach', () => {
  it('skips a grown-up voice note entirely', async () => {
    saveTake(makeTake({ id: 'note-1', isNote: true }))
    await analyzeAndCoach('note-1', BLOB)
    expect(decodeToMono).not.toHaveBeenCalled()
    expect(getDoc().piano.takes.find((t) => t.id === 'note-1')?.ai).toBeUndefined()
  })

  it('marks the stage failed when decoding fails, without writing metrics', async () => {
    saveTake(makeTake({ id: 'a' }))
    vi.mocked(decodeToMono).mockResolvedValue(null)

    await analyzeAndCoach('a', BLOB)

    expect(getCoachStage('a')).toBe('failed')
    expect(getDoc().piano.takes.find((t) => t.id === 'a')?.ai).toBeUndefined()
  })

  it('measures a free-play take (no pieceId), stores the fingerprint, and never sets reference fields', async () => {
    saveTake(makeTake({ id: 'free-1', pieceId: null }))
    mockDecode()
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics(), fingerprint: makeFingerprint(), onsetsMs: [] })

    await analyzeAndCoach('free-1', BLOB)

    const take = getDoc().piano.takes.find((t) => t.id === 'free-1')!
    expect(take.ai?.metrics.playedSec).toBe(42)
    expect(take.ai?.metrics.coverage).toBeUndefined()
    expect(compareToReference).not.toHaveBeenCalled()
    expect(await getAnalysisStore().getFingerprint('free-1')).not.toBeNull()
    expect(getCoachStage('free-1')).toBe('done')
  })

  it("the first analysed take of a piece becomes its own reference (identity 1/1/1)", async () => {
    saveTake(makeTake({ id: 'p1-a', pieceId: 'piece-1' }))
    mockDecode()
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics({ hesitations: 2 }), fingerprint: makeFingerprint(), onsetsMs: [] })

    await analyzeAndCoach('p1-a', BLOB)

    const take = getDoc().piano.takes.find((t) => t.id === 'p1-a')!
    expect(take.ai?.metrics.coverage).toBe(1)
    expect(take.ai?.metrics.matchToBest).toBe(1)
    expect(take.ai?.metrics.paceVsBest).toBe(1)
    expect(compareToReference).not.toHaveBeenCalled()
  })

  it('a second, worse take of the same piece is compared against the first (which stays the reference)', async () => {
    saveTake(makeTake({ id: 'p2-a', pieceId: 'piece-2', startedAt: 1000 }))
    mockDecode()
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics({ hesitations: 0, playedSec: 60 }), fingerprint: makeFingerprint(), onsetsMs: [] })
    await analyzeAndCoach('p2-a', BLOB)
    expect(getDoc().piano.takes.find((t) => t.id === 'p2-a')?.ai?.metrics.coverage).toBe(1)

    saveTake(makeTake({ id: 'p2-b', pieceId: 'piece-2', startedAt: 2000 }))
    const cmp: ReferenceComparison = { coverage: 0.6, matchToBest: 0.75, stumbles: [0.5], pace: 0.85 }
    vi.mocked(compareToReference).mockReturnValue(cmp)
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics({ hesitations: 3, playedSec: 55 }), fingerprint: makeFingerprint(), onsetsMs: [] })

    await analyzeAndCoach('p2-b', BLOB)

    expect(compareToReference).toHaveBeenCalledTimes(1)
    const bTake = getDoc().piano.takes.find((t) => t.id === 'p2-b')!
    expect(bTake.ai?.metrics.coverage).toBe(0.6)
    expect(bTake.ai?.metrics.matchToBest).toBe(0.75)
    expect(bTake.ai?.metrics.paceVsBest).toBe(0.85)
    expect(bTake.ai?.metrics.stumbles).toEqual([0.5])
    // The first take (fewer hesitations) remains the reference, unaffected.
    expect(getDoc().piano.takes.find((t) => t.id === 'p2-a')?.ai?.metrics.coverage).toBe(1)
  })

  it('a much better, more complete new take becomes the new reference instead of the old one', async () => {
    saveTake(makeTake({ id: 'p3-a', pieceId: 'piece-3', startedAt: 1000 }))
    mockDecode()
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics({ hesitations: 4, playedSec: 40 }), fingerprint: makeFingerprint(), onsetsMs: [] })
    await analyzeAndCoach('p3-a', BLOB)

    saveTake(makeTake({ id: 'p3-b', pieceId: 'piece-3', startedAt: 2000 }))
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics({ hesitations: 0, playedSec: 40 }), fingerprint: makeFingerprint(), onsetsMs: [] })

    await analyzeAndCoach('p3-b', BLOB)

    // p3-b has fewer hesitations and a comparable playedSec, so it wins the reference slot outright.
    expect(getDoc().piano.takes.find((t) => t.id === 'p3-b')?.ai?.metrics.coverage).toBe(1)
    expect(compareToReference).not.toHaveBeenCalled()
  })

  it('drops onsets from the take once metrics are written (setTakeAi contract)', async () => {
    saveTake(makeTake({ id: 'onsets-1', onsets: [1, 2, 3] }))
    mockDecode()
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics(), fingerprint: makeFingerprint(), onsetsMs: [] })

    await analyzeAndCoach('onsets-1', BLOB)

    expect(getDoc().piano.takes.find((t) => t.id === 'onsets-1')?.onsets).toBeUndefined()
  })

  it('chains into requestFeedback and ends in the "done" stage using rules (no Drive configured)', async () => {
    saveTake(makeTake({ id: 'chain-1' }))
    mockDecode()
    vi.mocked(analyzeTake).mockReturnValue({ metrics: makeMetrics(), fingerprint: makeFingerprint(), onsetsMs: [] })

    await analyzeAndCoach('chain-1', BLOB)

    const take = getDoc().piano.takes.find((t) => t.id === 'chain-1')!
    expect(take.ai?.kid?.praise).toBeTruthy()
    expect(take.ai?.parent?.note).toBeTruthy()
    expect(take.ai?.source).toBe('rules')
    expect(getCoachStage('chain-1')).toBe('done')
  })
})

describe('requestFeedback', () => {
  it('is a no-op when the take has no ai.metrics yet', async () => {
    saveTake(makeTake({ id: 'nf-1' }))
    await requestFeedback('nf-1')
    expect(getDoc().piano.takes.find((t) => t.id === 'nf-1')?.ai).toBeUndefined()
  })

  it('is a no-op when kid feedback already exists and force is not set', async () => {
    saveTake(makeTake({ id: 'nf-2' }))
    setTakeAi('nf-2', { metrics: makeMetrics(), kid: { praise: 'p', tryNext: 't' }, parent: { note: 'n' }, source: 'rules', at: 1 })
    const before = getDoc()

    await requestFeedback('nf-2')

    expect(getDoc()).toEqual(before)
  })

  it('falls back to rules when settings.aiCoach.enabled is false, even with Drive configured', async () => {
    enableDrive()
    update('settings', (s) => ({ ...s, aiCoach: { enabled: false } }))
    saveTake(makeTake({ id: 'rf-1' }))
    setTakeAi('rf-1', { metrics: makeMetrics(), at: 1 })

    await requestFeedback('rf-1')

    const take = getDoc().piano.takes.find((t) => t.id === 'rf-1')!
    expect(take.ai?.source).toBe('rules')
  })

  it('falls back to rules with no driveUpload configured', async () => {
    saveTake(makeTake({ id: 'rf-2' }))
    setTakeAi('rf-2', { metrics: makeMetrics(), at: 1 })

    await requestFeedback('rf-2')

    expect(getDoc().piano.takes.find((t) => t.id === 'rf-2')?.ai?.source).toBe('rules')
  })

  it('uses Claude when Drive is configured and the script returns a valid result', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-3' }))
    setTakeAi('rf-3', { metrics: makeMetrics(), at: 1 })
    vi.stubGlobal('fetch', okFetch(claudeFeedbackBody({ praise: 'Great steady playing!' })))

    await requestFeedback('rf-3')

    const take = getDoc().piano.takes.find((t) => t.id === 'rf-3')!
    expect(take.ai?.source).toBe('claude')
    expect(take.ai?.model).toBe('claude-opus-5')
    expect(take.ai?.kid?.praise).toBe('Great steady playing!')
    vi.unstubAllGlobals()
  })

  it('sends the secret/action/system/user/schema shape the Apps Script expects', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-4' }))
    setTakeAi('rf-4', { metrics: makeMetrics(), at: 1 })
    const fetchFn = okFetch(claudeFeedbackBody())
    vi.stubGlobal('fetch', fetchFn)

    await requestFeedback('rf-4')

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(SCRIPT_CFG.scriptUrl)
    const payload = JSON.parse(init.body as string)
    expect(payload.secret).toBe(SCRIPT_CFG.secret)
    expect(payload.action).toBe('coach')
    expect(typeof payload.system).toBe('string')
    expect(typeof payload.user).toBe('string')
    expect(payload.schema).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('falls back to rules when Claude returns a banned word', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-5' }))
    setTakeAi('rf-5', { metrics: makeMetrics(), at: 1 })
    vi.stubGlobal('fetch', okFetch(claudeFeedbackBody({ praise: 'That was a bad try but okay.' })))

    await requestFeedback('rf-5')

    expect(getDoc().piano.takes.find((t) => t.id === 'rf-5')?.ai?.source).toBe('rules')
    vi.unstubAllGlobals()
  })

  it('falls back to rules when Claude returns text over the length caps', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-6' }))
    setTakeAi('rf-6', { metrics: makeMetrics(), at: 1 })
    vi.stubGlobal('fetch', okFetch(claudeFeedbackBody({ praise: 'x'.repeat(250) })))

    await requestFeedback('rf-6')

    expect(getDoc().piano.takes.find((t) => t.id === 'rf-6')?.ai?.source).toBe('rules')
    vi.unstubAllGlobals()
  })

  it('falls back to rules when Claude claims to have heard the take', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-7' }))
    setTakeAi('rf-7', { metrics: makeMetrics(), at: 1 })
    vi.stubGlobal('fetch', okFetch(claudeFeedbackBody({ praise: 'I heard you play so well today!' })))

    await requestFeedback('rf-7')

    expect(getDoc().piano.takes.find((t) => t.id === 'rf-7')?.ai?.source).toBe('rules')
    vi.unstubAllGlobals()
  })

  it('falls back to rules on a script/HTTP error reason like "refusal" (non-transient, no retry)', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-8' }))
    setTakeAi('rf-8', { metrics: makeMetrics(), at: 1 })
    const fetchFn = okFetch({ ok: false, reason: 'refusal' })
    vi.stubGlobal('fetch', fetchFn)
    vi.useFakeTimers()

    await requestFeedback('rf-8')
    expect(getDoc().piano.takes.find((t) => t.id === 'rf-8')?.ai?.source).toBe('rules')

    // No retry should have been scheduled for a non-transient reason.
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('schedules one background retry after a transient failure (http-500), overwriting rules text if Claude then succeeds', async () => {
    enableDrive()
    saveTake(makeTake({ id: 'rf-9' }))
    setTakeAi('rf-9', { metrics: makeMetrics(), at: 1 })

    let call = 0
    const fetchFn = vi.fn(async () => {
      call += 1
      if (call === 1) return new Response(JSON.stringify({ ok: false, reason: 'http-500' }), { status: 200 })
      return new Response(JSON.stringify(claudeFeedbackBody({ praise: 'Retried and it worked!' })), { status: 200 })
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchFn)
    vi.useFakeTimers()

    await requestFeedback('rf-9')
    expect(getDoc().piano.takes.find((t) => t.id === 'rf-9')?.ai?.source).toBe('rules')

    await vi.advanceTimersByTimeAsync(5 * 60_000 + 5_000)

    expect(fetchFn).toHaveBeenCalledTimes(2)
    const take = getDoc().piano.takes.find((t) => t.id === 'rf-9')!
    expect(take.ai?.source).toBe('claude')
    expect(take.ai?.kid?.praise).toBe('Retried and it worked!')

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('force rewrites feedback that already exists', async () => {
    saveTake(makeTake({ id: 'rf-10' }))
    setTakeAi('rf-10', { metrics: makeMetrics(), kid: { praise: 'old', tryNext: 'old' }, parent: { note: 'old' }, source: 'rules', at: 1 })

    await requestFeedback('rf-10', { force: true })

    const take = getDoc().piano.takes.find((t) => t.id === 'rf-10')!
    expect(take.ai?.kid?.praise).not.toBe('old')
  })

  it('triggers requestJourney for the take\'s piece once there are enough analysed takes', async () => {
    const pieceId = 'journey-piece'
    for (let i = 0; i < 3; i++) {
      saveTake(makeTake({ id: `jp-${i}`, pieceId, day: `2026-09-1${i}`, startedAt: 1000 * i }))
      setTakeAi(`jp-${i}`, { metrics: makeMetrics({ hesitations: 3 - i }), at: 1000 * i })
    }

    await requestFeedback('jp-2')

    expect(getDoc().piano.journeys?.[pieceId]).toBeDefined()
    expect(getDoc().piano.journeys?.[pieceId]?.takeCount).toBe(3)
  })
})

describe('requestJourney', () => {
  const pieceId = 'piece-journey'

  function seedTakes(count: number, hesitationsStart: number): void {
    for (let i = 0; i < count; i++) {
      saveTake(makeTake({ id: `t${i}`, pieceId, day: `2026-09-${String(i + 1).padStart(2, '0')}`, startedAt: 1000 * i }))
      setTakeAi(`t${i}`, { metrics: makeMetrics({ hesitations: Math.max(0, hesitationsStart - i), playedSec: 30 + i }), at: 1000 * i })
    }
  }

  it('does nothing with fewer than 3 analysed takes', async () => {
    seedTakes(2, 3)
    await requestJourney(pieceId)
    expect(getDoc().piano.journeys?.[pieceId]).toBeUndefined()
  })

  it('writes a rules-based journey once there are 3+ analysed takes (no Drive configured)', async () => {
    seedTakes(3, 3)
    await requestJourney(pieceId)
    const journey = getDoc().piano.journeys?.[pieceId]
    expect(journey).toBeDefined()
    expect(journey?.source).toBe('rules')
    expect(journey?.takeCount).toBe(3)
    expect(journey?.kid).toBeTruthy()
    expect(journey?.parent).toBeTruthy()
  })

  it('skips re-writing unless force or 3+ new takes have accumulated since the last journey', async () => {
    seedTakes(3, 3)
    await requestJourney(pieceId)
    const first = getDoc().piano.journeys?.[pieceId]

    saveTake(makeTake({ id: 'extra-1', pieceId, day: '2026-09-10', startedAt: 5000 }))
    setTakeAi('extra-1', { metrics: makeMetrics({ hesitations: 0 }), at: 5000 })

    await requestJourney(pieceId)
    expect(getDoc().piano.journeys?.[pieceId]).toEqual(first) // only 1 new take - not enough

    await requestJourney(pieceId, { force: true })
    expect(getDoc().piano.journeys?.[pieceId]?.takeCount).toBe(4) // force rewrites regardless
  })

  it('uses Claude when configured and valid, falls back to rules when invalid', async () => {
    enableDrive()
    seedTakes(3, 3)
    vi.stubGlobal(
      'fetch',
      okFetch({ ok: true, model: 'claude-opus-5', result: { kid: 'Great growth on this song!', parent: 'The trend across days looks steady and encouraging.' } }),
    )

    await requestJourney(pieceId)
    expect(getDoc().piano.journeys?.[pieceId]?.source).toBe('claude')
    expect(getDoc().piano.journeys?.[pieceId]?.kid).toBe('Great growth on this song!')
    vi.unstubAllGlobals()

    // A second piece, invalid Claude result (missing parent) -> rules.
    const pieceId2 = 'piece-journey-2'
    for (let i = 0; i < 3; i++) {
      saveTake(makeTake({ id: `u${i}`, pieceId: pieceId2, day: `2026-09-1${i}`, startedAt: 1000 * i }))
      setTakeAi(`u${i}`, { metrics: makeMetrics({ hesitations: 1 }), at: 1000 * i })
    }
    vi.stubGlobal('fetch', okFetch({ ok: true, result: { kid: 'only kid, no parent' } }))
    await requestJourney(pieceId2)
    expect(getDoc().piano.journeys?.[pieceId2]?.source).toBe('rules')
    vi.unstubAllGlobals()
  })
})

describe('coachStatus', () => {
  it('reports not configured when Drive is not set up', async () => {
    const result = await coachStatus()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Drive/)
  })

  it('reports ready with usage counts when the script has a key', async () => {
    enableDrive()
    const fetchFn = okFetch({ ok: true, hasKey: true, usedToday: 3, cap: 80 })

    const result = await coachStatus({ fetch: fetchFn })

    expect(result.ok).toBe(true)
    expect(result.hasKey).toBe(true)
    expect(result.usedToday).toBe(3)
    expect(result.cap).toBe(80)
    const [, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string)
    expect(payload.action).toBe('coach-status')
  })

  it('reports hasKey:false when the script has no API key yet', async () => {
    enableDrive()
    const result = await coachStatus({ fetch: okFetch({ ok: true, hasKey: false, usedToday: 0, cap: 80 }) })
    expect(result.ok).toBe(true)
    expect(result.hasKey).toBe(false)
  })

  it('flags an outdated (pre-coach) script deployment', async () => {
    enableDrive()
    const result = await coachStatus({ fetch: okFetch({ ok: false, error: 'no audio data' }) })
    expect(result.ok).toBe(false)
    expect(result.outdated).toBe(true)
  })

  it('reports a plain error for anything else (e.g. bad secret)', async () => {
    enableDrive()
    const result = await coachStatus({ fetch: okFetch({ ok: false, error: 'bad secret' }) })
    expect(result.ok).toBe(false)
    expect(result.outdated).toBeFalsy()
    expect(result.error).toBe('bad secret')
  })

  it('reports a network failure', async () => {
    enableDrive()
    const fetchFn = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const result = await coachStatus({ fetch: fetchFn })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('offline')
  })
})
