import { beforeEach, describe, expect, it } from 'vitest'
import { computePlan, cubeStatusText, ensureTodaysPlan, readTodaysPlan, tomorrowsMission } from '../dailyPlan'
import { completeMission } from '../missions'
import { dayNumber } from '../sessions'
import { getDoc, resetAll, update, type HoldProgress, type ProfileProgress } from '../progress'
import { BRANCHES, LESSON_LIST, TRAIL_LESSONS, type HoldId, type Lesson } from '../../content/lessons'

/** A minimal, valid synthetic branch node for Phase 2 tests - a real Lesson shape, just with placeholder copy. */
function branchLesson(id: string, branch: 'gym' | 'patterns', missionIds: string[]): Lesson {
  return {
    id: id as HoldId,
    number: 0,
    title: id,
    goal: 'g',
    story: 's',
    phaseIds: [],
    namedAlgIds: [],
    realCubeHint: 'h',
    prereqs: [],
    branch,
    missions: missionIds.map((missionId) => ({
      id: missionId,
      title: missionId,
      estimatedMinutes: 3,
      look: { title: 't', text: 't', say: 't' },
      steps: [],
      check: { text: 't', say: 't' },
      goalCheck: () => ({ done: true }),
    })),
  }
}

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

function emptyProfile(): ProfileProgress {
  return { holds: {}, xp: 0, tokens: { gold: 0, silver: 0, bronze: 0 }, sessions: [], streak: { current: 0, best: 0, lastDay: '' } }
}

function hold(missions: HoldProgress['missions'], masteredAt?: number): HoldProgress {
  return { stages: {}, missions, masteredAt }
}

describe('computePlan', () => {
  it('day one: no warm-up, and the mission is the very first one (Base Camp / B1)', () => {
    const plan = computePlan(emptyProfile(), LESSON_LIST, '2026-01-01')
    expect(plan.warmup).toBeUndefined()
    expect(plan.mission).toEqual({ holdId: 'basecamp', missionId: 'B1', title: 'Hold it like a climber' })
    expect(plan.allDone).toBe(false)
  })

  it('warm-up is the completed mission with the earliest due nextReviewDay <= today, across holds', () => {
    const profile = emptyProfile()
    profile.holds.basecamp = hold({}, 1) // mastered - out of the way
    profile.holds.daisy = hold({
      D1: {
        tries: 1,
        help: 'none',
        tier: 'gold',
        minutes: 0,
        completedAt: 1,
        lastDoneDay: '2026-01-05',
        reviewStage: 0,
        nextReviewDay: '2026-01-06', // most overdue - due first
      },
      D2: {
        tries: 1,
        help: 'none',
        tier: 'gold',
        minutes: 0,
        completedAt: 2,
        lastDoneDay: '2026-01-07',
        reviewStage: 0,
        nextReviewDay: '2026-01-08', // due today, but later than D1
      },
    })

    const plan = computePlan(profile, LESSON_LIST, '2026-01-08')
    expect(plan.warmup?.holdId).toBe('daisy')
    expect(plan.warmup?.missionId).toBe('D1') // the earliest due date, not the most recently done
    expect(plan.mission?.missionId).toBe('D3') // first still-open daisy mission
  })

  it('ties in due date break on the oldest lastDoneDay', () => {
    const profile = emptyProfile()
    profile.holds.daisy = hold({
      D1: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-02', nextReviewDay: '2026-01-05' },
      D2: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 2, lastDoneDay: '2026-01-04', nextReviewDay: '2026-01-05' },
    })
    const plan = computePlan(profile, LESSON_LIST, '2026-01-08')
    expect(plan.warmup?.missionId).toBe('D1') // same due date, but D1's lastDoneDay is older
  })

  it('expanding review intervals move a mission out of the warm-up slot once it is no longer due', () => {
    const profile = emptyProfile()
    profile.holds.daisy = hold({
      D1: {
        tries: 1,
        help: 'none',
        tier: 'gold',
        minutes: 0,
        completedAt: 1,
        lastDoneDay: '2026-01-01',
        reviewStage: 3, // last warm-up pushed this out to the 14-day interval
        nextReviewDay: '2026-01-15',
      },
    })
    const plan = computePlan(profile, LESSON_LIST, '2026-01-08')
    expect(plan.warmup).toBeUndefined() // 2026-01-15 is still in the future
  })

  it('no warm-up when nothing is due yet', () => {
    const profile = emptyProfile()
    profile.holds.daisy = hold({
      D1: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-07', reviewStage: 0, nextReviewDay: '2026-01-10' },
    })
    const plan = computePlan(profile, LESSON_LIST, '2026-01-08')
    expect(plan.warmup).toBeUndefined()
  })

  it('a legacy record with no nextReviewDay is treated as due the day after its lastDoneDay', () => {
    const profile = emptyProfile()
    profile.holds.daisy = hold({
      D1: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-07' }, // no reviewStage/nextReviewDay at all
    })
    // Due the day right after lastDoneDay: not yet due on 01-07 itself...
    expect(computePlan(profile, LESSON_LIST, '2026-01-07').warmup).toBeUndefined()
    // ...but due from 01-08 onward.
    expect(computePlan(profile, LESSON_LIST, '2026-01-08').warmup?.missionId).toBe('D1')
  })

  it("a mission completed earlier today never doubles as the warm-up (it's excluded because its lastDoneDay isn't before today, not because it happens to be today's new mission)", () => {
    const profile = emptyProfile()
    profile.holds.basecamp = hold(
      {
        B1: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-01' },
        B5: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 2, lastDoneDay: '2026-01-08' }, // done TODAY
      },
      1, // mastered
    )

    const plan = computePlan(profile, LESSON_LIST, '2026-01-08')
    expect(plan.warmup?.missionId).toBe('B1') // the older one, not the one just done today
  })

  it('allDone is true, and mission is undefined, once every hold is mastered', () => {
    const profile = emptyProfile()
    for (const lesson of LESSON_LIST) profile.holds[lesson.id] = hold({}, 1)

    const plan = computePlan(profile, LESSON_LIST, '2026-01-08')
    expect(plan.mission).toBeUndefined()
    expect(plan.allDone).toBe(true)
  })
})

describe('computePlan: choices and branches (round 13)', () => {
  // These five tests use synthetic branch nodes on top of TRAIL_LESSONS only
  // (not the real LESSON_LIST, which now carries the real Trick Gym / Pattern
  // Lab content shipped in Phase 3) - they exercise computePlan's generic
  // branch-choice/rotation/warm-up rules in isolation, independent of that
  // content. The "with the real curriculum" describe block below covers the
  // real LESSON_LIST.
  it('choices is just [trail mission] when the lesson list has no branch nodes', () => {
    const plan = computePlan(emptyProfile(), TRAIL_LESSONS, '2026-01-01')
    expect(plan.choices).toEqual([{ holdId: 'basecamp', missionId: 'B1', title: 'Hold it like a climber' }])
  })

  it('choices adds a rotated gym pick and the pattern pick when branch lessons are present', () => {
    const gymA = branchLesson('gymA', 'gym', ['G1'])
    const gymB = branchLesson('gymB', 'gym', ['G1'])
    const patterns = branchLesson('patterns2', 'patterns', ['PL1'])
    const lessons = [...TRAIL_LESSONS, gymA, gymB, patterns]
    const profile = emptyProfile()

    const plan = computePlan(profile, lessons, '2026-01-01')
    expect(plan.choices).toHaveLength(3)
    expect(plan.choices[0]).toEqual({ holdId: 'basecamp', missionId: 'B1', title: 'Hold it like a climber' })
    expect(['gymA', 'gymB']).toContain(plan.choices[1]?.holdId)
    expect(plan.choices[2]).toEqual({ holdId: 'patterns2', missionId: 'PL1', title: 'PL1' })
  })

  it("the gym pick rotates day to day (round-robins by dayNumber)", () => {
    const gymA = branchLesson('gymA', 'gym', ['G1'])
    const gymB = branchLesson('gymB', 'gym', ['G1'])
    const lessons = [...TRAIL_LESSONS, gymA, gymB]
    const profile = emptyProfile()

    const seenHoldIds = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const plan = computePlan(profile, lessons, `2026-01-${String(i + 1).padStart(2, '0')}`)
      const gymChoice = plan.choices.find((c) => c.holdId === 'gymA' || c.holdId === 'gymB')
      if (gymChoice) seenHoldIds.add(gymChoice.holdId)
    }
    expect(seenHoldIds.size).toBe(2) // both nodes get picked across 10 days
  })

  it('a disabled branch is excluded from choices entirely', () => {
    const gymA = branchLesson('gymA', 'gym', ['G1'])
    const patterns = branchLesson('patterns2', 'patterns', ['PL1'])
    const lessons = [...TRAIL_LESSONS, gymA, patterns]
    const profile = emptyProfile()

    const plan = computePlan(profile, lessons, '2026-01-01', { branches: { gym: false } })
    expect(plan.choices.some((c) => c.holdId === 'gymA')).toBe(false)
    expect(plan.choices.some((c) => c.holdId === 'patterns2')).toBe(true)

    const bothOff = computePlan(profile, lessons, '2026-01-01', { branches: { gym: false, patterns: false } })
    expect(bothOff.choices).toEqual([{ holdId: 'basecamp', missionId: 'B1', title: 'Hold it like a climber' }])
  })

  it('a completed pattern mission never becomes the warm-up, even once due', () => {
    const patterns = branchLesson('patterns2', 'patterns', ['PL1'])
    const lessons = [...TRAIL_LESSONS, patterns]
    const profile = emptyProfile()
    profile.holds.patterns2 = hold({
      PL1: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-01', nextReviewDay: '2026-01-02' },
    })

    const plan = computePlan(profile, lessons, '2026-01-02')
    expect(plan.warmup).toBeUndefined()
  })

  it('unlike patterns, a completed and due gym mission CAN become the warm-up (the pool is trail + gym)', () => {
    const gymA = branchLesson('gymA', 'gym', ['G1', 'G2'])
    const lessons = [...TRAIL_LESSONS, gymA]
    const profile = emptyProfile()
    profile.holds.basecamp = hold({}, 1)
    profile.holds.gymA = hold({
      G1: { tries: 1, help: 'none', tier: 'gold', minutes: 0, completedAt: 1, lastDoneDay: '2026-01-01', nextReviewDay: '2026-01-02' },
    })

    const plan = computePlan(profile, lessons, '2026-01-02')
    expect(plan.warmup).toEqual({ holdId: 'gymA', missionId: 'G1', title: 'G1' })
  })
})

describe('computePlan with the real curriculum (round 13 Phase 3 gym/pattern content)', () => {
  it("a fresh profile's choices are [B1, today's rotated gym Learn-it, PL1]", () => {
    const today = '2026-09-30'
    const plan = computePlan(emptyProfile(), LESSON_LIST, today)
    expect(plan.choices).toHaveLength(3)
    expect(plan.choices[0]).toEqual({ holdId: 'basecamp', missionId: 'B1', title: 'Hold it like a climber' })

    const gymNodeIds = BRANCHES.find((b) => b.id === 'gym')!.nodeIds
    const expectedGymNodeId = gymNodeIds[dayNumber(today) % gymNodeIds.length]
    const expectedLesson = LESSON_LIST.find((l) => l.id === expectedGymNodeId)!
    const expectedLearnIt = expectedLesson.missions[0]
    expect(plan.choices[1]).toEqual({
      holdId: expectedGymNodeId,
      missionId: expectedLearnIt.id,
      title: expectedLearnIt.title,
    })
    expect(expectedLearnIt.title).toBe('Learn it')

    expect(plan.choices[2]).toEqual({ holdId: 'patterns', missionId: 'PL1', title: 'Checkerboard' })
  })

  it('disabling the gym branch drops the gym choice, keeping the trail mission and the pattern', () => {
    const plan = computePlan(emptyProfile(), LESSON_LIST, '2026-09-30', { branches: { gym: false } })
    expect(plan.choices.some((c) => c.holdId.startsWith('gym'))).toBe(false)
    expect(plan.choices).toEqual([
      { holdId: 'basecamp', missionId: 'B1', title: 'Hold it like a climber' },
      { holdId: 'patterns', missionId: 'PL1', title: 'Checkerboard' },
    ])
  })
})

describe('readTodaysPlan: the frozen middle/M1 plan re-derives to colourMatch/CM1 (round 13 bridge insert)', () => {
  function masteredHold(): HoldProgress {
    return { stages: {}, missions: {}, masteredAt: 1 }
  }

  it("Nora-shaped profile (basecamp..corners mastered, middle open in a stale stored plan) re-derives to colourMatch/CM1", () => {
    update('profiles', (profiles) => ({
      ...profiles,
      kid: {
        ...profiles.kid,
        holds: {
          basecamp: masteredHold(),
          daisy: masteredHold(),
          cross: masteredHold(),
          cornerFind: masteredHold(),
          corners: masteredHold(),
        },
        cubeDay: { day: '2026-09-30', mission: { holdId: 'middle', missionId: 'M1' } },
      },
    }))

    const plan = readTodaysPlan('2026-09-30')
    expect(plan.mission?.holdId).toBe('colourMatch')
    expect(plan.mission?.missionId).toBe('CM1')
  })

  it('day one (nothing mastered) still gives B1', () => {
    const plan = readTodaysPlan('2026-01-01')
    expect(plan.mission?.holdId).toBe('basecamp')
    expect(plan.mission?.missionId).toBe('B1')
  })
})

describe('tomorrowsMission', () => {
  it('returns the next mission within the same hold when there is one', () => {
    const plan = { day: '2026-01-08', mission: { holdId: 'basecamp', missionId: 'B1', title: 'x' }, choices: [], allDone: false }
    const next = tomorrowsMission(plan, LESSON_LIST)
    expect(next?.holdId).toBe('basecamp')
    expect(next?.missionId).toBe('B2')
  })

  it('crosses into the first mission of the next hold once the current hold runs out', () => {
    const plan = { day: '2026-01-08', mission: { holdId: 'basecamp', missionId: 'B5', title: 'x' }, choices: [], allDone: false }
    const next = tomorrowsMission(plan, LESSON_LIST)
    expect(next?.holdId).toBe('daisy')
    expect(next?.missionId).toBe('D1')
  })

  it('is undefined once there is no plan mission at all (every hold mastered)', () => {
    const plan = { day: '2026-01-08', choices: [], allDone: true }
    expect(tomorrowsMission(plan, LESSON_LIST)).toBeUndefined()
  })
})

describe('cubeStatusText', () => {
  it('covers every state, with a single choice (the old wording)', () => {
    expect(cubeStatusText({ day: 'd', choices: [], allDone: true }, 'Nora')).toContain('mastered')
    expect(
      cubeStatusText(
        { day: 'd', mission: { holdId: 'h', missionId: 'm', title: 't', doneAt: 1 }, choices: [{ holdId: 'h', missionId: 'm', title: 't' }], starEarned: { holdId: 'h', missionId: 'm', title: 't', doneAt: 1 }, allDone: false },
        'Nora',
      ),
    ).toBe('Done today ✅')
    expect(
      cubeStatusText(
        {
          day: 'd',
          warmup: { holdId: 'h', missionId: 'm', title: 't' },
          mission: { holdId: 'h2', missionId: 'm2', title: 't2' },
          choices: [{ holdId: 'h2', missionId: 'm2', title: 't2' }],
          allDone: false,
        },
        'Nora',
      ),
    ).toBe('▶ Warm-up + 1 new mission')
    expect(
      cubeStatusText(
        { day: 'd', mission: { holdId: 'h', missionId: 'm', title: 't' }, choices: [{ holdId: 'h', missionId: 'm', title: 't' }], allDone: false },
        'Nora',
      ),
    ).toBe('▶ 1 new mission')
  })

  it('offers "pick 1 of N" once there is more than one choice', () => {
    const choices = [
      { holdId: 'basecamp', missionId: 'B1', title: 't' },
      { holdId: 'gymA', missionId: 'G1', title: 'g' },
      { holdId: 'patterns', missionId: 'PL1', title: 'p' },
    ]
    expect(cubeStatusText({ day: 'd', mission: choices[0], choices, allDone: false }, 'Nora')).toBe('▶ Pick 1 of 3')
    expect(
      cubeStatusText(
        { day: 'd', warmup: { holdId: 'h', missionId: 'm', title: 't' }, mission: choices[0], choices, allDone: false },
        'Nora',
      ),
    ).toBe('▶ Warm-up + pick 1 of 3')
  })

  it('reads "Done today" off starEarned, not off mission.doneAt directly', () => {
    const choices = [{ holdId: 'gymA', missionId: 'G1', title: 'g' }]
    expect(
      cubeStatusText(
        { day: 'd', mission: { holdId: 'basecamp', missionId: 'B1', title: 't' }, choices, starEarned: { holdId: 'gymA', missionId: 'G1', title: 'g', doneAt: 1 }, allDone: false },
        'Nora',
      ),
    ).toBe('Done today ✅')
  })
})

describe('ensureTodaysPlan', () => {
  it('persists the plan once and holds it stable through the day, even as her progress moves on', () => {
    const first = ensureTodaysPlan('2026-01-08')
    expect(first.mission?.missionId).toBe('B1')
    expect(getDoc().profiles.kid.cubeDay?.day).toBe('2026-01-08')

    // She now completes B1 - the real "first open mission" moves to B2 - but
    // the frozen plan should still be the one persisted this morning.
    completeMission('kid', 'basecamp', 'B1', 'none', 1)
    const second = ensureTodaysPlan('2026-01-08')
    expect(second.mission?.holdId).toBe('basecamp')
    expect(second.mission?.missionId).toBe('B1')
    // ...and since B1 was the planned mission, completing it stamped doneAt.
    expect(second.mission?.doneAt).toBeGreaterThan(0)
  })

  it('re-derives the plan on a new local day', () => {
    ensureTodaysPlan('2026-01-08')
    const tomorrow = ensureTodaysPlan('2026-01-09')
    expect(getDoc().profiles.kid.cubeDay?.day).toBe('2026-01-09')
    expect(tomorrow.mission?.missionId).toBe('B1')
  })

  it('re-derives an already-done planned mission if it was completed some other way (e.g. mastering the hold directly)', () => {
    ensureTodaysPlan('2026-01-08')
    // Master the whole hold outright, bypassing markDailyMissionDone entirely.
    update('profiles', (profiles) => ({
      ...profiles,
      kid: { ...profiles.kid, holds: { ...profiles.kid.holds, basecamp: hold({}, Date.now()) } },
    }))
    const plan = ensureTodaysPlan('2026-01-08')
    expect(plan.mission?.holdId).toBe('daisy')
    expect(plan.mission?.missionId).toBe('D1')
  })
})
