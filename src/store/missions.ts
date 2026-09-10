// Pure(ish) helpers behind the mission curriculum: sequential unlock, tier
// bookkeeping and the token/XP economy for one mission ("Look -> Do ->
// Check"), plus the two small React hooks a mission screen needs
// (`useMissionMinutesTracker`) and the whole-hold "you mastered it" award
// (`masterHold`, moved here from the old Watch/Try/Spot/Climb Lesson screen).

import { useEffect } from 'react'
import { update, type HelpKind, type HoldProgress, type MissionProgress, type ProfileProgress } from './progress'
import { dayOffset, localDay } from './sessions'
import { starsForTier, xpForTier, type Tier } from './rewards'

type ProfileId = 'kid' | 'parent'

/** gold: no help at all - silver: checked with the scanner - bronze: walked through it. */
export function tierForHelp(help: HelpKind): Tier {
  if (help === 'none') return 'gold'
  if (help === 'scan') return 'silver'
  return 'bronze'
}

const TIER_RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 }

/** The better (numerically higher) of two tiers - used when a replay upgrades a mission's medal. */
function betterTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
}

function emptyHold(): HoldProgress {
  return { stages: {}, missions: {} }
}

/**
 * A hold that's already mastered counts every mission of it as done, even one
 * with no individual mission record (a legacy save mastered before the
 * mission curriculum existed, or a fresh mastery recorded straight from
 * `masterHold`). Otherwise a mission is done once it has a `completedAt`.
 */
export function isMissionDone(hold: HoldProgress | undefined, missionId: string): boolean {
  if (hold?.masteredAt) return true
  return Boolean(hold?.missions?.[missionId]?.completedAt)
}

/** How many of `missionIds` are done for this hold. */
export function missionsDoneCount(hold: HoldProgress | undefined, missionIds: string[]): number {
  if (hold?.masteredAt) return missionIds.length
  return missionIds.filter((id) => isMissionDone(hold, id)).length
}

/** The id of the first mission (in curriculum order) that isn't done yet, or undefined once every mission is. */
export function firstOpenMission(hold: HoldProgress | undefined, missionIds: string[]): string | undefined {
  return missionIds.find((id) => !isMissionDone(hold, id))
}

/** Missions unlock one at a time: the first is always open, every later one needs its predecessor done. */
export function isMissionUnlocked(hold: HoldProgress | undefined, missionIds: string[], missionId: string): boolean {
  if (hold?.masteredAt) return true
  const index = missionIds.indexOf(missionId)
  if (index <= 0) return true
  return missionIds.slice(0, index).every((id) => isMissionDone(hold, id))
}

/**
 * Overall star rating for a hold's missions: 0 unless every mission is done,
 * otherwise the worst tier earned across them (mirrors the old "min star
 * across every stage" rule - one shaky mission keeps the hold from shining).
 * A hold mastered from a legacy save with no per-mission tier data at all
 * reads as a clean 3-star gold rather than 0.
 */
export function missionStars(hold: HoldProgress | undefined, missionIds: string[]): 0 | 1 | 2 | 3 {
  if (missionIds.length === 0) return 0
  if (missionsDoneCount(hold, missionIds) < missionIds.length) return 0
  const tiers = missionIds.map((id) => hold?.missions?.[id]?.tier)
  if (tiers.every((t) => t === undefined)) return 3
  const stars = tiers.map((t) => starsForTier(t ?? 'gold'))
  return Math.min(...stars) as 0 | 1 | 2 | 3
}

/**
 * Records one mission attempt as finished. The first completion of a mission
 * awards a token of its tier plus that tier's XP; a replay never awards a
 * second token (the hold was already given credit) but can upgrade the
 * mission's medal if this attempt did better, and always gives a small +5 XP
 * for the practice. Returns the tier now on record for this mission.
 */
export function completeMission(
  profileId: ProfileId,
  holdId: string,
  missionId: string,
  help: HelpKind,
  tries: number,
): Tier {
  const tier = tierForHelp(help)
  const today = localDay()
  let recordedTier: Tier = tier
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? emptyHold()
    const missions = hold.missions ?? {}
    const prev = missions[missionId]
    const isFirst = !prev?.completedAt
    const nextTier = isFirst ? tier : betterTier(prev.tier ?? 'bronze', tier)
    recordedTier = nextTier

    const nextMission: MissionProgress = {
      completedAt: prev?.completedAt ?? Date.now(),
      tier: nextTier,
      tries,
      help,
      minutes: prev?.minutes ?? 0,
      lastDoneDay: today,
      // First completion starts the spaced-review clock; a replay leaves it
      // exactly where completeWarmup last put it.
      reviewStage: isFirst ? 0 : prev?.reviewStage,
      nextReviewDay: isFirst ? dayOffset(today, 1) : prev?.nextReviewDay,
    }

    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: {
          ...profile.holds,
          [holdId]: { ...hold, missions: { ...missions, [missionId]: nextMission } },
        },
        tokens: isFirst ? { ...profile.tokens, [tier]: profile.tokens[tier] + 1 } : profile.tokens,
        xp: profile.xp + (isFirst ? xpForTier(tier) : 5),
      },
    }
  })
  markDailyMissionDone(profileId, holdId, missionId)
  return recordedTier
}

/**
 * Stamps `cubeDay.mission.doneAt` when this completion is today's planned
 * mission (a plain "Yes, I did it!" on the mission the daily plan already
 * pointed at). A no-op otherwise - e.g. replaying an older mission, or a
 * mission that isn't today's plan (nothing to stamp), or one already
 * stamped (idempotent, never moves `doneAt` forward on a later replay).
 */
export function markDailyMissionDone(profileId: ProfileId, holdId: string, missionId: string): void {
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const cubeDay = profile.cubeDay
    const plannedMission = cubeDay?.mission
    if (!plannedMission || plannedMission.holdId !== holdId || plannedMission.missionId !== missionId) return profiles
    if (plannedMission.doneAt) return profiles
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        cubeDay: { ...cubeDay!, mission: { ...plannedMission, doneAt: Date.now() } },
      },
    }
  })
}

/** Spaced-review intervals in days, by stage 0..4 (index = current stage after a successful warm-up). */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30]

/**
 * Pure: the mission record after one warm-up outcome. 'easy' advances the
 * review stage (capped at the last interval) and pushes the next review out
 * to `today + REVIEW_INTERVALS_DAYS[newStage]`; 'needed-help' leaves the
 * stage alone and brings the next review back to tomorrow, so a shaky trick
 * gets seen again sooner. A record with no `reviewStage` yet (e.g. a legacy
 * save) is treated as stage 0, same as a mission's first completion.
 */
export function scheduleAfterWarmup(
  progress: MissionProgress,
  today: string,
  outcome: 'easy' | 'needed-help',
): MissionProgress {
  if (outcome === 'needed-help') {
    return { ...progress, lastDoneDay: today, nextReviewDay: dayOffset(today, 1) }
  }
  const stage = Math.min((progress.reviewStage ?? 0) + 1, REVIEW_INTERVALS_DAYS.length - 1)
  return {
    ...progress,
    lastDoneDay: today,
    reviewStage: stage,
    nextReviewDay: dayOffset(today, REVIEW_INTERVALS_DAYS[stage]),
  }
}

/**
 * Replays a mission she already knows, as today's one-minute warm-up: +5 XP
 * for the practice, no token (she already earned one the first time), and no
 * change to the mission's recorded tier. `outcome` drives the spaced-review
 * schedule (see `scheduleAfterWarmup`) - 'easy' (the default, "Still got it
 * ✅") pushes the next review further out, 'needed-help' ("🔁 Show me again",
 * or any "Show me" in from-memory mode) brings it back to tomorrow. Stamps
 * `cubeDay.warmup.doneAt` when this is today's planned warm-up.
 */
export function completeWarmup(
  profileId: ProfileId,
  holdId: string,
  missionId: string,
  outcome: 'easy' | 'needed-help' = 'easy',
): void {
  const today = localDay()
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? emptyHold()
    const missions = hold.missions ?? {}
    const prev: MissionProgress = missions[missionId] ?? { tries: 0, help: 'none', minutes: 0 }
    const nextMission = scheduleAfterWarmup(prev, today, outcome)
    const cubeDay = profile.cubeDay
    const plannedWarmup = cubeDay?.warmup
    const stampWarmup = Boolean(
      plannedWarmup && plannedWarmup.holdId === holdId && plannedWarmup.missionId === missionId && !plannedWarmup.doneAt,
    )

    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: {
          ...profile.holds,
          [holdId]: { ...hold, missions: { ...missions, [missionId]: nextMission } },
        },
        xp: profile.xp + 5,
        cubeDay: stampWarmup ? { ...cubeDay!, warmup: { ...plannedWarmup!, doneAt: Date.now() } } : cubeDay,
      },
    }
  })
}

/** Number of prior completions of a named trick (`profile.trickReps[algId]`), from `MissionPlayer`'s follow-along finishes. */
export function trickCompletions(profile: ProfileProgress, algId: string): number {
  return profile.trickReps?.[algId] ?? 0
}

/** Bumps a named trick's completion counter by one (a follow-along finish, or "Did the whole trick" from memory). Returns the new count. */
export function bumpTrickReps(profileId: ProfileId, algId: string): number {
  let next = 0
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const trickReps = profile.trickReps ?? {}
    next = (trickReps[algId] ?? 0) + 1
    return {
      ...profiles,
      [profileId]: { ...profile, trickReps: { ...trickReps, [algId]: next } },
    }
  })
  return next
}

/** How MissionPlayer offers the follow-along/from-memory choice for a named trick, by its rep count. */
export type ScaffoldMode = 'followAlongOnly' | 'choiceFollowAlong' | 'choiceMemory'

/**
 * The fading-scaffolds rule: fewer than 3 reps, only follow-along is shown;
 * 3-4 reps offers a choice, defaulting to follow-along; 5+ reps offers the
 * same choice but now defaults to from-memory.
 */
export function scaffoldMode(reps: number): ScaffoldMode {
  if (reps >= 5) return 'choiceMemory'
  if (reps >= 3) return 'choiceFollowAlong'
  return 'followAlongOnly'
}

/**
 * Bumps a mission's running tries counter by one (e.g. every "Not yet" tap
 * during a mission attempt, before it's finished). Returns the new count.
 * Safe to call before the mission has ever been completed.
 */
export function bumpMissionTries(profileId: ProfileId, holdId: string, missionId: string): number {
  let next = 0
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? emptyHold()
    const missions = hold.missions ?? {}
    const prev = missions[missionId]
    next = (prev?.tries ?? 0) + 1

    const nextMission: MissionProgress = {
      completedAt: prev?.completedAt,
      tier: prev?.tier,
      tries: next,
      help: prev?.help ?? 'none',
      minutes: prev?.minutes ?? 0,
    }

    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: {
          ...profile.holds,
          [holdId]: { ...hold, missions: { ...missions, [missionId]: nextMission } },
        },
      },
    }
  })
  return next
}

/** Adds wall-clock minutes spent on one mission attempt to its running total. */
export function addMissionMinutes(profileId: ProfileId, holdId: string, missionId: string, minutes: number): void {
  if (minutes <= 0) return
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? emptyHold()
    const missions = hold.missions ?? {}
    const prev: MissionProgress = missions[missionId] ?? { tries: 0, help: 'none', minutes: 0 }

    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: {
          ...profile.holds,
          [holdId]: { ...hold, missions: { ...missions, [missionId]: { ...prev, minutes: prev.minutes + minutes } } },
        },
      },
    }
  })
}

/**
 * Marks a whole hold mastered (every mission of it finished) and awards the
 * extra gold token that comes with finishing the wall. Idempotent - calling
 * it again for an already-mastered hold changes nothing. Returns true only
 * the one time this call is what mastered it.
 */
export function masterHold(profileId: ProfileId, holdId: string): boolean {
  let justMastered = false
  update('profiles', (profiles) => {
    const profile = profiles[profileId]
    const hold = profile.holds[holdId] ?? emptyHold()
    if (hold.masteredAt) return profiles
    justMastered = true
    return {
      ...profiles,
      [profileId]: {
        ...profile,
        holds: { ...profile.holds, [holdId]: { ...hold, masteredAt: Date.now() } },
        tokens: { ...profile.tokens, gold: profile.tokens.gold + 1 },
      },
    }
  })
  return justMastered
}

/** Tracks wall-clock time spent on one mission and flushes it to progress when it closes (unmount, or holdId/missionId change). */
export function useMissionMinutesTracker(profileId: ProfileId, holdId: string, missionId: string): void {
  useEffect(() => {
    const startedAt = Date.now()
    return () => {
      const minutes = (Date.now() - startedAt) / 60000
      addMissionMinutes(profileId, holdId, missionId, minutes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, holdId, missionId])
}
