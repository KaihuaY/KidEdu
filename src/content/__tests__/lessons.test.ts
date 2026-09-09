import { describe, expect, it } from 'vitest'
import { SOLVED, applyAlg, invertAlg, isSolved, parseAlg } from '../../engine/cube'
import { CENTER_INDICES, CORNER_FACELETS, EDGE_FACELETS } from '../../engine/pieces'
import { NAMED_ALGS, namedAlg } from '../../engine/notation'
import { isPhaseDone } from '../../engine/solver'
import { yellowCrossShape } from '../../engine/progress'

// Mirrors MissionPlayer's MAX_FOLLOW_ALONG_MOVES (kept as a plain number
// here rather than imported, since this test runs under vitest's 'node'
// environment and MissionPlayer.tsx pulls in DOM-dependent components).
const MAX_FOLLOW_ALONG_MOVES = 8
import {
  ALL_MISSION_IDS,
  HOLD_ORDER,
  LEARN_STICKERINGS,
  LESSON_LIST,
  LESSONS,
  ORIENTATION_RITUAL,
  checkpointState,
  holdForPhase,
  learnCardEndState,
  learnCardState,
  lessonById,
  missionById,
  missionCheckState,
  nextHoldId,
  nextMissionId,
  type HoldId,
  type LearnCard,
  type Mission,
  type MissionStep,
  type PhaseId,
} from '../lessons'

const NAMED_ALG_IDS = new Set(NAMED_ALGS.map((a) => a.id))
const PHASE_IDS: PhaseId[] = [
  'daisy',
  'cross',
  'corners',
  'middle',
  'yellowCross',
  'yellowEdges',
  'cornerPosition',
  'cornerOrient',
]
/** MoveArrows only offers these ten moves - no B. */
const MOVE_ARROWS_MOVES = new Set(['R', "R'", 'L', "L'", 'U', "U'", 'F', "F'", 'D', "D'"])

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('hold structure', () => {
  it('has exactly the 10 documented holds, numbered 0-9 in wall order', () => {
    expect(HOLD_ORDER).toEqual([
      'basecamp',
      'daisy',
      'cross',
      'cornerFind',
      'corners',
      'middle',
      'yellowCross',
      'yellowEdges',
      'cornerPosition',
      'cornerOrient',
    ])
    expect(LESSON_LIST).toHaveLength(10)
    LESSON_LIST.forEach((lesson, i) => {
      expect(lesson.id).toBe(HOLD_ORDER[i])
      expect(lesson.number).toBe(i)
    })
  })

  it('every hold has non-empty copy and 2-5 missions', () => {
    for (const lesson of LESSON_LIST) {
      expect(lesson.title.length).toBeGreaterThan(0)
      expect(lesson.goal.length).toBeGreaterThan(0)
      expect(lesson.story.length).toBeGreaterThan(0)
      expect(lesson.realCubeHint.length).toBeGreaterThan(0)
      expect(lesson.missions.length, lesson.id).toBeGreaterThanOrEqual(2)
      expect(lesson.missions.length, lesson.id).toBeLessThanOrEqual(5)
    }
  })

  it('every namedAlgId referenced anywhere (hold-level, step-level, or nested inside a pick) exists in NAMED_ALGS', () => {
    for (const lesson of LESSON_LIST) {
      for (const id of lesson.namedAlgIds) {
        expect(NAMED_ALG_IDS.has(id), `${lesson.id}: ${id}`).toBe(true)
      }
      for (const mission of lesson.missions) {
        walkSteps(mission.steps, (step) => {
          if (step.kind === 'do' && step.namedAlgId) {
            expect(NAMED_ALG_IDS.has(step.namedAlgId), `${lesson.id}/${mission.id}: ${step.namedAlgId}`).toBe(true)
          }
        })
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Mission structure
// ---------------------------------------------------------------------------

/** Walks a step list, descending into a pick's options' `then` lists (one level - the content model nests no deeper). */
function walkSteps(steps: MissionStep[], visit: (step: MissionStep) => void): void {
  for (const step of steps) {
    visit(step)
    if (step.kind === 'pick') {
      for (const option of step.options) walkSteps(option.then, visit)
    }
  }
}

function allDisplays(mission: Mission): { setupAlg: string; alg: string }[] {
  const out: { setupAlg: string; alg: string }[] = []
  if (mission.look.display) out.push(mission.look.display)
  walkSteps(mission.steps, (step) => {
    if (step.kind === 'do' && step.display) out.push(step.display)
    if (step.kind === 'pick') {
      for (const option of step.options) out.push(option.display)
    }
  })
  if (mission.check.display) out.push(mission.check.display)
  return out
}

describe('mission structure', () => {
  it('the frozen mission id list matches exactly (these are progress keys - never renumber)', () => {
    expect(ALL_MISSION_IDS).toEqual([
      'B1', 'B2', 'B3', 'B4', 'B5',
      'D1', 'D2', 'D3', 'D4',
      'C1', 'C2', 'C3',
      'K1', 'K2',
      'E1', 'E2', 'E3',
      'M1', 'M2', 'M3', 'M4',
      'Y1', 'Y2',
      'YE1', 'YE2',
      'P1', 'P2',
      'S1', 'S2',
    ])
  })

  it('mission ids are unique across the whole curriculum', () => {
    expect(new Set(ALL_MISSION_IDS).size).toBe(ALL_MISSION_IDS.length)
  })

  it('every mission has 1-4 top-level steps (a pick counts as one) and 3-6 estimated minutes', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        const where = `${lesson.id}/${mission.id}`
        expect(mission.steps.length, where).toBeGreaterThanOrEqual(1)
        expect(mission.steps.length, where).toBeLessThanOrEqual(4)
        expect(mission.estimatedMinutes, where).toBeGreaterThanOrEqual(3)
        expect(mission.estimatedMinutes, where).toBeLessThanOrEqual(6)
        expect(mission.title.length, where).toBeGreaterThan(0)
        expect(mission.look.title.length, where).toBeGreaterThan(0)
        expect(mission.look.text.length, where).toBeGreaterThan(0)
        expect(mission.look.say.length, where).toBeGreaterThan(0)
        expect(mission.check.text.length, where).toBeGreaterThan(0)
        expect(mission.check.say.length, where).toBeGreaterThan(0)
        walkSteps(mission.steps, (step) => {
          if (step.kind === 'do') {
            expect(step.title.length, where).toBeGreaterThan(0)
            expect(step.text.length, where).toBeGreaterThan(0)
            expect(step.say.length, where).toBeGreaterThan(0)
          } else if (step.kind === 'practice') {
            expect(step.prompt.length, where).toBeGreaterThan(0)
            expect(step.say.length, where).toBeGreaterThan(0)
            expect(step.sequence.length, where).toBeGreaterThan(0)
          } else {
            expect(step.title.length, where).toBeGreaterThan(0)
            expect(step.text.length, where).toBeGreaterThan(0)
            expect(step.say.length, where).toBeGreaterThan(0)
          }
        })
      }
    }
  })

  it('every pick step offers 2-3 options, each with a label, a still display, and a non-empty `then`', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        const where = `${lesson.id}/${mission.id}`
        walkSteps(mission.steps, (step) => {
          if (step.kind !== 'pick') return
          expect(step.title.length, where).toBeGreaterThan(0)
          expect(step.text.length, where).toBeGreaterThan(0)
          expect(step.say.length, where).toBeGreaterThan(0)
          expect(step.options.length, where).toBeGreaterThanOrEqual(2)
          expect(step.options.length, where).toBeLessThanOrEqual(3)
          for (const option of step.options) {
            expect(option.label.length, where).toBeGreaterThan(0)
            expect(option.display.alg, `${where}: option "${option.label}" display should be a still`).toBe('')
            expect(option.then.length, `${where}: option "${option.label}"`).toBeGreaterThan(0)
          }
        })
      }
    }
  })

  it('every display setupAlg and alg applies without throwing, and carries the z2 prefix', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        for (const display of allDisplays(mission)) {
          const where = `${lesson.id}/${mission.id}`
          expect(() => applyAlg(SOLVED, display.setupAlg), where).not.toThrow()
          expect(() => applyAlg(SOLVED, display.alg), where).not.toThrow()
          expect(display.setupAlg.startsWith('z2'), where).toBe(true)
        }
      }
    }
  })

  it('every stickering used (including inside a pick option) is a real cubing.js preset', () => {
    const allowed = new Set<string>(LEARN_STICKERINGS)
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        const where = `${lesson.id}/${mission.id}`
        if (mission.look.stickering) expect(allowed.has(mission.look.stickering), where).toBe(true)
        if (mission.check.stickering) expect(allowed.has(mission.check.stickering), where).toBe(true)
        walkSteps(mission.steps, (step) => {
          if (step.kind === 'do' && step.stickering) {
            expect(allowed.has(step.stickering), where).toBe(true)
          }
          if (step.kind === 'pick') {
            for (const option of step.options) {
              if (option.stickering) expect(allowed.has(option.stickering), where).toBe(true)
            }
          }
        })
      }
    }
  })

  it('every practice sequence only uses moves MoveArrows offers (no B) - doubles (U2) are tapped twice, expandDoubles-style', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        const where = `${lesson.id}/${mission.id}`
        walkSteps(mission.steps, (step) => {
          if (step.kind !== 'practice') return
          const sequences = step.sequences && step.sequences.length > 0 ? step.sequences : [step.sequence]
          for (const seq of sequences) {
            for (const token of seq.trim().split(/\s+/)) {
              const base = token.endsWith('2') ? token.slice(0, -1) : token
              expect(MOVE_ARROWS_MOVES.has(base), `${where}: ${token}`).toBe(true)
            }
          }
        })
      }
    }
  })

  it('a do-step longer than MAX_FOLLOW_ALONG_MOVES is always explicitly marked followAlong: false - MissionPlayer renders anything over that watch-only, so content must own the call, not lean on the fallback', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        const where = `${lesson.id}/${mission.id}`
        walkSteps(mission.steps, (step) => {
          if (step.kind !== 'do' || !step.display) return
          const moves = parseAlg(step.display.alg).length
          const ok = moves <= MAX_FOLLOW_ALONG_MOVES || step.followAlong === false
          expect(ok, `${where}: "${step.title}" has ${moves} moves but followAlong isn't false`).toBe(true)
        })
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Goal checks
// ---------------------------------------------------------------------------

const PHASE_LEVEL_MISSION_IDS = new Set(['D4', 'C3', 'E3', 'M4', 'Y2', 'YE2', 'P2', 'S2'])

describe('mission goals', () => {
  it('goalCheck(SOLVED).done is true for every mission - a fully solved cube always satisfies every mission', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        expect(mission.goalCheck(SOLVED).done, `${lesson.id}/${mission.id}`).toBe(true)
      }
    }
  })

  it("every mission's own check picture passes its own goalCheck", () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        const state = missionCheckState(mission.check)
        expect(mission.goalCheck(state).done, `${lesson.id}/${mission.id}`).toBe(true)
      }
    }
  })

  it('every phase-level mission (isPhaseDone-backed) also reads isPhaseDone true on its check picture', () => {
    for (const id of PHASE_LEVEL_MISSION_IDS) {
      const found = LESSON_LIST.flatMap((l) => l.missions.map((m) => ({ lesson: l, mission: m }))).find(
        (x) => x.mission.id === id,
      )
      expect(found, id).toBeDefined()
      const { lesson, mission } = found!
      expect(mission.goalPhase, id).toBeDefined()
      const state = missionCheckState(mission.check)
      expect(isPhaseDone(state, mission.goalPhase!), `${lesson.id}/${id}`).toBe(true)
    }
  })

  it('missions with a prereqPhase only read done once that earlier phase is genuinely satisfied', () => {
    // D2 (atLeast, no prereq - it is the very first phase, nothing earlier to gate on)
    expect(missionById('daisy', 'D2')!.prereqPhase).toBeUndefined()
    // C1/C2/C3 all gate on daisy being done first
    for (const id of ['C1', 'C2', 'C3']) {
      expect(missionById('cross', id)!.prereqPhase, id).toBe('daisy')
    }
    expect(missionById('corners', 'E1')!.prereqPhase).toBe('cross')
    expect(missionById('middle', 'M2')!.prereqPhase).toBe('corners')
    expect(missionById('yellowCross', 'Y1')!.prereqPhase).toBe('middle')
    expect(missionById('yellowEdges', 'YE1')!.prereqPhase).toBe('yellowCross')
    expect(missionById('cornerPosition', 'P1')!.prereqPhase).toBe('yellowEdges')
    expect(missionById('cornerOrient', 'S2')!.prereqPhase).toBe('cornerPosition')
  })

  it('only missions carrying goalPhase offer scan help; cornerOrient S1 stays self-report (mid-phase checks are unsafe)', () => {
    expect(missionById('cornerOrient', 'S1')!.goalPhase).toBeUndefined()
    expect(missionById('cornerOrient', 'S2')!.goalPhase).toBe('cornerOrient')
    expect(missionById('cornerFind', 'K1')!.goalPhase).toBeUndefined()
    expect(missionById('cornerFind', 'K2')!.goalPhase).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// missionById / nextMissionId / holdForPhase / nextHoldId
// ---------------------------------------------------------------------------

describe('mission navigation helpers', () => {
  it('missionById finds every mission by hold + mission id', () => {
    for (const lesson of LESSON_LIST) {
      for (const mission of lesson.missions) {
        expect(missionById(lesson.id, mission.id)).toBe(mission)
      }
    }
    expect(missionById('daisy', 'nope')).toBeUndefined()
    expect(missionById('nope', 'D1')).toBeUndefined()
  })

  it('nextMissionId walks in order and returns undefined after the last mission', () => {
    const daisyLesson = lessonById('daisy')!
    expect(nextMissionId(daisyLesson, 'D1')).toBe('D2')
    expect(nextMissionId(daisyLesson, 'D2')).toBe('D3')
    expect(nextMissionId(daisyLesson, 'D3')).toBe('D4')
    expect(nextMissionId(daisyLesson, 'D4')).toBeUndefined()
  })

  it('holdForPhase returns a hold whose phaseIds include the phase, for every solver phase', () => {
    for (const phase of PHASE_IDS) {
      const hold = holdForPhase(phase)
      expect(hold, phase).toBeDefined()
      expect(hold!.phaseIds).toContain(phase)
    }
    expect(holdForPhase('daisy')?.id).toBe('daisy')
    expect(holdForPhase('cross')?.id).toBe('cross')
    expect(holdForPhase('corners')?.id).toBe('corners')
    expect(LESSONS.cornerFind.phaseIds).toEqual([])
  })

  it('nextHoldId walks the wall in order', () => {
    expect(nextHoldId('basecamp')).toBe('daisy')
    expect(nextHoldId('cornerOrient')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The orientation ritual
// ---------------------------------------------------------------------------

describe('orientation ritual', () => {
  it('card 1: the centre stickers never move while the demo alg plays', () => {
    const [card1] = ORIENTATION_RITUAL
    const before = learnCardState(card1)
    const after = learnCardEndState(card1)
    for (const i of CENTER_INDICES) {
      expect(after[i], `centre ${i}`).toBe(before[i])
    }
  })

  it('card 2: ends with yellow on top and green facing front, and has a confirm label', () => {
    const [, card2] = ORIENTATION_RITUAL
    const after = learnCardEndState(card2)
    expect(after[4]).toBe('U')
    expect(after[22]).toBe('F')
    expect(card2.confirmLabel).toBe('Yellow is on top, green faces me ✅')
  })

  it('both ritual cards have non-empty copy and a valid display', () => {
    for (const card of ORIENTATION_RITUAL) {
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.text.length).toBeGreaterThan(0)
      expect(card.say.length).toBeGreaterThan(0)
      expect(() => learnCardState(card)).not.toThrow()
      expect(() => learnCardEndState(card)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// Checkpoints - "before you start this hold, your cube should look like X"
// (unchanged in shape from the old stage-based curriculum)
// ---------------------------------------------------------------------------

describe('checkpoints', () => {
  const HOLDS_WITH_CHECKPOINT: HoldId[] = [
    'cross',
    'cornerFind',
    'corners',
    'middle',
    'yellowCross',
    'yellowEdges',
    'cornerPosition',
    'cornerOrient',
  ]

  it('every hold except Base Camp and The Daisy Ledge has a checkpoint; those two do not', () => {
    for (const id of HOLDS_WITH_CHECKPOINT) {
      expect(LESSONS[id].checkpoint, id).toBeDefined()
    }
    expect(LESSONS.basecamp.checkpoint).toBeUndefined()
    expect(LESSONS.daisy.checkpoint).toBeUndefined()
  })

  it('every checkpoint has non-empty look/hold/say text and (when present) a fallback earlier in wall order', () => {
    for (const lesson of LESSON_LIST) {
      const cp = lesson.checkpoint
      if (!cp) continue
      expect(cp.look.length, lesson.id).toBeGreaterThan(0)
      expect(cp.hold.length, lesson.id).toBeGreaterThan(0)
      expect(cp.say.length, lesson.id).toBeGreaterThan(0)
      if (cp.fallbackHoldId) {
        const fallbackIndex = HOLD_ORDER.indexOf(cp.fallbackHoldId)
        const ownIndex = HOLD_ORDER.indexOf(lesson.id)
        expect(fallbackIndex, lesson.id).toBeGreaterThanOrEqual(0)
        expect(fallbackIndex, lesson.id).toBeLessThan(ownIndex)
      }
    }
  })

  it('every checkpoint display alg and setupAlg applies without throwing, and stickering is a real preset', () => {
    const allowed = new Set<string>(LEARN_STICKERINGS)
    for (const lesson of LESSON_LIST) {
      const cp = lesson.checkpoint
      if (!cp?.display) continue
      expect(() => applyAlg(SOLVED, cp.display!.setupAlg)).not.toThrow()
      expect(() => applyAlg(SOLVED, cp.display!.alg)).not.toThrow()
      expect(() => checkpointState(cp)).not.toThrow()
      expect(cp.display.setupAlg.startsWith('z2'), lesson.id).toBe(true)
      if (cp.stickering) expect(allowed.has(cp.stickering), `${lesson.id}: ${cp.stickering}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Case assertions against the engine, in Nora's frame (yellow up, green
// front => engine letters U=yellow, R=orange, F=green, D=white, L=red,
// B=blue). If one of these fails, the picture on screen is lying to a
// seven year old, so it is worth being fussy.
// ---------------------------------------------------------------------------

/**
 * Every Look/Do card in a hold, including cards nested inside a pick
 * option's `then` (a shared options array like PETAL_OPTIONS can be
 * referenced by more than one mission in the same hold, e.g. D2 and D3, so
 * this dedupes by object identity rather than collecting duplicates).
 */
function missionCards(id: HoldId): LearnCard[] {
  const out = new Set<LearnCard>()
  for (const m of LESSONS[id].missions) {
    out.add(m.look)
    walkSteps(m.steps, (s) => {
      if (s.kind === 'do') out.add(s)
    })
  }
  return [...out]
}

/** The one card in a hold (across every mission's look + do-steps) whose title starts with `titleStartsWith`. */
function card(id: HoldId, titleStartsWith: string): LearnCard {
  const found = missionCards(id).filter((c) => c.title.startsWith(titleStartsWith))
  expect(found, `${id}: no unique card titled "${titleStartsWith}"`).toHaveLength(1)
  return found[0]
}

const U_EDGE_SLOTS = [0, 1, 2, 3] // UR, UF, UL, UB

/** Letters of the piece sitting in an edge slot, orientation-reference facelet first. */
function edgePiece(state: string, slot: number): string[] {
  return EDGE_FACELETS[slot].map((i) => state[i])
}
function cornerPiece(state: string, slot: number): string[] {
  return CORNER_FACELETS[slot].map((i) => state[i])
}
function sameSet(a: string[], b: string[]): boolean {
  return [...a].sort().join('') === [...b].sort().join('')
}
/** How many of the four top edges show white (i.e. are daisy petals). */
function petalCount(state: string): number {
  return U_EDGE_SLOTS.filter((slot) => state[EDGE_FACELETS[slot][0]] === 'D').length
}

describe('Base Camp move cards', () => {
  it('animates one single move per move card, straight from a solved cube', () => {
    for (const move of ['R', "R'", 'U', "U'", 'F', 'D', 'L']) {
      const c = missionCards('basecamp').find((x) => x.display?.alg === move)
      expect(c, `no Base Camp card animating ${move}`).toBeDefined()
      expect(learnCardState(c!)).toBe(SOLVED)
      expect(learnCardEndState(c!)).toBe(applyAlg(SOLVED, move))
    }
  })

  it("B2's practice round-trips R then R' back to solved", () => {
    const b2 = missionById('basecamp', 'B2')!
    const practice = b2.steps.find((s) => s.kind === 'practice')
    expect(practice).toBeDefined()
    expect(isSolved(applyAlg(SOLVED, (practice as { sequence: string }).sequence))).toBe(true)
  })
})

describe('The Daisy Ledge Learn cases', () => {
  it('D2/D4 look cards start from a real daisy or a growing one', () => {
    const c = card('daisy', 'Grow a daisy')
    expect(petalCount(learnCardState(c))).toBe(4)
  })

  it('case (a): a white edge on the bottom, white facing DOWN, in the wrong slot', () => {
    const c = card('daisy', 'A white edge on the bottom')
    const state = learnCardState(c)
    const DF = 5
    expect(state[EDGE_FACELETS[DF][0]]).toBe('D')
    expect(edgePiece(state, DF)).toContain('D')
    expect(sameSet(edgePiece(state, DF), ['D', 'F'])).toBe(false)
    expect(petalCount(state)).toBe(3)
    expect(petalCount(learnCardEndState(c))).toBe(4)
  })

  it('case (b): a white edge stranded in the middle row, lifted by one side turn', () => {
    const c = card('daisy', 'A white edge in the middle row')
    const state = learnCardState(c)
    const FR = 8
    expect(edgePiece(state, FR)).toContain('D')
    expect(state[EDGE_FACELETS[FR][0]]).toBe('D')
    expect(petalCount(state)).toBe(3)
    expect(petalCount(learnCardEndState(c))).toBe(4)
    expect(c.text).toContain('turn the TOP first')
  })

  it('case (c): a white edge on top with white pointing at Nora, not up', () => {
    const c = card('daisy', 'White is pointing sideways')
    const state = learnCardState(c)
    const UF = 1
    expect(edgePiece(state, UF)).toContain('D')
    expect(state[EDGE_FACELETS[UF][0]]).not.toBe('D')
    expect(state[EDGE_FACELETS[UF][1]]).toBe('D')
    expect(petalCount(state)).toBe(2)
    expect(petalCount(learnCardEndState(c))).toBe(3)
  })

  it('the "count your petals" card shows a complete, four-petal daisy', () => {
    const c = card('daisy', 'Count your petals')
    expect(petalCount(learnCardState(c))).toBe(4)
  })

  it('D3\'s "Count as you go" shows one real petal at the front, then turns the RIGHT side to bring up a second - not the invisible back', () => {
    const c = card('daisy', 'Count as you go')
    const before = learnCardState(c)
    expect(petalCount(before)).toBe(1)
    expect(c.display?.alg).toBe('R2')
    const after = learnCardEndState(c)
    expect(petalCount(after)).toBe(2)
  })
})

describe('The White Cross Bridge Learn cases', () => {
  it('checkpoint: a complete daisy sends her back here if missing', () => {
    expect(LESSONS.cross.checkpoint?.fallbackHoldId).toBe('daisy')
    expect(petalCount(checkpointState(LESSONS.cross.checkpoint!))).toBe(4)
  })

  it('"Pick one petal" starts from a complete daisy', () => {
    const c = card('cross', 'Pick one petal')
    expect(petalCount(learnCardState(c))).toBe(4)
  })

  it('"Line it up" starts misaligned and ends with the front petal matching the front centre', () => {
    const c = card('cross', 'Line it up')
    const before = learnCardState(c)
    const UF = 1
    expect(before[EDGE_FACELETS[UF][0]]).toBe('D')
    expect(before[EDGE_FACELETS[UF][1]]).not.toBe(before[22])
    const after = learnCardEndState(c)
    expect(after[EDGE_FACELETS[UF][1]]).toBe(after[22])
  })

  it('"Turn that side twice" tucks the aligned front petal down into the cross, matching', () => {
    const c = card('cross', 'Turn that side twice')
    const before = learnCardState(c)
    const UF = 1
    expect(before[EDGE_FACELETS[UF][0]]).toBe('D')
    expect(before[EDGE_FACELETS[UF][1]]).toBe(before[22])
    const after = learnCardEndState(c)
    expect(after[EDGE_FACELETS[5][0]]).toBe('D') // DF slot solved
    expect(petalCount(after)).toBe(3)
  })
})

describe('Corner Lookout Learn cases', () => {
  it('checkpoint: a solved white cross with matching T shapes sends her back to the Bridge if missing', () => {
    expect(LESSONS.cornerFind.checkpoint?.fallbackHoldId).toBe('cross')
  })

  it('carries no named tricks - this hold is pure looking, not a new alg', () => {
    expect(LESSONS.cornerFind.namedAlgIds).toEqual([])
  })

  it('"Where is home?" shows a corner parked one Elevator from home', () => {
    const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"
    const c = card('cornerFind', 'Where is home?')
    const state = learnCardState(c)
    expect(isSolved(applyAlg(state, ELEVATOR))).toBe(true)
  })

  it('"Park it above home" starts misparked and ends parked (one Elevator away from solved)', () => {
    const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"
    const c = card('cornerFind', 'Park it above home')
    const before = learnCardState(c)
    expect(isSolved(applyAlg(before, ELEVATOR))).toBe(false)
    const after = learnCardEndState(c)
    expect(isSolved(applyAlg(after, ELEVATOR))).toBe(true)
  })

  it('"Where is home?" is a still (no animation, no follow-along) - she has not learned the Elevator yet', () => {
    const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"
    const c = card('cornerFind', 'Where is home?')
    expect(c.display?.alg).toBe('')
    expect((c as { followAlong?: boolean }).followAlong).toBe(false)
    expect(isSolved(applyAlg(learnCardState(c), ELEVATOR))).toBe(true)
  })

  it('K2\'s "Hold home at the front-right" step animates one top turn that parks the corner right above its home', () => {
    const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"
    const c = card('cornerFind', 'Hold home at the front-right')
    const after = learnCardEndState(c)
    expect(after).toBe(applyAlg(SOLVED, invertAlg(ELEVATOR)))
  })
})

describe('Corner Crack Learn cases', () => {
  const URF = 0
  const DFR = 4
  const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"

  it('checkpoint: cross solved, sends her back to Corner Lookout if missing', () => {
    expect(LESSONS.corners.checkpoint?.fallbackHoldId).toBe('cornerFind')
  })

  it('case (a): "Ready to ride" - the white corner sits in the top layer directly above its own slot', () => {
    const c = card('corners', 'Ready to ride')
    const state = learnCardState(c)
    expect(sameSet(cornerPiece(state, URF), ['D', 'F', 'R'])).toBe(true)
    expect(state[CORNER_FACELETS[URF][0]]).not.toBe('D')
    expect(isSolved(applyAlg(state, ELEVATOR))).toBe(true)
  })

  it('case (b), offered in E3\'s picker: a white corner in the bottom, twisted, that one ride pops back on top', () => {
    const c = card('corners', 'Pop it back up first')
    const state = learnCardState(c)
    expect(sameSet(cornerPiece(state, DFR), ['D', 'F', 'R'])).toBe(true)
    expect(state[CORNER_FACELETS[DFR][0]]).not.toBe('D')
    const after = learnCardEndState(c)
    expect(sameSet(cornerPiece(after, URF), ['D', 'F', 'R'])).toBe(true)
  })

  it('E1 opens with a single, followed-along Elevator ride (4 moves), then a watch-only "sometimes three rides" card', () => {
    const oneRide = card('corners', 'One Elevator ride')
    expect(parseAlg(oneRide.display?.alg ?? '')).toHaveLength(4)
    expect((oneRide as { followAlong?: boolean }).followAlong).not.toBe(false)

    const threeRides = card('corners', 'Sometimes it takes three rides')
    expect(parseAlg(threeRides.display?.alg ?? '').length).toBeGreaterThan(MAX_FOLLOW_ALONG_MOVES)
    expect((threeRides as { followAlong?: boolean }).followAlong).toBe(false)
  })

  it('E2 rides the plain Elevator again on a fresh corner, held front-right', () => {
    const c = card('corners', 'Same trick, new corner')
    const state = learnCardState(c)
    expect(sameSet(cornerPiece(state, URF), ['D', 'F', 'R'])).toBe(true)
    expect(state[CORNER_FACELETS[URF][0]]).not.toBe('D')
    expect(isSolved(applyAlg(state, ELEVATOR))).toBe(true)
  })
})

describe('Middle Traverse', () => {
  const UF = 1

  it('checkpoint: whole bottom layer solved, top messy, sends her back to Corner Crack if missing', () => {
    expect(LESSONS.middle.checkpoint?.fallbackHoldId).toBe('corners')
    const state = checkpointState(LESSONS.middle.checkpoint!)
    expect(state.slice(27, 36)).toBe(SOLVED.slice(27, 36))
  })

  it('the line-up card ends on a no-yellow edge whose front colour matches the front centre', () => {
    const c = card('middle', 'Line it up first')
    const after = learnCardEndState(c)
    expect(edgePiece(after, UF)).not.toContain('U')
    expect(after[EDGE_FACELETS[UF][1]]).toBe(after[22])
  })

  it('Send it Right: front colour matches the front centre, top colour matches the RIGHT centre', () => {
    const c = card('middle', 'Top colour on the RIGHT')
    const state = learnCardState(c)
    expect(edgePiece(state, UF)).not.toContain('U')
    expect(state[EDGE_FACELETS[UF][1]]).toBe(state[22])
    expect(state[EDGE_FACELETS[UF][0]]).toBe(state[13]) // right centre
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('Send it Left: same, but the top colour matches the LEFT centre', () => {
    const c = card('middle', 'Top colour on the LEFT')
    const state = learnCardState(c)
    expect(edgePiece(state, UF)).not.toContain('U')
    expect(state[EDGE_FACELETS[UF][1]]).toBe(state[22])
    expect(state[EDGE_FACELETS[UF][0]]).toBe(state[40]) // left centre
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })

  it('M2/M3 do-steps are the plain Send it Right / Send it Left cases, named and within follow-along range (8 moves)', () => {
    const right = card('middle', 'Send it Right')
    expect((right as { namedAlgId?: string }).namedAlgId).toBe('goRight')
    expect(parseAlg(right.display?.alg ?? '').length).toBeLessThanOrEqual(MAX_FOLLOW_ALONG_MOVES)
    expect(isSolved(learnCardEndState(right))).toBe(true)

    const left = card('middle', 'Send it Left')
    expect((left as { namedAlgId?: string }).namedAlgId).toBe('goLeft')
    expect(parseAlg(left.display?.alg ?? '').length).toBeLessThanOrEqual(MAX_FOLLOW_ALONG_MOVES)
    expect(isSolved(learnCardEndState(left))).toBe(true)
  })
})

describe('Yellow Cross Ridge', () => {
  it('checkpoint: bottom two layers solved, top messy, sends her back to Middle Traverse if missing', () => {
    expect(LESSONS.yellowCross.checkpoint?.fallbackHoldId).toBe('middle')
    const state = checkpointState(LESSONS.yellowCross.checkpoint!)
    expect(isPhaseDone(state, 'middle')).toBe(true)
    expect(isSolved(state)).toBe(false)
  })

  it('Y1 look card shows only a dot on the yellow edges', () => {
    const c = card('yellowCross', 'Dot, L, or line?')
    const [ur, uf, ul, ub] = [state1(c)[5], state1(c)[7], state1(c)[3], state1(c)[1]]
    expect([ur, uf, ul, ub].filter((x) => x === 'U')).toHaveLength(0)
  })

  function state1(c: LearnCard) {
    return learnCardState(c)
  }

  it('the L card shows two yellow edges next to each other, and ends with a full cross', () => {
    const c = card('yellowCross', 'The L')
    const state = state1(c)
    const lit = [5, 7, 3, 1].filter((i) => state[i] === 'U')
    expect(lit).toHaveLength(2)
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })
})

describe('Edge Ledge', () => {
  it('checkpoint: a full yellow cross sends her back to Yellow Cross Ridge if missing', () => {
    expect(LESSONS.yellowEdges.checkpoint?.fallbackHoldId).toBe('yellowCross')
    const state = checkpointState(LESSONS.yellowEdges.checkpoint!)
    expect([5, 7, 3, 1].every((i) => state[i] === 'U')).toBe(true)
  })

  it('"Two matching, across from each other" ends with two matching edges adjacent', () => {
    const c = card('yellowEdges', 'Two matching, across')
    const after = learnCardEndState(c)
    const matches = (['F', 'R', 'B', 'L'] as const).map((face) => {
      const idx = face === 'F' ? 19 : face === 'R' ? 10 : face === 'B' ? 46 : 37
      const centre = face === 'F' ? 22 : face === 'R' ? 13 : face === 'B' ? 49 : 40
      return after[idx] === after[centre]
    })
    expect(matches.filter(Boolean)).toHaveLength(2)
  })
})

describe('Corner Shuffle', () => {
  it('checkpoint: yellow cross with matching edges sends her back to Edge Ledge if missing', () => {
    expect(LESSONS.cornerPosition.checkpoint?.fallbackHoldId).toBe('yellowEdges')
    const state = checkpointState(LESSONS.cornerPosition.checkpoint!)
    expect(isPhaseDone(state, 'yellowEdges')).toBe(true)
  })

  it('"No corner home" card has zero home corners at the start, at least one after', () => {
    const c = card('cornerPosition', 'No corner home')
    const state = learnCardState(c)
    const homeCount = [0, 1, 2, 3].filter((slot) =>
      sameSet(cornerPiece(state, slot), CORNER_FACELETS[slot].map((i) => state[[4, 13, 22, 31, 40, 49][Math.floor(i / 9)]])),
    ).length
    expect(homeCount).toBe(0)
    const after = learnCardEndState(c)
    const homeAfter = [0, 1, 2, 3].filter((slot) =>
      sameSet(cornerPiece(after, slot), CORNER_FACELETS[slot].map((i) => after[[4, 13, 22, 31, 40, 49][Math.floor(i / 9)]])),
    ).length
    expect(homeAfter).toBeGreaterThanOrEqual(1)
  })
})

describe('THE SUMMIT', () => {
  const TWIST = namedAlg('cornerTwist')?.alg ?? "R' D' R D"
  const URF_TOP = CORNER_FACELETS[0][0]
  const ride = (state: string, n: number) => applyAlg(state, Array.from({ length: n }, () => TWIST).join(' '))

  it('checkpoint: every corner home, some twisted, sends her back to Corner Shuffle if missing', () => {
    expect(LESSONS.cornerOrient.checkpoint?.fallbackHoldId).toBe('cornerPosition')
    const state = checkpointState(LESSONS.cornerOrient.checkpoint!)
    expect(isPhaseDone(state, 'cornerPosition')).toBe(true)
    expect(isSolved(state)).toBe(false)
  })

  it('the two-ride card needs exactly two Bottom Elevators to turn that corner yellow-up', () => {
    const c = card('cornerOrient', 'Two rides')
    const state = learnCardState(c)
    expect(state[URF_TOP]).not.toBe('U')
    expect(ride(state, 1)[URF_TOP]).not.toBe('U')
    expect(ride(state, 2)[URF_TOP]).toBe('U')
    expect(learnCardEndState(c)[URF_TOP]).toBe('U')
  })

  it('the four-ride card needs exactly four - two is not enough - and, at 16 moves, is watch-only', () => {
    const c = card('cornerOrient', 'Sometimes it takes four rides')
    const state = learnCardState(c)
    expect(state[URF_TOP]).not.toBe('U')
    expect(ride(state, 2)[URF_TOP]).not.toBe('U')
    expect(ride(state, 4)[URF_TOP]).toBe('U')
    expect(learnCardEndState(c)[URF_TOP]).toBe('U')
    expect(parseAlg(c.display?.alg ?? '').length).toBeGreaterThan(MAX_FOLLOW_ALONG_MOVES)
    expect((c as { followAlong?: boolean }).followAlong).toBe(false)
  })

  it('the last card is one top turn away from a fully solved cube', () => {
    const c = card('cornerOrient', 'One last top turn')
    const state = learnCardState(c)
    expect(isSolved(state)).toBe(false)
    expect([0, 1, 2, 3].every((slot) => state[CORNER_FACELETS[slot][0]] === 'U')).toBe(true)
    expect(isSolved(learnCardEndState(c))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// "Why does this work?" - the six solving tricks each get an intuition-only
// disclosure; Base Camp carries no named tricks, so it has none.
// ---------------------------------------------------------------------------

describe('why cards', () => {
  const SOLVING_TRICK_IDS = ['elevator', 'goRight', 'goLeft', 'yellowCross', 'fish', 'cornerCycle', 'cornerTwist']

  it('every one of the seven solving tricks has a non-empty why.text (>= 60 chars) and why.say', () => {
    for (const id of SOLVING_TRICK_IDS) {
      const trick = namedAlg(id)
      expect(trick, id).toBeDefined()
      expect(trick!.why, id).toBeDefined()
      expect(trick!.why!.text.length, id).toBeGreaterThanOrEqual(60)
      expect(trick!.why!.say.length, id).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Case pickers - "which one looks like yours?" for D2/D3, E3, M4, Y1, YE1.
// ---------------------------------------------------------------------------

describe('case pickers', () => {
  function pickFor(holdId: HoldId, missionId: string) {
    const mission = missionById(holdId, missionId)!
    const pick = mission.steps.find((s) => s.kind === 'pick')
    expect(pick, `${holdId}/${missionId} should have a pick step`).toBeDefined()
    return pick as Extract<MissionStep, { kind: 'pick' }>
  }

  it('D2 and D3 share the same three petal-case options', () => {
    const d2 = pickFor('daisy', 'D2')
    const d3 = pickFor('daisy', 'D3')
    expect(d2.options).toBe(d3.options)
    expect(d2.options.length).toBe(3)
  })

  it('E3 offers "on top" and "stuck downstairs"', () => {
    const pick = pickFor('corners', 'E3')
    expect(pick.options).toHaveLength(2)
    expect(pick.options.some((o) => /on top/i.test(o.label))).toBe(true)
    expect(pick.options.some((o) => /downstairs/i.test(o.label))).toBe(true)
  })

  it('M4 offers "edge on top" and "stuck in the wrong slot"', () => {
    const pick = pickFor('middle', 'M4')
    expect(pick.options).toHaveLength(2)
    expect(pick.options.some((o) => /on top/i.test(o.label))).toBe(true)
    expect(pick.options.some((o) => /wrong middle spot/i.test(o.label))).toBe(true)
  })

  it('Y1 offers dot, L, and line - and the dot option turns into an L after its trick', () => {
    const pick = pickFor('yellowCross', 'Y1')
    expect(pick.options).toHaveLength(3)
    const dotOption = pick.options.find((o) => /dot/i.test(o.label))!
    expect(dotOption).toBeDefined()
    const dotState = applyAlg(SOLVED, dotOption.display.setupAlg.replace(/^z2\s*/, ''))
    expect(yellowCrossShape(dotState)).toBe('dot')
    const dotStep = dotOption.then[0]
    expect(dotStep.kind).toBe('do')
    if (dotStep.kind === 'do') {
      const afterState = applyAlg(dotState, dotStep.display!.alg)
      expect(yellowCrossShape(afterState)).toBe('L')
    }
  })

  it('YE1 offers "next to each other" and "across"', () => {
    const pick = pickFor('yellowEdges', 'YE1')
    expect(pick.options).toHaveLength(2)
    expect(pick.options.some((o) => /next to each other/i.test(o.label))).toBe(true)
    expect(pick.options.some((o) => /across/i.test(o.label))).toBe(true)
  })
})
