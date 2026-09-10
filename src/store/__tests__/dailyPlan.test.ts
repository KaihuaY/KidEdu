import { beforeEach, describe, expect, it } from 'vitest'
import { computePlan, cubeStatusText, ensureTodaysPlan, tomorrowsMission } from '../dailyPlan'
import { completeMission } from '../missions'
import { getDoc, resetAll, update, type HoldProgress, type ProfileProgress } from '../progress'
import { LESSON_LIST } from '../../content/lessons'

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

describe('tomorrowsMission', () => {
  it('returns the next mission within the same hold when there is one', () => {
    const plan = { day: '2026-01-08', mission: { holdId: 'basecamp', missionId: 'B1', title: 'x' }, allDone: false }
    const next = tomorrowsMission(plan, LESSON_LIST)
    expect(next?.holdId).toBe('basecamp')
    expect(next?.missionId).toBe('B2')
  })

  it('crosses into the first mission of the next hold once the current hold runs out', () => {
    const plan = { day: '2026-01-08', mission: { holdId: 'basecamp', missionId: 'B5', title: 'x' }, allDone: false }
    const next = tomorrowsMission(plan, LESSON_LIST)
    expect(next?.holdId).toBe('daisy')
    expect(next?.missionId).toBe('D1')
  })

  it('is undefined once there is no plan mission at all (every hold mastered)', () => {
    const plan = { day: '2026-01-08', allDone: true }
    expect(tomorrowsMission(plan, LESSON_LIST)).toBeUndefined()
  })
})

describe('cubeStatusText', () => {
  it('covers every state', () => {
    expect(cubeStatusText({ day: 'd', allDone: true }, 'Nora')).toContain('mastered')
    expect(cubeStatusText({ day: 'd', mission: { holdId: 'h', missionId: 'm', title: 't', doneAt: 1 }, allDone: false }, 'Nora')).toBe(
      'Done today ✅',
    )
    expect(
      cubeStatusText(
        { day: 'd', warmup: { holdId: 'h', missionId: 'm', title: 't' }, mission: { holdId: 'h2', missionId: 'm2', title: 't2' }, allDone: false },
        'Nora',
      ),
    ).toBe('▶ Warm-up + 1 new mission')
    expect(cubeStatusText({ day: 'd', mission: { holdId: 'h', missionId: 'm', title: 't' }, allDone: false }, 'Nora')).toBe('▶ 1 new mission')
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
