// The AI coach: measures a finished take (src/audio/takeAnalysis.ts), asks
// Claude - through the parent's Apps Script, which holds the API key - to turn
// the measurements into two written notes (a short one for the kid, a fuller
// one for the grown-up), and falls back to built-in phrases whenever that is
// not possible. Text only: nothing here is ever read aloud.
//
// Only metrics validated as trustworthy on real recordings ever reach Claude
// or the rules fallback: playedSec, hesitations, longestPauseSec,
// dynamicRangeDb, and (when a piece reference comparison ran and wasn't
// flagged `differentMusic`) coverage, matchToBest, stumbles, paceVsBest. See
// src/content/coachPrompt.ts's header comment for why tempoBpm/tempoDrift/
// steadiness/noteRate are excluded.
//
// PUBLIC CONTRACT (screens import exactly these; keep the signatures):
//   useCoachStage(takeId)      -> where a take's feedback is in the pipeline
//   analyzeAndCoach(takeId, blob)  -> called once by recordingSession after a take is saved
//   requestFeedback(takeId, { force })  -> (re)write feedback for an already-measured take
//   requestJourney(pieceId, { force })  -> (re)write a piece's "how this song has grown" summary

import { useSyncExternalStore } from 'react'
import { compareToReference, decodeToMono, analyzeTake, type Fingerprint } from '../audio/takeAnalysis'
import {
  buildFeedbackUser,
  buildJourneyUser,
  COACH_SYSTEM,
  FEEDBACK_SCHEMA,
  JOURNEY_SCHEMA,
  type FeedbackInput,
  type HistoryTake,
  type JourneyDayStat,
  type JourneyInput,
  type PersonalBests,
  type SelfRatingLabel,
} from '../content/coachPrompt'
import { ruleFeedback, ruleJourney, type RuleFeedbackContext, type RuleFeedbackResult, type RuleJourneyContext, type RuleJourneyResult } from '../content/coachPhrases'
import { themeForDay, tooSimilar, voiceForDay } from '../content/coachVariety'
import { getAnalysisStore } from './analysisStore'
import { isDriveConfigured, type DriveConfig } from './driveUpload'
import { getKid, KID_NAMES } from './kid'
import { setJourney, setTakeAi } from './piano'
import { getDoc, type PianoTake, type SelfRating, type TakeMetrics } from './progress'
import { localDay } from './sessions'
import { songStats } from './songStats'

export type CoachStage = 'idle' | 'analyzing' | 'writing' | 'done' | 'failed'

const stages = new Map<string, CoachStage>()
const listeners = new Set<() => void>()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** For the implementation: publish a take's pipeline stage to any mounted CoachCard. */
export function setCoachStage(takeId: string, stage: CoachStage): void {
  stages.set(takeId, stage)
  for (const l of listeners) l()
}

export function getCoachStage(takeId: string): CoachStage {
  return stages.get(takeId) ?? 'idle'
}

/** React hook: 'analyzing' while measuring, 'writing' while waiting for the coach text, then 'done' / 'failed'. */
export function useCoachStage(takeId: string): CoachStage {
  return useSyncExternalStore(
    subscribe,
    () => getCoachStage(takeId),
    () => getCoachStage(takeId),
  )
}

// ---------------------------------------------------------------------------
// Feature flag - the reviewer may flip this off after validating on real
// recordings if the chroma reference comparison ever needs to be pulled.
// When false, coverage/matchToBest/stumbles/paceVsBest are never computed or
// sent anywhere.
// ---------------------------------------------------------------------------

export const CHROMA_FEATURES_ENABLED = true

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const AGE = 7
const HISTORY_LIMIT = 5

function firstName(kidName: string): string {
  const trimmed = kidName.trim()
  if (trimmed === '') return 'Kid'
  return trimmed.split(/\s+/)[0]
}

function mapSelfRating(rating: SelfRating | undefined): SelfRatingLabel | undefined {
  if (rating === 1) return 'hard'
  if (rating === 2) return 'okay'
  if (rating === 3) return 'great'
  return undefined
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** True when `metrics` carries the "this take IS the reference" identity values set by applyReferenceComparison. */
function classifyReference(metrics: TakeMetrics): { isNewReference: boolean; differentMusic: boolean } {
  const isNewReference = metrics.coverage === 1 && metrics.matchToBest === 1 && metrics.paceVsBest === 1
  const differentMusic = !isNewReference && metrics.matchToBest !== undefined && metrics.matchToBest < 0.5
  return { isNewReference, differentMusic }
}

// ---------------------------------------------------------------------------
// Reference take selection (validated rule - see the reviewer's note): among
// a piece's analysed takes, keep the "complete performances" (playedSec at
// least 80% of the piece's own 75th-percentile playedSec), then pick the one
// with fewest hesitations, tying on most recently played.
// ---------------------------------------------------------------------------

interface ReferenceCandidate {
  takeId: string
  playedSec: number
  hesitations: number
  startedAt: number
}

function percentile75(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.round((sorted.length - 1) * 0.75))
  return sorted[idx]
}

function pickReferenceTakeId(candidates: ReferenceCandidate[]): string | null {
  if (candidates.length === 0) return null
  const p75 = percentile75(candidates.map((c) => c.playedSec))
  const complete = candidates.filter((c) => c.playedSec >= 0.8 * p75)
  const pool = complete.length > 0 ? complete : candidates
  let best = pool[0]
  for (const c of pool.slice(1)) {
    if (c.hesitations < best.hesitations || (c.hesitations === best.hesitations && c.startedAt > best.startedAt)) {
      best = c
    }
  }
  return best.takeId
}

function toFloat32(data: Float32Array | number[]): Float32Array {
  return data instanceof Float32Array ? data : Float32Array.from(data)
}

/**
 * Recomputes and applies the piece's current reference take against `take`,
 * mutating `metrics` in place: either the "this take is now the reference"
 * identity values (coverage/matchToBest/paceVsBest = 1), or a real
 * comparison against whichever other take is currently the reference.
 */
async function applyReferenceComparison(pieceId: string, take: PianoTake, metrics: TakeMetrics, fingerprint: Fingerprint): Promise<void> {
  // Only takes whose fingerprint exists ON THIS DEVICE can serve as the reference: metrics for
  // older takes may have arrived through sync (the Drive backfill, another device) without one.
  const onDevice = new Set((await getAnalysisStore().fingerprintsForPiece(pieceId)).map((f) => f.takeId))
  const existing: ReferenceCandidate[] = getDoc()
    .piano.takes.filter((t) => t.pieceId === pieceId && !t.isNote && t.id !== take.id && t.ai?.metrics && onDevice.has(t.id))
    .map((t) => ({ takeId: t.id, playedSec: t.ai!.metrics.playedSec, hesitations: t.ai!.metrics.hesitations, startedAt: t.startedAt }))
  const candidates: ReferenceCandidate[] = [
    ...existing,
    { takeId: take.id, playedSec: metrics.playedSec, hesitations: metrics.hesitations, startedAt: take.startedAt },
  ]
  const referenceId = pickReferenceTakeId(candidates)

  if (!referenceId || referenceId === take.id) {
    metrics.coverage = 1
    metrics.matchToBest = 1
    metrics.paceVsBest = 1
    return
  }

  const referenceFp = await getAnalysisStore().getFingerprint(referenceId)
  if (!referenceFp) return // no stored fingerprint to compare against - leave the reference fields unset

  const reference: Fingerprint = { blockSec: referenceFp.blockSec, blocks: referenceFp.blocks, data: toFloat32(referenceFp.data) }
  const cmp = compareToReference(fingerprint, reference)
  if (!cmp) return

  metrics.coverage = cmp.coverage
  metrics.matchToBest = cmp.matchToBest
  metrics.paceVsBest = cmp.pace
  if (cmp.stumbles.length > 0) metrics.stumbles = cmp.stumbles
}

// ---------------------------------------------------------------------------
// analyzeAndCoach
// ---------------------------------------------------------------------------

/** Measures the take and writes `take.ai` (metrics first, then the feedback text). Never throws. */
export async function analyzeAndCoach(takeId: string, blob: Blob): Promise<void> {
  try {
    const take = getDoc().piano.takes.find((t) => t.id === takeId)
    if (!take || take.isNote) return

    setCoachStage(takeId, 'analyzing')

    const decoded = await decodeToMono(blob)
    if (!decoded) {
      setCoachStage(takeId, 'failed')
      return
    }

    const { metrics, fingerprint } = analyzeTake(decoded.pcm, decoded.sampleRate)

    if (CHROMA_FEATURES_ENABLED) {
      await getAnalysisStore().putFingerprint({
        takeId,
        pieceId: take.pieceId,
        blockSec: fingerprint.blockSec,
        blocks: fingerprint.blocks,
        data: fingerprint.data,
        at: Date.now(),
      })
      if (take.pieceId) await applyReferenceComparison(take.pieceId, take, metrics, fingerprint)
    }

    setTakeAi(takeId, { metrics, at: Date.now() })
    setCoachStage(takeId, 'writing')
    await requestFeedback(takeId)
  } catch {
    setCoachStage(takeId, 'failed')
  }
}

/**
 * Catch-up for this device: takes of a named piece whose audio is still in
 * local storage but that have no fingerprint here yet (recorded before the
 * coach existed, or measured elsewhere) get one, so the next new take of that
 * piece has something to be compared with. Also fills in `ai.metrics` when a
 * take has none. Deliberately slow and small: newest first, a few per launch,
 * one at a time, never while a recording is being analysed. Never throws.
 */
export async function backfillLocalFingerprints(getBlob: (takeId: string) => Promise<Blob | null>, limit = 8): Promise<number> {
  if (!CHROMA_FEATURES_ENABLED) return 0
  let done = 0
  try {
    const takes = [...getDoc().piano.takes]
      .filter((t) => !t.isNote && t.pieceId && t.hasAudio)
      .sort((a, b) => b.startedAt - a.startedAt)
    for (const take of takes) {
      if (done >= limit) break
      if (await getAnalysisStore().getFingerprint(take.id)) continue
      const blob = await getBlob(take.id)
      if (!blob) continue
      const decoded = await decodeToMono(blob)
      if (!decoded) continue
      const { metrics, fingerprint } = analyzeTake(decoded.pcm, decoded.sampleRate)
      await getAnalysisStore().putFingerprint({
        takeId: take.id,
        pieceId: take.pieceId,
        blockSec: fingerprint.blockSec,
        blocks: fingerprint.blocks,
        data: fingerprint.data,
        at: Date.now(),
      })
      if (!take.ai?.metrics) setTakeAi(take.id, { metrics, at: Date.now() })
      done++
      // Yield between takes so the UI stays responsive on an older iPad.
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  } catch {
    // best effort
  }
  return done
}

// ---------------------------------------------------------------------------
// Talking to the parent's Apps Script
// ---------------------------------------------------------------------------

const COACH_TIMEOUT_MS = 25_000

interface CoachOkResponse {
  ok: true
  result: unknown
  model?: string
  usage?: unknown
  usedToday?: number
}
interface CoachFailResponse {
  ok: false
  reason?: string
  detail?: string
}
type CoachApiResponse = CoachOkResponse | CoachFailResponse

async function callCoach(
  cfg: DriveConfig,
  body: { system: string; user: string; schema: object },
  deps: { fetch?: typeof fetch } = {},
): Promise<CoachApiResponse> {
  const doFetch = deps.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS)
  try {
    const res = await doFetch(cfg.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      signal: controller.signal,
      body: JSON.stringify({ secret: cfg.secret, action: 'coach', system: body.system, user: body.user, schema: body.schema }),
    })
    let parsed: CoachApiResponse | null = null
    try {
      parsed = (await res.json()) as CoachApiResponse
    } catch {
      parsed = null
    }
    if (!parsed) return { ok: false, reason: `http-${res.status}` }
    return parsed
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return { ok: false, reason: isAbort ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** Reasons worth a single background retry (see requestFeedback) - anything else is a durable failure this run. */
function isTransientReason(reason: string | undefined): boolean {
  if (!reason) return false
  if (reason === 'cap' || reason === 'network' || reason === 'timeout') return true
  return /^http-5\d\d$/.test(reason)
}

// --- validating what Claude sends back --------------------------------------

const BANNED_WORDS = ['wrong', 'bad', 'mistake', 'lazy', 'terrible', 'sister']
const MAX_PRAISE_CHARS = 240
const MAX_TRY_NEXT_CHARS = 160
// Real Claude notes (checked against 10 live answers) run up to ~890 / ~1140 characters, so the caps
// leave generous headroom: a note a little over the asked-for length is still better than the fallback.
const MAX_PARENT_NOTE_CHARS = 1400
const MAX_JOURNEY_KID_CHARS = 700
const MAX_JOURNEY_PARENT_CHARS = 2000

/**
 * Tidies model text before validation: long dashes (and the occasional mangled escape such as a literal
 * "u2014" that slipped through structured output) become a plain hyphen, curly quotes become straight.
 */
export function tidyCoachText(text: string): string {
  return text
    .replace(/\s*(?:\\?u201[34]|[–—])\s*/g, ' - ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Every kid name other than the one on this device - never allowed to appear in the coach's text. */
function otherKidNames(): string[] {
  const mine = getKid()
  return Object.entries(KID_NAMES)
    .filter(([id]) => id !== mine)
    .map(([, name]) => name)
}

function containsBannedContent(text: string): boolean {
  const lower = text.toLowerCase()
  // Whole words only: "badge" must not trip on "bad".
  if (BANNED_WORDS.some((w) => new RegExp(`\\b${w}(s|es)?\\b`).test(lower))) return true
  if (otherKidNames().some((name) => lower.includes(name.toLowerCase()))) return true
  if (lower.includes('i heard') || lower.includes('i listened')) return true
  return false
}

function validateFeedback(raw: unknown): RuleFeedbackResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kid = r.kid as Record<string, unknown> | undefined
  const parent = r.parent as Record<string, unknown> | undefined
  if (!kid || typeof kid.praise !== 'string' || typeof kid.tryNext !== 'string') return null
  if (!parent || typeof parent.note !== 'string') return null

  const praise = tidyCoachText(kid.praise)
  const tryNext = tidyCoachText(kid.tryNext)
  const note = tidyCoachText(parent.note)
  if (praise.length > MAX_PRAISE_CHARS || tryNext.length > MAX_TRY_NEXT_CHARS || note.length > MAX_PARENT_NOTE_CHARS) return null
  if (containsBannedContent(praise) || containsBannedContent(tryNext) || containsBannedContent(note)) return null

  return { kid: { praise, tryNext }, parent: { note } }
}

/** True when the freshly-validated kid praise or tryNext reads as a near-repeat of one of her recent notes (of any piece). */
function tooSimilarToRecent(result: RuleFeedbackResult, recentNotes: FeedbackInput['recentNotes']): boolean {
  if (recentNotes.length === 0) return false
  const recentPraises = recentNotes.map((n) => n.praise)
  const recentTryNexts = recentNotes.map((n) => n.tryNext)
  return tooSimilar(result.kid.praise, recentPraises) || tooSimilar(result.kid.tryNext, recentTryNexts)
}

function validateJourney(raw: unknown): RuleJourneyResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.kid !== 'string' || typeof r.parent !== 'string') return null
  const kidText = tidyCoachText(r.kid)
  const parentText = tidyCoachText(r.parent)
  if (kidText.length > MAX_JOURNEY_KID_CHARS || parentText.length > MAX_JOURNEY_PARENT_CHARS) return null
  if (containsBannedContent(kidText) || containsBannedContent(parentText)) return null
  return { kid: kidText, parent: parentText }
}

// ---------------------------------------------------------------------------
// requestFeedback
// ---------------------------------------------------------------------------

function historyForPiece(pieceId: string, excludeTakeId: string): HistoryTake[] {
  const candidates = getDoc()
    .piano.takes.filter((t) => t.pieceId === pieceId && !t.isNote && t.id !== excludeTakeId && t.ai?.metrics)
    .sort((a, b) => a.startedAt - b.startedAt)
  return candidates.slice(-HISTORY_LIMIT).map((t) => ({ day: t.day, metrics: t.ai!.metrics }))
}

const RECENT_NOTES_LIMIT = 5

/** Her last (up to) 5 kid notes from analysed takes of ANY piece, newest first - excludes `excludeTakeId` itself. Used to keep the coach from repeating itself. */
function recentKidNotes(excludeTakeId: string): { praise: string; tryNext: string }[] {
  return getDoc()
    .piano.takes.filter((t) => !t.isNote && t.id !== excludeTakeId && t.ai?.kid)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, RECENT_NOTES_LIMIT)
    .map((t) => ({ praise: t.ai!.kid!.praise, tryNext: t.ai!.kid!.tryNext }))
}

/** The most recent journal entry's text for a local day, if she wrote one. */
function journalTextForDay(day: string): string | undefined {
  const entries = (getDoc().piano.journal ?? []).filter((e) => e.day === day)
  return entries.length > 0 ? entries[entries.length - 1].text : undefined
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** How much she's played this song overall, for the coach's "only mention plays/time when round or new" rule - undefined when there's no piece or no takes yet. */
function songSummary(pieceId: string | null): { plays: number; totalMin: number; days: number } | undefined {
  if (!pieceId) return undefined
  const doc = getDoc()
  const mode = doc.settings.pianoCountMode ?? 'recording'
  const stats = songStats(doc.piano.takes, pieceId, mode)
  if (stats.takes === 0) return undefined
  return { plays: stats.plays, totalMin: round1(stats.totalSec / 60), days: stats.daysPlayed }
}

function takeNumberForPiece(pieceId: string, take: PianoTake): number {
  const analysed = getDoc()
    .piano.takes.filter((t) => t.pieceId === pieceId && !t.isNote && t.ai?.metrics)
    .sort((a, b) => a.startedAt - b.startedAt)
  const idx = analysed.findIndex((t) => t.id === take.id)
  return idx >= 0 ? idx + 1 : analysed.length + 1
}

function computePersonalBests(history: HistoryTake[]): PersonalBests | undefined {
  if (history.length === 0) return undefined
  let longestPlayedSec: number | undefined
  let fewestHesitations: number | undefined
  let bestCoveragePct: number | undefined
  for (const h of history) {
    const m = h.metrics
    if (longestPlayedSec === undefined || m.playedSec > longestPlayedSec) longestPlayedSec = m.playedSec
    if (fewestHesitations === undefined || m.hesitations < fewestHesitations) fewestHesitations = m.hesitations
    if (m.coverage !== undefined) {
      const pct = Math.round(m.coverage * 100)
      if (bestCoveragePct === undefined || pct > bestCoveragePct) bestCoveragePct = pct
    }
  }
  return { longestPlayedSec, fewestHesitations, bestCoveragePct }
}

/** Rebuilds the exact request context for a take's feedback from its currently-stored `ai.metrics` - used by both requestFeedback and the background retry, so a retry sends identical input. */
function buildFeedbackContext(take: PianoTake): { input: FeedbackInput; ruleCtx: RuleFeedbackContext } | null {
  const metrics = take.ai?.metrics
  if (!metrics) return null

  const settings = getDoc().settings
  const pieceId = take.pieceId
  const piece = pieceId ? settings.pianoPieces.find((p) => p.id === pieceId) : undefined
  const { isNewReference, differentMusic } = classifyReference(metrics)
  const history = pieceId ? historyForPiece(pieceId, take.id) : []
  const personalBests = computePersonalBests(history)
  const takeNumber = pieceId ? takeNumberForPiece(pieceId, take) : 1
  const kidFirstName = firstName(settings.kidName)
  const selfRating = mapSelfRating(take.selfRating)
  const pieceName = piece?.name.trim() || null

  const today = localDay()
  const theme = themeForDay(today)
  const voice = voiceForDay(today)
  const recentNotes = recentKidNotes(take.id)

  const input: FeedbackInput = {
    kidFirstName,
    age: AGE,
    pieceName,
    goalText: piece?.goal,
    metrics,
    history,
    personalBests,
    selfRating,
    repetitions: take.repetitions,
    takeNumber,
    differentMusic,
    isNewReference,
    recentNotes,
    theme: `${theme.label} - ${theme.description}`,
    voice: `${voice.label} - ${voice.description}`,
    song: songSummary(pieceId),
    journalToday: journalTextForDay(today),
  }
  const ruleCtx: RuleFeedbackContext = {
    takeId: take.id,
    kidFirstName,
    pieceName,
    selfRating,
    repetitions: take.repetitions,
    differentMusic,
    isNewReference,
    recentNotes,
  }
  return { input, ruleCtx }
}

const RETRY_DELAY_MS = 5 * 60_000
const pendingRetries = new Set<string>()

function scheduleClaudeRetry(takeId: string): void {
  if (pendingRetries.has(takeId)) return
  pendingRetries.add(takeId)
  setTimeout(() => {
    pendingRetries.delete(takeId)
    void retryClaudeOnce(takeId)
  }, RETRY_DELAY_MS)
}

/** The single background retry scheduled after a transient Claude failure - overwrites the rules text if Claude succeeds this time. Never throws. */
async function retryClaudeOnce(takeId: string): Promise<void> {
  try {
    const take = getDoc().piano.takes.find((t) => t.id === takeId)
    if (!take || take.ai?.source === 'claude') return
    const settings = getDoc().settings
    if (settings.aiCoach?.enabled === false || !isDriveConfigured(settings)) return

    const built = buildFeedbackContext(take)
    if (!built) return

    const claudeResult = await callCoach(settings.driveUpload, {
      system: COACH_SYSTEM,
      user: buildFeedbackUser(built.input),
      schema: FEEDBACK_SCHEMA,
    })
    if (!claudeResult.ok) return
    const validated = validateFeedback(claudeResult.result)
    if (!validated) return

    setTakeAi(takeId, {
      metrics: take.ai!.metrics,
      kid: validated.kid,
      parent: validated.parent,
      source: 'claude',
      model: claudeResult.model,
      at: Date.now(),
    })
  } catch {
    // Best-effort only - the rules text already shown stands.
  }
}

/** Writes (or with `force`, rewrites) the feedback for a take that already has `ai.metrics`. Never throws. */
export async function requestFeedback(takeId: string, opts?: { force?: boolean }): Promise<void> {
  try {
    const take = getDoc().piano.takes.find((t) => t.id === takeId)
    if (!take || !take.ai?.metrics) return
    if (take.ai.kid && !opts?.force) return

    setCoachStage(takeId, 'writing')

    const built = buildFeedbackContext(take)
    if (!built) return
    const { input, ruleCtx } = built

    const settings = getDoc().settings
    const useClaude = settings.aiCoach?.enabled !== false && isDriveConfigured(settings)

    let result: RuleFeedbackResult | null = null
    let source: 'claude' | 'rules' = 'rules'
    let model: string | undefined
    let scheduleRetry = false

    if (useClaude) {
      const claudeResult = await callCoach(settings.driveUpload, {
        system: COACH_SYSTEM,
        user: buildFeedbackUser(input),
        schema: FEEDBACK_SCHEMA,
      })
      if (claudeResult.ok) {
        const validated = validateFeedback(claudeResult.result)
        if (validated && !tooSimilarToRecent(validated, input.recentNotes)) {
          result = validated
          source = 'claude'
          model = claudeResult.model
        } else if (validated) {
          // Too close to a recent note - one retry, nudged to say something genuinely different.
          const retryUser = `${buildFeedbackUser(input)}\n\nYour last answer was too similar to a recent note: "${input.recentNotes[0].praise}". Say something genuinely different.`
          const retryResult = await callCoach(settings.driveUpload, { system: COACH_SYSTEM, user: retryUser, schema: FEEDBACK_SCHEMA })
          if (retryResult.ok) {
            const retryValidated = validateFeedback(retryResult.result)
            if (retryValidated && !tooSimilarToRecent(retryValidated, input.recentNotes)) {
              result = retryValidated
              source = 'claude'
              model = retryResult.model
            }
          }
          // Still similar (or invalid, or the retry failed) - falls through to the rules fallback below.
        }
      } else if (isTransientReason(claudeResult.reason)) {
        scheduleRetry = true
      }
    }

    if (!result) {
      result = ruleFeedback(input.metrics, input.history, ruleCtx)
      source = 'rules'
      model = undefined
    }

    setTakeAi(takeId, { metrics: input.metrics, kid: result.kid, parent: result.parent, source, model, at: Date.now() })
    setCoachStage(takeId, 'done')

    if (scheduleRetry) scheduleClaudeRetry(takeId)

    if (take.pieceId) void requestJourney(take.pieceId)
  } catch {
    setCoachStage(takeId, 'failed')
  }
}

// ---------------------------------------------------------------------------
// requestJourney
// ---------------------------------------------------------------------------

const JOURNEY_MIN_TAKES = 3
const JOURNEY_MIN_NEW_TAKES = 3

function buildJourneySeries(takes: PianoTake[]): JourneyDayStat[] {
  const byDay = new Map<string, PianoTake[]>()
  for (const t of takes) {
    const list = byDay.get(t.day) ?? []
    list.push(t)
    byDay.set(t.day, list)
  }
  const days = [...byDay.keys()].sort()
  return days.map((day) => {
    const dayTakes = byDay.get(day)!
    const playedSecs = dayTakes.map((t) => t.ai!.metrics.playedSec)
    const hesitations = dayTakes.map((t) => t.ai!.metrics.hesitations)
    const coverages = dayTakes.map((t) => t.ai!.metrics.coverage).filter((c): c is number => c !== undefined)
    const paces = dayTakes.map((t) => t.ai!.metrics.paceVsBest).filter((p): p is number => p !== undefined)

    const stat: JourneyDayStat = {
      day,
      takes: dayTakes.length,
      playedSecMedian: Math.round(median(playedSecs)),
      playedSecBest: Math.max(...playedSecs),
      hesitationsMedian: Math.round(median(hesitations)),
      hesitationsBest: Math.min(...hesitations),
    }
    if (coverages.length > 0) {
      stat.coveragePctMedian = Math.round(median(coverages) * 100)
      stat.coveragePctBest = Math.round(Math.max(...coverages) * 100)
    }
    if (paces.length > 0) stat.paceVsBestMedian = round2(median(paces))
    return stat
  })
}

/** Writes (or with `force`, rewrites) the song-journey summary for one piece. Never throws. */
export async function requestJourney(pieceId: string, opts?: { force?: boolean }): Promise<void> {
  try {
    const doc = getDoc()
    const analysedTakes = doc.piano.takes.filter((t) => t.pieceId === pieceId && !t.isNote && t.ai?.metrics)
    if (analysedTakes.length < JOURNEY_MIN_TAKES) return

    const existing = doc.piano.journeys?.[pieceId]
    const force = opts?.force ?? false
    if (!force && existing && analysedTakes.length - existing.takeCount < JOURNEY_MIN_NEW_TAKES) return

    const series = buildJourneySeries(analysedTakes)
    if (series.length === 0) return

    const settings = doc.settings
    const piece = settings.pianoPieces.find((p) => p.id === pieceId)
    const pieceName = piece?.name.trim() || 'this piece'
    const kidFirstName = firstName(settings.kidName)

    const previousJourney = existing ? `${existing.kid} ${existing.parent}` : undefined
    const input: JourneyInput = {
      kidFirstName,
      age: AGE,
      pieceName,
      goalText: piece?.goal,
      series,
      takeCount: analysedTakes.length,
      previousJourney,
    }
    const ruleCtx: RuleJourneyContext = { pieceId, kidFirstName, pieceName }

    const useClaude = settings.aiCoach?.enabled !== false && isDriveConfigured(settings)
    let result: RuleJourneyResult | null = null
    let source: 'claude' | 'rules' = 'rules'

    if (useClaude) {
      const claudeResult = await callCoach(settings.driveUpload, {
        system: COACH_SYSTEM,
        user: buildJourneyUser(input),
        schema: JOURNEY_SCHEMA,
      })
      if (claudeResult.ok) {
        const validated = validateJourney(claudeResult.result)
        if (validated) {
          result = validated
          source = 'claude'
        }
      }
      // No background retry for journeys - the next take that qualifies triggers another attempt anyway.
    }

    if (!result) {
      result = ruleJourney(series, ruleCtx)
      source = 'rules'
    }

    setJourney(pieceId, { kid: result.kid, parent: result.parent, at: Date.now(), takeCount: analysedTakes.length, source })
  } catch {
    // Never throws - a failed journey just means it's retried once enough new takes accumulate.
  }
}

// ---------------------------------------------------------------------------
// coachStatus - for Settings' "Test AI coach" button
// ---------------------------------------------------------------------------

export interface CoachStatusResult {
  ok: boolean
  hasKey?: boolean
  /** Result of the script's real test request to Claude; undefined when the deployed script is too old to run one. */
  apiOk?: boolean
  /** Claude's own error message when apiOk is false (no credits, key not scoped to a workspace, ...). */
  apiError?: string
  usedToday?: number
  cap?: number
  /** True when the script responded but doesn't recognize the coach action at all (an old, pre-coach deployment). */
  outdated?: boolean
  error?: string
}

export async function coachStatus(deps: { fetch?: typeof fetch } = {}): Promise<CoachStatusResult> {
  const settings = getDoc().settings
  if (!isDriveConfigured(settings)) {
    return { ok: false, error: 'Add a Drive script URL and secret above first.' }
  }
  const doFetch = deps.fetch ?? fetch
  try {
    const res = await doFetch(settings.driveUpload.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({ secret: settings.driveUpload.secret, action: 'coach-status' }),
    })
    let parsed: { ok?: boolean; hasKey?: boolean; apiOk?: boolean; apiError?: string; usedToday?: number; cap?: number; error?: string } | null = null
    try {
      parsed = await res.json()
    } catch {
      parsed = null
    }
    if (!parsed) return { ok: false, error: `Could not reach that URL (HTTP ${res.status}).` }
    if (parsed.ok) {
      return {
        ok: true,
        hasKey: Boolean(parsed.hasKey),
        // Older script versions only report hasKey; treat a missing apiOk as "not checked".
        apiOk: parsed.apiOk,
        apiError: parsed.apiError,
        usedToday: parsed.usedToday ?? 0,
        cap: parsed.cap ?? 0,
      }
    }
    return { ok: false, outdated: parsed.error === 'no audio data', error: parsed.error ?? 'Unknown error.' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach that URL.' }
  }
}
