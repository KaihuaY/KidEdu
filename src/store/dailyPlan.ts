// Today's cube plan: one warm-up (a replay of whichever mission she last did
// before today, if any) plus one new mission (the first open one - same rule
// Wall.tsx's `findNextUp` already used). The plan is computed fresh from her
// mission records, but frozen into `profiles.kid.cubeDay` for the whole local
// day (see progress.ts's `CubeDay` doc comment) so it can't shift under her
// mid-session - e.g. finishing the warm-up stamps that mission's
// `lastDoneDay` to today, which would otherwise make it stop qualifying as
// "yesterday's mission" and silently swap the warm-up card out from under her.

import { getDoc, update, type MissionProgress, type ProfileProgress } from './progress'
import { dayOffset, localDay } from './sessions'
import { firstOpenMission, isMissionDone } from './missions'
import { LESSON_LIST, missionById, nextHoldId, nextMissionId, type HoldId, type Lesson, type MissionCard } from '../content/lessons'

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
  allDone: boolean
}

/**
 * Render-safe read of today's plan: never writes. Screens render with this
 * and call ensureTodaysPlan() from an effect, so persisting the day's plan
 * never happens as a store write in the middle of a render.
 */
export function readTodaysPlan(today: string = localDay()): DailyPlan {
  const profile = getDoc().profiles.kid
  const cubeDay = profile.cubeDay
  if (!cubeDay || cubeDay.day !== today) return computePlan(profile, LESSON_LIST, today)
  const warmup = enrichEntry(cubeDay.warmup)
  let mission = enrichEntry(cubeDay.mission)
  if (mission && !mission.doneAt && isMissionDone(profile.holds[mission.holdId], mission.missionId)) {
    mission = findFirstOpenMission(profile, LESSON_LIST)
  }
  return { day: today, warmup, mission, allDone: !mission }
}

/** The very next open mission, in wall order - the same rule Wall.tsx's `findNextUp` uses. */
function findFirstOpenMission(profile: ProfileProgress, lessons: Lesson[]): DailyPlanEntry | undefined {
  for (const lesson of lessons) {
    const hold = profile.holds[lesson.id]
    if (hold?.masteredAt) continue
    const missionIds = lesson.missions.map((m) => m.id)
    const openId = firstOpenMission(hold, missionIds)
    if (!openId) continue
    const mission = lesson.missions.find((m) => m.id === openId)
    if (mission) return { holdId: lesson.id, missionId: openId, title: mission.title }
  }
  return undefined
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
 * Pure: today's plan from scratch. `mission` is the first open mission;
 * `warmup` is the completed mission with the earliest spaced-review due date
 * that is `<= today` (ties broken by the oldest `lastDoneDay`), excluding
 * today's new mission and anything already done today - undefined on day
 * one, or any day nothing is due yet.
 */
export function computePlan(profile: ProfileProgress, lessons: Lesson[], today: string): DailyPlan {
  const mission = findFirstOpenMission(profile, lessons)

  let warmup: DailyPlanEntry | undefined
  let warmupDue = ''
  let warmupLastDoneDay = ''
  for (const lesson of lessons) {
    const hold = profile.holds[lesson.id]
    if (!hold?.missions) continue
    for (const missionDef of lesson.missions) {
      const record = hold.missions[missionDef.id]
      if (!record?.completedAt) continue
      const lastDoneDay = record.lastDoneDay ?? ''
      if (lastDoneDay && lastDoneDay >= today) continue // already done today
      if (mission && lesson.id === mission.holdId && missionDef.id === mission.missionId) continue
      const due = dueDay(record)
      if (!due || due > today) continue // not due yet
      if (!warmup || due < warmupDue || (due === warmupDue && lastDoneDay < warmupLastDoneDay)) {
        warmup = { holdId: lesson.id, missionId: missionDef.id, title: missionDef.title }
        warmupDue = due
        warmupLastDoneDay = lastDoneDay
      }
    }
  }

  return { day: today, warmup, mission, allDone: !mission }
}

/** Enriches a stored (holdId/missionId/doneAt) cubeDay entry with its current title, or drops it if the mission no longer exists. */
function enrichEntry(entry: { holdId: string; missionId: string; doneAt?: number } | undefined): DailyPlanEntry | undefined {
  if (!entry) return undefined
  const mission = missionById(entry.holdId, entry.missionId)
  if (!mission) return undefined
  return { holdId: entry.holdId, missionId: entry.missionId, title: mission.title, doneAt: entry.doneAt }
}

/**
 * Today's plan, computed once per local day and then held stable: the first
 * call of a new day persists `{ day, warmup, mission }` onto
 * `profiles.kid.cubeDay`; every later call the same day just reads that back
 * (enriched with each mission's current title, in case content changed).
 * Guards one edge case: if the stored `mission` is already done but was
 * never stamped `doneAt` (completed some other way, e.g. mastering the hold
 * via "Help with my cube"), the actual next open mission is re-derived
 * instead of showing a dead planned mission forever.
 */
export function ensureTodaysPlan(today: string = localDay()): DailyPlan {
  const profile = getDoc().profiles.kid
  const cubeDay = profile.cubeDay

  if (!cubeDay || cubeDay.day !== today) {
    const plan = computePlan(profile, LESSON_LIST, today)
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        cubeDay: {
          day: today,
          warmup: plan.warmup ? { holdId: plan.warmup.holdId, missionId: plan.warmup.missionId } : undefined,
          mission: plan.mission ? { holdId: plan.mission.holdId, missionId: plan.mission.missionId } : undefined,
        },
      },
    }))
    return plan
  }

  const warmup = enrichEntry(cubeDay.warmup)
  let mission = enrichEntry(cubeDay.mission)
  if (mission && !mission.doneAt && isMissionDone(profile.holds[mission.holdId], mission.missionId)) {
    mission = findFirstOpenMission(profile, LESSON_LIST)
  }

  return { day: today, warmup, mission, allDone: !mission }
}

/** "Warm-up + 1 mission" / "1 mission" / "Done today" / "All holds mastered" - for the Home cube card. */
export function cubeStatusText(plan: DailyPlan, kidName: string): string {
  if (plan.allDone) return `All holds mastered, ${kidName}! 🏔️`
  if (plan.mission?.doneAt) return 'Done today ✅'
  if (plan.warmup && !plan.warmup.doneAt) return '▶ Warm-up + 1 new mission'
  return '▶ 1 new mission'
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
