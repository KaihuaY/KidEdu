// Today's cube plan: one warm-up (a replay of whichever mission she last did
// before today, if any) plus one new mission (the first open one - same rule
// Wall.tsx's `findNextUp` already used). The plan is computed fresh from her
// mission records, but frozen into `profiles.kid.cubeDay` for the whole local
// day (see progress.ts's `CubeDay` doc comment) so it can't shift under her
// mid-session - e.g. finishing the warm-up stamps that mission's
// `lastDoneDay` to today, which would otherwise make it stop qualifying as
// "yesterday's mission" and silently swap the warm-up card out from under her.

import { getDoc, update, type MissionProgress, type ProfileProgress, type Settings } from './progress'
import { dayNumber, dayOffset, localDay } from './sessions'
import { firstOpenMission, isBranchEnabled, isMissionDone, nodeState } from './missions'
import {
  LESSON_LIST,
  isTrailLesson,
  lessonById,
  missionById,
  nextHoldId,
  nextMissionId,
  type HoldId,
  type Lesson,
  type MissionCard,
} from '../content/lessons'

export interface DailyPlanEntry {
  holdId: string
  missionId: string
  title: string
  doneAt?: number
}

export interface DailyPlan {
  day: string
  warmup?: DailyPlanEntry
  mission?: DailyPlanEntry
  /** Trail mission first, then any side-quest picks (gym, then pattern) - empty only once every trail hold is mastered and no branch has an open node. */
  choices: DailyPlanEntry[]
  /** Stamped once she finishes the trail mission or any of today's `choices`. */
  starEarned?: DailyPlanEntry
  allDone: boolean
}

export interface DailyPlanOptions {
  /** Per-branch on/off toggle (mirrors Settings.cubeBranches); unset = every branch on. */
  branches?: { gym?: boolean; patterns?: boolean }
}

/**
 * Render-safe read of today's plan: never writes. Screens render with this
 * and call ensureTodaysPlan() from an effect, so persisting the day's plan
 * never happens as a store write in the middle of a render.
 */
export function readTodaysPlan(today: string = localDay()): DailyPlan {
  const doc = getDoc()
  const profile = doc.profiles.kid
  const cubeDay = profile.cubeDay
  if (!cubeDay || cubeDay.day !== today) {
    return computePlan(profile, LESSON_LIST, today, { branches: doc.settings.cubeBranches })
  }

  const warmup = enrichEntry(cubeDay.warmup)
  const mission = reDeriveIfNoLongerOpen(profile, enrichEntry(cubeDay.mission))
  const choices = enrichChoices(profile, doc.settings, cubeDay.choices)
  const starEarned = enrichStarEarned(cubeDay.starEarned)

  return { day: today, warmup, mission, choices, starEarned, allDone: !mission }
}

/** The very next open trail mission, in wall order - the same rule Wall.tsx's `findNextUp` uses. Branch nodes (Phase 3) are never today's trail mission. */
function findFirstOpenMission(profile: ProfileProgress, lessons: Lesson[]): DailyPlanEntry | undefined {
  for (const lesson of lessons) {
    if (!isTrailLesson(lesson)) continue
    if (nodeState(profile, lesson) !== 'open') continue
    const missionIds = lesson.missions.map((m) => m.id)
    const openId = firstOpenMission(profile.holds[lesson.id], missionIds)
    if (!openId) continue
    const mission = lesson.missions.find((m) => m.id === openId)
    if (mission) return { holdId: lesson.id, missionId: openId, title: mission.title }
  }
  return undefined
}

/**
 * A stored trail mission that no longer reads 'open' (e.g. a new bridge hold
 * got inserted ahead of it, so its hold is now locked behind the bridge) is
 * stale - re-derive the real next open mission instead of showing a locked
 * one forever. Also re-derives when the stored mission is already done but
 * was never stamped `doneAt` (completed some other way).
 */
function reDeriveIfNoLongerOpen(profile: ProfileProgress, mission: DailyPlanEntry | undefined): DailyPlanEntry | undefined {
  if (!mission) return undefined
  if (!mission.doneAt && isMissionDone(profile.holds[mission.holdId], mission.missionId)) {
    return findFirstOpenMission(profile, LESSON_LIST)
  }
  const lesson = lessonById(mission.holdId)
  if (!lesson || nodeState(profile, lesson) !== 'open') {
    return findFirstOpenMission(profile, LESSON_LIST)
  }
  return mission
}

/** Today's gym pick (Phase 3 content): round-robins through the enabled, unmastered gym nodes by `dayNumber`. */
function findGymChoice(profile: ProfileProgress, lessons: Lesson[], today: string): DailyPlanEntry | undefined {
  const open = lessons.filter((l) => l.branch === 'gym' && !profile.holds[l.id]?.masteredAt)
  if (open.length === 0) return undefined
  const lesson = open[dayNumber(today) % open.length]
  const openId = firstOpenMission(profile.holds[lesson.id], lesson.missions.map((m) => m.id))
  if (!openId) return undefined
  const missionDef = lesson.missions.find((m) => m.id === openId)
  return missionDef ? { holdId: lesson.id, missionId: openId, title: missionDef.title } : undefined
}

/** Today's pattern pick (Phase 3 content): the Pattern Lab node's own first open mission - there's only ever one such node. */
function findPatternChoice(profile: ProfileProgress, lessons: Lesson[]): DailyPlanEntry | undefined {
  const lesson = lessons.find((l) => l.branch === 'patterns')
  if (!lesson || profile.holds[lesson.id]?.masteredAt) return undefined
  const openId = firstOpenMission(profile.holds[lesson.id], lesson.missions.map((m) => m.id))
  if (!openId) return undefined
  const missionDef = lesson.missions.find((m) => m.id === openId)
  return missionDef ? { holdId: lesson.id, missionId: openId, title: missionDef.title } : undefined
}

/**
 * A completed mission's spaced-review due date: its own `nextReviewDay` when
 * set, otherwise (a legacy record from before spaced review existed) the day
 * right after its `lastDoneDay` - so an old save is treated as due tomorrow,
 * same as a fresh first completion. Undefined for a mission with neither
 * (not actually completed, or completed but never locally dated).
 */
function dueDay(record: MissionProgress): string | undefined {
  if (record.nextReviewDay) return record.nextReviewDay
  if (record.lastDoneDay) return dayOffset(record.lastDoneDay, 1)
  return undefined
}

/**
 * Pure: today's plan from scratch. `mission` is the first open trail
 * mission; `choices` is that mission (when there is one) plus today's side
 * quests - a round-robin gym pick and the Pattern Lab's own pick, each only
 * when its branch is enabled and it still has an open node (Phase 3 ships
 * the actual gym/pattern lessons; with none in `lessons` yet, `choices` is
 * just `[mission]`). `warmup` is the completed mission with the earliest
 * spaced-review due date that is `<= today` (ties broken by the oldest
 * `lastDoneDay`), drawn from the trail and gym only - a pattern is never a
 * warm-up - excluding anything already in `choices` and anything already
 * done today. Undefined on day one, or any day nothing is due yet.
 */
export function computePlan(
  profile: ProfileProgress,
  lessons: Lesson[],
  today: string,
  options?: DailyPlanOptions,
): DailyPlan {
  const mission = findFirstOpenMission(profile, lessons)
  const gymEnabled = options?.branches?.gym ?? true
  const patternsEnabled = options?.branches?.patterns ?? true
  const gymChoice = gymEnabled ? findGymChoice(profile, lessons, today) : undefined
  const patternChoice = patternsEnabled ? findPatternChoice(profile, lessons) : undefined

  const choices: DailyPlanEntry[] = [mission, gymChoice, patternChoice].filter(
    (e): e is DailyPlanEntry => Boolean(e),
  )
  const inChoices = (holdId: string, missionId: string) =>
    choices.some((c) => c.holdId === holdId && c.missionId === missionId)

  let warmup: DailyPlanEntry | undefined
  let warmupDue = ''
  let warmupLastDoneDay = ''
  for (const lesson of lessons) {
    if (lesson.branch === 'patterns') continue // a pattern is never a warm-up
    const hold = profile.holds[lesson.id]
    if (!hold?.missions) continue
    for (const missionDef of lesson.missions) {
      const record = hold.missions[missionDef.id]
      if (!record?.completedAt) continue
      const lastDoneDay = record.lastDoneDay ?? ''
      if (lastDoneDay && lastDoneDay >= today) continue // already done today
      if (inChoices(lesson.id, missionDef.id)) continue
      const due = dueDay(record)
      if (!due || due > today) continue // not due yet
      if (!warmup || due < warmupDue || (due === warmupDue && lastDoneDay < warmupLastDoneDay)) {
        warmup = { holdId: lesson.id, missionId: missionDef.id, title: missionDef.title }
        warmupDue = due
        warmupLastDoneDay = lastDoneDay
      }
    }
  }

  return { day: today, warmup, mission, choices, allDone: !mission }
}

/** Enriches a stored (holdId/missionId/doneAt) cubeDay entry with its current title, or drops it if the mission no longer exists. */
function enrichEntry(entry: { holdId: string; missionId: string; doneAt?: number } | undefined): DailyPlanEntry | undefined {
  if (!entry) return undefined
  const mission = missionById(entry.holdId, entry.missionId)
  if (!mission) return undefined
  return { holdId: entry.holdId, missionId: entry.missionId, title: mission.title, doneAt: entry.doneAt }
}

/**
 * Enriches stored `cubeDay.choices` (each just `{holdId, missionId}` - see
 * the CubeDay doc comment) with current titles, dropping any entry whose
 * mission no longer exists or whose branch has since been switched off in
 * Settings; a choice already completed is kept (so it can render with a
 * done mark), its `doneAt` read straight off the mission's own progress
 * record rather than stored on the entry itself.
 */
function enrichChoices(
  profile: ProfileProgress,
  settings: Settings,
  stored: { holdId: string; missionId: string }[] | undefined,
): DailyPlanEntry[] {
  if (!stored) return []
  const out: DailyPlanEntry[] = []
  for (const entry of stored) {
    const lesson = lessonById(entry.holdId)
    const mission = missionById(entry.holdId, entry.missionId)
    if (!lesson || !mission) continue
    if (lesson.branch && !isBranchEnabled(settings, lesson.branch)) continue
    const completedAt = profile.holds[entry.holdId]?.missions?.[entry.missionId]?.completedAt
    out.push({ holdId: entry.holdId, missionId: entry.missionId, title: mission.title, doneAt: completedAt })
  }
  return out
}

/** Enriches the stored `cubeDay.starEarned` stamp with its mission's current title, keeping the stamp's own `doneAt`. */
function enrichStarEarned(
  entry: { holdId: string; missionId: string; doneAt: number } | undefined,
): DailyPlanEntry | undefined {
  if (!entry) return undefined
  const mission = missionById(entry.holdId, entry.missionId)
  if (!mission) return undefined
  return { holdId: entry.holdId, missionId: entry.missionId, title: mission.title, doneAt: entry.doneAt }
}

/**
 * Today's plan, computed once per local day and then held stable: the first
 * call of a new day persists `{ day, warmup, mission, choices }` onto
 * `profiles.kid.cubeDay`; every later call the same day just reads that back
 * (enriched with each mission's current title, in case content changed, and
 * with branch toggles re-checked - see enrichChoices). Guards one edge case
 * on the trail mission: if it's already done but was never stamped `doneAt`
 * (completed some other way, e.g. mastering the hold via "Help with my
 * cube"), or its hold is no longer 'open' (e.g. a new bridge hold got
 * inserted ahead of it), the real next open mission is re-derived instead of
 * showing a dead or locked planned mission forever.
 */
export function ensureTodaysPlan(today: string = localDay()): DailyPlan {
  const doc = getDoc()
  const profile = doc.profiles.kid
  const cubeDay = profile.cubeDay

  if (!cubeDay || cubeDay.day !== today) {
    const plan = computePlan(profile, LESSON_LIST, today, { branches: doc.settings.cubeBranches })
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        cubeDay: {
          day: today,
          warmup: plan.warmup ? { holdId: plan.warmup.holdId, missionId: plan.warmup.missionId } : undefined,
          mission: plan.mission ? { holdId: plan.mission.holdId, missionId: plan.mission.missionId } : undefined,
          choices: plan.choices.map((c) => ({ holdId: c.holdId, missionId: c.missionId })),
        },
      },
    }))
    return plan
  }

  const warmup = enrichEntry(cubeDay.warmup)
  const mission = reDeriveIfNoLongerOpen(profile, enrichEntry(cubeDay.mission))
  const choices = enrichChoices(profile, doc.settings, cubeDay.choices)
  const starEarned = enrichStarEarned(cubeDay.starEarned)

  return { day: today, warmup, mission, choices, starEarned, allDone: !mission }
}

/** "Warm-up + pick 1 of N" / "Pick 1 of N" (N=1 keeps the old "1 new mission" wording) / "Done today" / "All holds mastered" - for the Home cube card. */
export function cubeStatusText(plan: DailyPlan, kidName: string): string {
  if (plan.allDone) return `All holds mastered, ${kidName}! 🏔️`
  if (plan.starEarned) return 'Done today ✅'
  const n = plan.choices.length
  if (plan.warmup && !plan.warmup.doneAt) {
    return n <= 1 ? '▶ Warm-up + 1 new mission' : `▶ Warm-up + pick 1 of ${n}`
  }
  return n <= 1 ? '▶ 1 new mission' : `▶ Pick 1 of ${n}`
}

/** The mission right after today's planned one - the next mission in the same hold, or the first of the next hold. */
export function tomorrowsMission(
  plan: DailyPlan,
  lessons: Lesson[],
): { holdId: string; missionId: string; title: string; look: MissionCard } | undefined {
  if (!plan.mission) return undefined
  const lesson = lessons.find((l) => l.id === plan.mission!.holdId)
  if (!lesson) return undefined

  const nextId = nextMissionId(lesson, plan.mission.missionId)
  if (nextId) {
    const mission = lesson.missions.find((m) => m.id === nextId)
    if (mission) return { holdId: lesson.id, missionId: mission.id, title: mission.title, look: mission.look }
  }

  const nextHold = nextHoldId(lesson.id as HoldId)
  const nextLesson = nextHold ? lessons.find((l) => l.id === nextHold) : undefined
  const firstMission = nextLesson?.missions[0]
  if (!nextLesson || !firstMission) return undefined
  return { holdId: nextLesson.id, missionId: firstMission.id, title: firstMission.title, look: firstMission.look }
}
