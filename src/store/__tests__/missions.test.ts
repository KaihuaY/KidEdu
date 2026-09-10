import { beforeEach, describe, expect, it } from 'vitest'
import {
  addMissionMinutes,
  bumpMissionTries,
  bumpTrickReps,
  completeMission,
  completeWarmup,
  firstOpenMission,
  isMissionDone,
  isMissionUnlocked,
  markDailyMissionDone,
  masterHold,
  missionStars,
  missionsDoneCount,
  scaffoldMode,
  scheduleAfterWarmup,
  tierForHelp,
  trickCompletions,
} from '../missions'
import { getDoc, resetAll, update, type HoldProgress, type MissionProgress, type ProfileProgress } from '../progress'
import { dayOffset, localDay } from '../sessions'

// Same in-memory localStorage mock used by store/__tests__/progress.test.ts.
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
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  resetAll()
})

function kidHold(id: string): HoldProgress | undefined {
  return getDoc().profiles.kid.holds[id]
}

describe('tierForHelp', () => {
  it('maps help level to token tier', () => {
    expect(tierForHelp('none')).toBe('gold')
    expect(tierForHelp('scan')).toBe('silver')
    expect(tierForHelp('walkthrough')).toBe('bronze')
  })
})

describe('completeMission', () => {
  it('first completion awards a token of the earned tier, xpForTier, and records tries/help/tier', () => {
    const tier = completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(tier).toBe('gold')

    const doc = getDoc()
    expect(doc.profiles.kid.tokens).toEqual({ gold: 1, silver: 0, bronze: 0 })
    expect(doc.profiles.kid.xp).toBe(30) // xpForTier('gold')

    const mission = kidHold('daisy')?.missions?.D1
    expect(mission?.tier).toBe('gold')
    expect(mission?.help).toBe('none')
    expect(mission?.tries).toBe(1)
    expect(mission?.completedAt).toBeGreaterThan(0)
    expect(mission?.reviewStage).toBe(0)
    expect(mission?.nextReviewDay).toBe(dayOffset(localDay(), 1))
  })

  it('a replay keeps the reviewStage/nextReviewDay wherever the last warm-up left them', () => {
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        holds: {
          ...profiles.kid.holds,
          daisy: {
            ...profiles.kid.holds.daisy,
            missions: {
              ...profiles.kid.holds.daisy.missions,
              D1: { ...profiles.kid.holds.daisy.missions!.D1, reviewStage: 2, nextReviewDay: '2099-01-01' },
            },
          },
        },
      },
    }))
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    const mission = kidHold('daisy')?.missions?.D1
    expect(mission?.reviewStage).toBe(2)
    expect(mission?.nextReviewDay).toBe('2099-01-01')
  })

  it('help=scan -> silver, help=walkthrough -> bronze on first completion', () => {
    expect(completeMission('kid', 'daisy', 'D2', 'scan', 2)).toBe('silver')
    expect(getDoc().profiles.kid.tokens.silver).toBe(1)

    expect(completeMission('kid', 'daisy', 'D3', 'walkthrough', 5)).toBe('bronze')
    expect(getDoc().profiles.kid.tokens.bronze).toBe(1)
  })

  it('a replay gives no new token, +5 XP, keeps the original completedAt, and only upgrades the tier if better', () => {
    completeMission('kid', 'daisy', 'D1', 'walkthrough', 4) // bronze first
    const firstCompletedAt = kidHold('daisy')?.missions?.D1?.completedAt
    const xpAfterFirst = getDoc().profiles.kid.xp

    // Replay with a better tier (gold): upgrades, no new token, +5 xp.
    const tier = completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(tier).toBe('gold')

    const doc = getDoc()
    expect(doc.profiles.kid.tokens).toEqual({ gold: 0, silver: 0, bronze: 1 }) // still just the one bronze token
    expect(doc.profiles.kid.xp).toBe(xpAfterFirst + 5)
    const mission = doc.profiles.kid.holds.daisy.missions?.D1
    expect(mission?.tier).toBe('gold')
    expect(mission?.completedAt).toBe(firstCompletedAt)
  })

  it('a replay with a worse tier does not downgrade the recorded tier', () => {
    completeMission('kid', 'daisy', 'D1', 'none', 1) // gold first
    completeMission('kid', 'daisy', 'D1', 'walkthrough', 5) // worse attempt
    expect(kidHold('daisy')?.missions?.D1?.tier).toBe('gold')
  })

  it('stamps lastDoneDay to today on the first completion and on every replay', () => {
    const today = localDay()
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(kidHold('daisy')?.missions?.D1?.lastDoneDay).toBe(today)

    // Force it stale, then replay - lastDoneDay should move back to today.
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        holds: {
          ...profiles.kid.holds,
          daisy: {
            ...profiles.kid.holds.daisy,
            missions: {
              ...profiles.kid.holds.daisy.missions,
              D1: { ...profiles.kid.holds.daisy.missions!.D1, lastDoneDay: '2000-01-01' },
            },
          },
        },
      },
    }))
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(kidHold('daisy')?.missions?.D1?.lastDoneDay).toBe(today)
  })

  it("stamps cubeDay.mission.doneAt when the completion matches today's planned mission", () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, cubeDay: { day: localDay(), mission: { holdId: 'daisy', missionId: 'D1' } } },
    }))
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(getDoc().profiles.kid.cubeDay?.mission?.doneAt).toBeGreaterThan(0)
  })

  it("does not stamp cubeDay.mission.doneAt for a mission that isn't today's plan", () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, cubeDay: { day: localDay(), mission: { holdId: 'daisy', missionId: 'D2' } } },
    }))
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(getDoc().profiles.kid.cubeDay?.mission?.doneAt).toBeUndefined()
  })
})

describe('markDailyMissionDone', () => {
  it('is idempotent - a second call never moves doneAt forward', () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, cubeDay: { day: localDay(), mission: { holdId: 'daisy', missionId: 'D1' } } },
    }))
    markDailyMissionDone('kid', 'daisy', 'D1')
    const firstDoneAt = getDoc().profiles.kid.cubeDay?.mission?.doneAt
    expect(firstDoneAt).toBeGreaterThan(0)
    markDailyMissionDone('kid', 'daisy', 'D1')
    expect(getDoc().profiles.kid.cubeDay?.mission?.doneAt).toBe(firstDoneAt)
  })

  it('does nothing when there is no cubeDay at all', () => {
    markDailyMissionDone('kid', 'daisy', 'D1')
    expect(getDoc().profiles.kid.cubeDay).toBeUndefined()
  })
})

describe('completeWarmup', () => {
  it('gives +5 XP, no token, and stamps lastDoneDay but not completedAt/tier', () => {
    const xpBefore = getDoc().profiles.kid.xp
    completeWarmup('kid', 'daisy', 'D1')

    const doc = getDoc()
    expect(doc.profiles.kid.xp).toBe(xpBefore + 5)
    expect(doc.profiles.kid.tokens).toEqual({ gold: 0, silver: 0, bronze: 0 })
    const mission = doc.profiles.kid.holds.daisy?.missions?.D1
    expect(mission?.lastDoneDay).toBe(localDay())
    expect(mission?.completedAt).toBeUndefined()
    expect(mission?.tier).toBeUndefined()
  })

  it("stamps cubeDay.warmup.doneAt when it matches today's planned warm-up, once", () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, cubeDay: { day: localDay(), warmup: { holdId: 'daisy', missionId: 'D1' } } },
    }))
    completeWarmup('kid', 'daisy', 'D1')
    const firstDoneAt = getDoc().profiles.kid.cubeDay?.warmup?.doneAt
    expect(firstDoneAt).toBeGreaterThan(0)

    completeWarmup('kid', 'daisy', 'D1')
    expect(getDoc().profiles.kid.cubeDay?.warmup?.doneAt).toBe(firstDoneAt) // idempotent
  })

  it("does not stamp cubeDay.warmup.doneAt for a mission that isn't today's planned warm-up", () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, cubeDay: { day: localDay(), warmup: { holdId: 'daisy', missionId: 'D2' } } },
    }))
    completeWarmup('kid', 'daisy', 'D1')
    expect(getDoc().profiles.kid.cubeDay?.warmup?.doneAt).toBeUndefined()
  })
})

describe('bumpMissionTries', () => {
  it('increments a running tries counter before the mission is completed', () => {
    expect(bumpMissionTries('kid', 'daisy', 'D1')).toBe(1)
    expect(bumpMissionTries('kid', 'daisy', 'D1')).toBe(2)
    expect(kidHold('daisy')?.missions?.D1?.tries).toBe(2)
    expect(kidHold('daisy')?.missions?.D1?.completedAt).toBeUndefined()
  })
})

describe('addMissionMinutes', () => {
  it('accumulates minutes on a mission, ignoring non-positive amounts', () => {
    addMissionMinutes('kid', 'daisy', 'D1', 2)
    addMissionMinutes('kid', 'daisy', 'D1', 1.5)
    addMissionMinutes('kid', 'daisy', 'D1', 0)
    addMissionMinutes('kid', 'daisy', 'D1', -1)
    expect(kidHold('daisy')?.missions?.D1?.minutes).toBeCloseTo(3.5)
  })
})

describe('isMissionDone / missionsDoneCount / firstOpenMission / isMissionUnlocked', () => {
  const ids = ['D1', 'D2', 'D3', 'D4']

  it('a hold with masteredAt counts every mission done, even with no mission records', () => {
    const hold: HoldProgress = { stages: {}, missions: {}, masteredAt: 123 }
    for (const id of ids) expect(isMissionDone(hold, id)).toBe(true)
    expect(missionsDoneCount(hold, ids)).toBe(4)
    expect(firstOpenMission(hold, ids)).toBeUndefined()
  })

  it('sequential unlock: only the first mission (and any after a completed run) is open', () => {
    expect(isMissionUnlocked(undefined, ids, 'D1')).toBe(true)
    expect(isMissionUnlocked(undefined, ids, 'D2')).toBe(false)

    completeMission('kid', 'daisy', 'D1', 'none', 1)
    let hold = kidHold('daisy')
    expect(isMissionUnlocked(hold, ids, 'D2')).toBe(true)
    expect(isMissionUnlocked(hold, ids, 'D3')).toBe(false)
    expect(firstOpenMission(hold, ids)).toBe('D2')
    expect(missionsDoneCount(hold, ids)).toBe(1)

    completeMission('kid', 'daisy', 'D2', 'none', 1)
    completeMission('kid', 'daisy', 'D3', 'none', 1)
    completeMission('kid', 'daisy', 'D4', 'none', 1)
    hold = kidHold('daisy')
    expect(missionsDoneCount(hold, ids)).toBe(4)
    expect(firstOpenMission(hold, ids)).toBeUndefined()
  })
})

describe('missionStars', () => {
  const ids = ['D1', 'D2']

  it('is 0 until every mission is done', () => {
    expect(missionStars(undefined, ids)).toBe(0)
    completeMission('kid', 'daisy', 'D1', 'none', 1)
    expect(missionStars(kidHold('daisy'), ids)).toBe(0)
  })

  it('once all done, is the worst tier earned across the missions', () => {
    completeMission('kid', 'daisy', 'D1', 'none', 1) // gold
    completeMission('kid', 'daisy', 'D2', 'walkthrough', 3) // bronze
    expect(missionStars(kidHold('daisy'), ids)).toBe(1) // starsForTier('bronze')
  })

  it('a legacy hold mastered with no per-mission tier data reads as a clean gold', () => {
    const hold: HoldProgress = { stages: {}, missions: {}, masteredAt: 1 }
    expect(missionStars(hold, ids)).toBe(3)
  })
})

describe('scheduleAfterWarmup', () => {
  function progressAt(reviewStage?: number): MissionProgress {
    return { tries: 1, help: 'none', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-01', reviewStage }
  }

  it("'easy' advances the stage by one and schedules the next interval out", () => {
    const next = scheduleAfterWarmup(progressAt(0), '2026-02-01', 'easy')
    expect(next.reviewStage).toBe(1)
    expect(next.nextReviewDay).toBe(dayOffset('2026-02-01', 3)) // REVIEW_INTERVALS_DAYS[1]
    expect(next.lastDoneDay).toBe('2026-02-01')
  })

  it("'easy' caps the stage at the last interval (30 days) instead of running off the end", () => {
    const next = scheduleAfterWarmup(progressAt(4), '2026-02-01', 'easy')
    expect(next.reviewStage).toBe(4)
    expect(next.nextReviewDay).toBe(dayOffset('2026-02-01', 30))
  })

  it("'easy' on a record with no reviewStage yet treats it as stage 0", () => {
    const next = scheduleAfterWarmup(progressAt(undefined), '2026-02-01', 'easy')
    expect(next.reviewStage).toBe(1)
    expect(next.nextReviewDay).toBe(dayOffset('2026-02-01', 3))
  })

  it("'needed-help' leaves the stage unchanged and brings the next review back to tomorrow", () => {
    const next = scheduleAfterWarmup(progressAt(3), '2026-02-01', 'needed-help')
    expect(next.reviewStage).toBe(3)
    expect(next.nextReviewDay).toBe(dayOffset('2026-02-01', 1))
    expect(next.lastDoneDay).toBe('2026-02-01')
  })
})

describe('completeWarmup outcome', () => {
  it("'easy' (the default) advances the review stage via scheduleAfterWarmup", () => {
    completeMission('kid', 'daisy', 'D1', 'none', 1) // reviewStage 0
    completeWarmup('kid', 'daisy', 'D1')
    const mission = kidHold('daisy')?.missions?.D1
    expect(mission?.reviewStage).toBe(1)
    expect(mission?.nextReviewDay).toBe(dayOffset(localDay(), 3))
  })

  it("'needed-help' keeps the stage and schedules tomorrow", () => {
    completeMission('kid', 'daisy', 'D1', 'none', 1) // reviewStage 0
    completeWarmup('kid', 'daisy', 'D1', 'needed-help')
    const mission = kidHold('daisy')?.missions?.D1
    expect(mission?.reviewStage).toBe(0)
    expect(mission?.nextReviewDay).toBe(dayOffset(localDay(), 1))
  })
})

describe('trickCompletions / bumpTrickReps', () => {
  function emptyProfile(): ProfileProgress {
    return { holds: {}, xp: 0, tokens: { gold: 0, silver: 0, bronze: 0 }, sessions: [], streak: { current: 0, best: 0, lastDay: '' } }
  }

  it('trickCompletions reads 0 for an untouched trick', () => {
    expect(trickCompletions(emptyProfile(), 'elevator')).toBe(0)
  })

  it('bumpTrickReps increments and persists the counter for that trick only', () => {
    expect(bumpTrickReps('kid', 'elevator')).toBe(1)
    expect(bumpTrickReps('kid', 'elevator')).toBe(2)
    expect(bumpTrickReps('kid', 'goRight')).toBe(1)

    const profile = getDoc().profiles.kid
    expect(trickCompletions(profile, 'elevator')).toBe(2)
    expect(trickCompletions(profile, 'goRight')).toBe(1)
  })
})

describe('scaffoldMode', () => {
  it('0-2 reps: follow-along only', () => {
    expect(scaffoldMode(0)).toBe('followAlongOnly')
    expect(scaffoldMode(1)).toBe('followAlongOnly')
    expect(scaffoldMode(2)).toBe('followAlongOnly')
  })

  it('3-4 reps: a choice, defaulting to follow-along', () => {
    expect(scaffoldMode(3)).toBe('choiceFollowAlong')
    expect(scaffoldMode(4)).toBe('choiceFollowAlong')
  })

  it('5+ reps: a choice, defaulting to from-memory', () => {
    expect(scaffoldMode(5)).toBe('choiceMemory')
    expect(scaffoldMode(9)).toBe('choiceMemory')
  })
})

describe('masterHold', () => {
  it('is idempotent: the first call masters and gives a gold token, later calls do nothing', () => {
    expect(masterHold('kid', 'daisy')).toBe(true)
    expect(kidHold('daisy')?.masteredAt).toBeGreaterThan(0)
    expect(getDoc().profiles.kid.tokens.gold).toBe(1)

    const goldBefore = getDoc().profiles.kid.tokens.gold
    const masteredAtBefore = kidHold('daisy')?.masteredAt
    expect(masterHold('kid', 'daisy')).toBe(false)
    expect(getDoc().profiles.kid.tokens.gold).toBe(goldBefore)
    expect(kidHold('daisy')?.masteredAt).toBe(masteredAtBefore)
  })
})
