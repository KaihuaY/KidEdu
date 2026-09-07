/**
 * CubeClimb curriculum: 8 holds on a climbing wall, bottom to top. Pure data
 * (typed), no React. Screens (Wall.tsx, Lesson.tsx) render this content and
 * track progress against it via src/store/progress.ts.
 *
 * Move/alg strings are validated in __tests__/lessons.test.ts: every alg must
 * parse and apply against the engine's SOLVED state without throwing, every
 * namedAlgId must exist in NAMED_ALGS, and every spot question must have
 * exactly one correct option.
 *
 * --- How a "spot it" / "watch" option's alg maps to what's on screen -------
 * TwistyCube always renders `setupAlg` first, then sits paused there (no
 * demo here presses Play automatically). The house convention (see
 * TwistyCube.tsx and caseDisplay() below) is: pass the alg that WOULD SOLVE
 * the case you want to display. Concretely, for `caseDisplay(X)` the frame
 * shown is `applyAlg(SOLVED, invertAlg(X))` - i.e. "the state X reaches
 * *back* to solved". So:
 *   - to show "solved": X = ''
 *   - to show "the case some trick X solves" (e.g. a popped-out corner just
 *     before doing the Elevator): use X = that trick's alg, unchanged
 *   - to show "the state you get by turning some move M forward from
 *     solved" (e.g. Base Camp's "this is what R looks like"): use
 *     X = invertAlg(M)
 * `spotOptionState()` mirrors this exactly, so tests can check what a
 * learner actually sees.
 */

import { SOLVED, applyAlg, invertAlg } from '../engine/cube'
import { KID_MOVE_NAMES, NAMED_ALGS, namedAlg } from '../engine/notation'
import { STAGE_MINUTES } from '../store/planner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HoldId =
  | 'basecamp'
  | 'cross'
  | 'corners'
  | 'middle'
  | 'yellowCross'
  | 'yellowEdges'
  | 'cornerPosition'
  | 'cornerOrient'

/**
 * Solver phase ids (src/engine/solver, PhaseId type). Kept as a local copy of
 * the string union rather than importing it, so this file doesn't take a
 * hard dependency on the solver module - just on the plain strings, which
 * are part of the agreed spec either way.
 */
export type PhaseId =
  | 'daisy'
  | 'cross'
  | 'corners'
  | 'middle'
  | 'yellowCross'
  | 'yellowEdges'
  | 'cornerPosition'
  | 'cornerOrient'

export const HOLD_ORDER: HoldId[] = [
  'basecamp',
  'cross',
  'corners',
  'middle',
  'yellowCross',
  'yellowEdges',
  'cornerPosition',
  'cornerOrient',
]

export interface LessonDemo {
  title: string
  /** The animated alg, played from `setupAlg`. */
  alg: string
  /** Defaults to 'z2' (see the TwistyCube display convention in TwistyCube.tsx). */
  setupAlg?: string
  stickering?: string
  /** Spoken (via SayIt) narration for this demo. */
  say: string
}

export interface WatchStage {
  demos: LessonDemo[]
  estimatedMinutes: number
}

export interface TryStage {
  prompt: string
  /** The primary move sequence Nora must tap in order. */
  sequence: string
  /** Holds with more than one mini-task (currently just Base Camp) list them all here, in order. */
  sequences?: string[]
  say: string
  estimatedMinutes: number
}

export interface SpotOption {
  label: string
  /** See the file header comment for exactly what this alg means visually. */
  alg: string
  correct: boolean
}

export interface SpotStage {
  question: string
  options: SpotOption[]
  estimatedMinutes: number
}

export interface ClimbStage {
  runs: number
  sequence: string
  estimatedMinutes: number
}

export interface Lesson {
  id: HoldId
  number: number
  title: string
  goal: string
  story: string
  phaseIds: PhaseId[]
  namedAlgIds: string[]
  realCubeHint: string
  stages: {
    watch: WatchStage
    try: TryStage
    spot: SpotStage
    climb: ClimbStage
  }
}

/** The facelet state a spot-quiz (or watch-demo) option actually shows - see file header. */
export function spotOptionState(option: SpotOption): string {
  return applyAlg(SOLVED, invertAlg(option.alg))
}

/** setupAlg/alg pair for TwistyCube to show the case `alg` solves, paused at the case. */
export function caseDisplay(alg: string): { setupAlg: string; alg: string } {
  return { setupAlg: 'z2 ' + invertAlg(alg), alg }
}

/** setupAlg/alg pair for a fully static picture (no case-to-solve narrative, e.g. Base Camp). */
function forwardDisplay(movesFromSolved: string): { setupAlg: string; alg: string } {
  return caseDisplay(invertAlg(movesFromSolved))
}

/** The SpotOption.alg that shows "moves applied forward from solved" (see file header). */
function forwardAlg(movesFromSolved: string): string {
  return invertAlg(movesFromSolved)
}

function demoSay(move: string): string {
  return `This is ${move}: ${KID_MOVE_NAMES[move] ?? move}.`
}

// ---------------------------------------------------------------------------
// Hand-derived cube states, found by breadth-first search over the state
// graph (not kept in the repo - just the resulting short algs below). Each
// is last-layer-only (D face and the bottom two rows of R/F/L/B untouched)
// starting from SOLVED.
// ---------------------------------------------------------------------------

// Yellow Cross Ridge: recognisable yellow patterns on U (see the file header
// for how these turn into "what's shown" - each is the alg that SOLVES the
// named case, i.e. exactly what NAMED_ALGS.yellowCross itself does for real
// L/line cases, plus a two-step sequence for dot).
const YELLOW_CROSS_DOT_ALG = "L' B' U' B U L R' U' F' U F R"
const YELLOW_CROSS_L_ALG = "R' U' F' U F R"
const YELLOW_CROSS_LINE_ALG = "R' F' U' F U R"

// Edge Ledge: which of the 4 yellow-top edges already match the side colour
// next to them (checked against F/R/B/L centres). Each alg below SOLVES the
// case named.
const YELLOW_EDGES_TWO_ADJACENT_ALG = "R U2 R' U' R U' R' U'"
const YELLOW_EDGES_NONE_ALG = "U'"

// ---------------------------------------------------------------------------
// The 8 holds
// ---------------------------------------------------------------------------

const BASECAMP_MOVES = ['R', "R'", 'L', "L'", 'U', "U'", 'F', "F'", 'D', "D'"]

const basecamp: Lesson = {
  id: 'basecamp',
  number: 0,
  title: 'Base Camp',
  goal: 'Know how to turn every side of the cube, both ways, without looking twice.',
  story:
    "Welcome to Base Camp, Nora! Before any climber heads up the wall, they learn to trust their hands. " +
    'Every side of your cube can spin - watch which way each one goes, then give it a try yourself.',
  phaseIds: [],
  namedAlgIds: [],
  realCubeHint:
    'On your real cube: hold it with yellow on top and green facing you. Try each turn slowly and watch the colours move.',
  stages: {
    watch: {
      demos: BASECAMP_MOVES.map((move) => ({
        title: `Move: ${move}`,
        ...forwardDisplay(move),
        say: demoSay(move),
      })),
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: 'Tap each move when you hear its name. Take your time - there is no rush at Base Camp!',
      sequence: BASECAMP_MOVES[0],
      sequences: BASECAMP_MOVES,
      say: 'Tap the move I ask for.',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube shows the Right side (R) turned UP?',
      options: [
        { label: 'Cube A', alg: forwardAlg('R'), correct: true },
        { label: 'Cube B', alg: forwardAlg('L'), correct: false },
        { label: 'Cube C', alg: forwardAlg('U'), correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: 'R U R2 U2',
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const cross: Lesson = {
  id: 'cross',
  number: 1,
  title: 'The Daisy Ledge',
  goal: 'A white cross on the bottom, with each white edge sitting next to its matching side colour.',
  story:
    'Time to grow a daisy! Flip the white edges up next to the yellow center so they look like petals. ' +
    'Once your daisy is perfect, tuck each petal straight down to make a white cross on the bottom.',
  phaseIds: ['daisy', 'cross'],
  namedAlgIds: [],
  realCubeHint:
    'On your real cube: hold it yellow on top, green facing you. Find a white edge piece, spin it up next to the yellow center to make a petal, then match all four petals to make a daisy.',
  stages: {
    watch: {
      demos: [
        {
          title: 'Make a petal',
          ...forwardDisplay('F2'),
          say: 'If a white edge is stuck on the bottom, turn that side twice to bring it up as a petal.',
        },
        {
          title: 'Tuck the petal down',
          ...forwardDisplay('U R2'),
          say: 'Line the petal up above its matching colour, then turn that side twice to tuck it into the cross.',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: 'Practice turning a petal into place.',
      sequence: 'F2',
      say: 'Turn the front side twice to make a petal.',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube is the one that is all the way solved?',
      options: [
        { label: 'Cube A', alg: '', correct: true },
        { label: 'Cube B', alg: forwardAlg('R'), correct: false },
        { label: 'Cube C', alg: forwardAlg('U'), correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: 'F2',
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const cornersNamed = namedAlg('elevator')

const corners: Lesson = {
  id: 'corners',
  number: 2,
  title: 'Corner Crack',
  goal: 'All four white corners tucked into the bottom layer, matching the sides around them.',
  story:
    'Now for the tricky bit - corners! When a white corner is stuck on top, ' +
    'The Elevator trick rides it down into its home. Do it again and again until it clicks into place.',
  phaseIds: ['corners'],
  namedAlgIds: ['elevator'],
  realCubeHint:
    "On your real cube: find a white corner on the top layer, put its home spot below it, and repeat the Elevator (R U R' U') until the white sticker faces down.",
  stages: {
    watch: {
      demos: [
        {
          title: cornersNamed?.kidName ?? 'The Elevator',
          ...caseDisplay(cornersNamed?.alg ?? "R U R' U'"),
          say: cornersNamed?.hint ?? '',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: `Do ${cornersNamed?.kidName ?? 'the Elevator'}!`,
      sequence: cornersNamed?.alg ?? "R U R' U'",
      say: cornersNamed?.hint ?? '',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube has every corner home?',
      options: [
        { label: 'Cube A', alg: '', correct: true },
        { label: 'Cube B', alg: cornersNamed?.alg ?? "R U R' U'", correct: false },
        { label: 'Cube C', alg: forwardAlg('U2'), correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: cornersNamed?.alg ?? "R U R' U'",
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const goRight = namedAlg('goRight')
const goLeft = namedAlg('goLeft')

const middle: Lesson = {
  id: 'middle',
  number: 3,
  title: 'Middle Traverse',
  goal: 'The middle layer edges tucked in next to their matching colours - no yellow anywhere but the top.',
  story:
    "Almost to the yellow layer! Edges stuck on top that don't have any yellow on them belong in the middle row. " +
    'Send it Right if the edge wants to go right, or Send it Left if it wants to go left.',
  phaseIds: ['middle'],
  namedAlgIds: ['goRight', 'goLeft'],
  realCubeHint:
    'On your real cube: find a top edge with no yellow sticker. Look at its front colour and decide - does it slide home to the right or the left?',
  stages: {
    watch: {
      demos: [
        {
          title: goRight?.kidName ?? 'Send it Right',
          ...caseDisplay(goRight?.alg ?? "U R U' R' U' F' U F"),
          say: goRight?.hint ?? '',
        },
        {
          title: goLeft?.kidName ?? 'Send it Left',
          ...caseDisplay(goLeft?.alg ?? "U' L' U L U F U' F'"),
          say: goLeft?.hint ?? '',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: `Try both moves: ${goRight?.kidName ?? 'Send it Right'} and ${goLeft?.kidName ?? 'Send it Left'}.`,
      sequence: goRight?.alg ?? "U R U' R' U' F' U F",
      sequences: [goRight?.alg ?? "U R U' R' U' F' U F", goLeft?.alg ?? "U' L' U L U F U' F'"],
      say: goRight?.hint ?? '',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube has both middle edges home already?',
      options: [
        { label: 'Cube A', alg: goRight?.alg ?? "U R U' R' U' F' U F", correct: false },
        { label: 'Cube B', alg: '', correct: true },
        { label: 'Cube C', alg: goLeft?.alg ?? "U' L' U L U F U' F'", correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: goRight?.alg ?? "U R U' R' U' F' U F",
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const yellowCrossNamed = namedAlg('yellowCross')

const yellowCross: Lesson = {
  id: 'yellowCross',
  number: 4,
  title: 'Yellow Cross Ridge',
  goal: 'A yellow cross on top - four yellow edges pointing out from the yellow center.',
  story:
    'Flip the cube so yellow faces up. Look at the top: is it a dot, an L, or a line? ' +
    'The Yellow Cross trick turns any of those into a full cross. Dot, then L, then line, then cross!',
  phaseIds: ['yellowCross'],
  namedAlgIds: ['yellowCross'],
  realCubeHint:
    "On your real cube: hold the L shape in the top-left, or the line going straight across, then do F R U R' U' F'. Do it again if you still see a dot.",
  stages: {
    watch: {
      demos: [
        {
          title: 'From a line to a cross',
          ...caseDisplay(YELLOW_CROSS_LINE_ALG),
          say: 'A line is two yellow edges across from each other. Do the Yellow Cross trick to finish it.',
        },
        {
          title: 'From an L to a cross',
          ...caseDisplay(YELLOW_CROSS_L_ALG),
          say: 'An L is two yellow edges next to each other, like a bent line. Same trick solves it.',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: `Do ${yellowCrossNamed?.kidName ?? 'the Yellow Cross'} trick!`,
      sequence: yellowCrossNamed?.alg ?? "F R U R' U' F'",
      say: yellowCrossNamed?.hint ?? '',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube has the Yellow L?',
      options: [
        { label: 'Cube A (dot)', alg: YELLOW_CROSS_DOT_ALG, correct: false },
        { label: 'Cube B (L)', alg: YELLOW_CROSS_L_ALG, correct: true },
        { label: 'Cube C (line)', alg: YELLOW_CROSS_LINE_ALG, correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: yellowCrossNamed?.alg ?? "F R U R' U' F'",
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const fish = namedAlg('fish')

const yellowEdges: Lesson = {
  id: 'yellowEdges',
  number: 5,
  title: 'Edge Ledge',
  goal: 'Every yellow-top edge matched up with the side colour next to it (corners can still look messy).',
  story:
    'Your yellow cross is glowing - now line up its edges! Turn the top until two of them match their side colours. ' +
    'If those two are right next to each other, hold them at the back and the right, then do the Fish to fix the rest.',
  phaseIds: ['yellowEdges'],
  namedAlgIds: ['fish'],
  realCubeHint:
    "On your real cube: keep the yellow cross on top. Turn the top layer until two edges match the colour beside them. If they're side by side, put them at the back and right, then do the Fish (R U R' U R U2 R').",
  stages: {
    watch: {
      demos: [
        {
          title: fish?.kidName ?? 'The Fish',
          ...caseDisplay(YELLOW_EDGES_TWO_ADJACENT_ALG),
          say: 'Two matching edges sit next to each other at the back and right. Do the Fish to bring the rest home.',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: `Do ${fish?.kidName ?? 'the Fish'} trick!`,
      sequence: fish?.alg ?? "R U R' U R U2 R'",
      say: fish?.hint ?? '',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube has two matching edges next to each other?',
      options: [
        { label: 'Cube A (two next to each other)', alg: YELLOW_EDGES_TWO_ADJACENT_ALG, correct: true },
        { label: 'Cube B (none match)', alg: YELLOW_EDGES_NONE_ALG, correct: false },
        { label: 'Cube C (all match already)', alg: '', correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: fish?.alg ?? "R U R' U R U2 R'",
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const cornerCycle = namedAlg('cornerCycle')

const cornerPosition: Lesson = {
  id: 'cornerPosition',
  number: 6,
  title: 'Corner Shuffle',
  goal: 'Every corner piece in its own spot around the top layer (colours might still be twisted - that is next).',
  story:
    'So close to the summit! Sometimes the yellow corners are in the wrong spots. ' +
    'Corner Shuffle sends three of them for a walk around the top while one stays home, until every corner belongs where it is. ' +
    "If none of the corners is home yet, do it once anyway and look again.",
  phaseIds: ['cornerPosition'],
  namedAlgIds: ['cornerCycle'],
  realCubeHint:
    'On your real cube: find a corner that is already in the right spot (even if twisted) and hold it at the front-right. Do Corner Shuffle to walk the other three home - repeat once or twice.',
  stages: {
    watch: {
      demos: [
        {
          title: cornerCycle?.kidName ?? 'Corner Shuffle',
          ...caseDisplay(cornerCycle?.alg ?? "U R U' L' U R' U' L"),
          say: cornerCycle?.hint ?? '',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: `Do ${cornerCycle?.kidName ?? 'Corner Shuffle'}!`,
      sequence: cornerCycle?.alg ?? "U R U' L' U R' U' L",
      say: cornerCycle?.hint ?? '',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube has every corner in its own spot (even if some look twisted)?',
      options: [
        { label: 'Cube A', alg: '', correct: true },
        { label: 'Cube B', alg: cornerCycle?.alg ?? "U R U' L' U R' U' L", correct: false },
        { label: 'Cube C', alg: forwardAlg('U2'), correct: false },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: cornerCycle?.alg ?? "U R U' L' U R' U' L",
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

const cornerTwist = namedAlg('cornerTwist')

const cornerOrient: Lesson = {
  id: 'cornerOrient',
  number: 7,
  title: 'THE SUMMIT',
  goal: 'A fully solved cube - every corner twisted the right way, every colour matched. You made it to the top!',
  story:
    "The very last step! Hold a corner that needs fixing at the front-right-top and do the Bottom Elevator - " +
    "2 times or 4 times - until yellow faces up on that corner. The cube will look messy in the middle - that's " +
    'normal! Keep going, it fixes itself. Then turn only the TOP layer to bring the next corner around, and repeat.',
  phaseIds: ['cornerOrient'],
  namedAlgIds: ['cornerTwist'],
  realCubeHint:
    "On your real cube: put a corner that needs twisting at the front-right-top. Do the Bottom Elevator (R' D' R D) 2 or 4 times until it shows yellow on top. Turn ONLY the top layer to bring the next corner to the front-right and repeat - don't turn anything else. When every corner shows yellow on top, you solved the whole cube!",
  stages: {
    watch: {
      demos: [
        {
          title: cornerTwist?.kidName ?? 'Bottom Elevator',
          ...caseDisplay(cornerTwist?.alg ?? "R' D' R D"),
          say: cornerTwist?.hint ?? 'Do the Bottom Elevator until yellow faces up on this corner.',
        },
      ],
      estimatedMinutes: STAGE_MINUTES.watch,
    },
    try: {
      prompt: `Do ${cornerTwist?.kidName ?? 'the Bottom Elevator'}!`,
      sequence: cornerTwist?.alg ?? "R' D' R D",
      say: cornerTwist?.hint ?? 'The middle may look messy while you do this - that is normal!',
      estimatedMinutes: STAGE_MINUTES.try,
    },
    spot: {
      question: 'Which cube is the whole mountain - totally solved?',
      options: [
        { label: 'Cube A', alg: cornerTwist?.alg ?? "R' D' R D", correct: false },
        { label: 'Cube B', alg: forwardAlg("U'"), correct: false },
        { label: 'Cube C', alg: '', correct: true },
      ],
      estimatedMinutes: STAGE_MINUTES.spot,
    },
    climb: {
      runs: 3,
      sequence: cornerTwist?.alg ?? "R' D' R D",
      estimatedMinutes: STAGE_MINUTES.climb,
    },
  },
}

export const LESSONS: Record<HoldId, Lesson> = {
  basecamp,
  cross,
  corners,
  middle,
  yellowCross,
  yellowEdges,
  cornerPosition,
  cornerOrient,
}

export const LESSON_LIST: Lesson[] = HOLD_ORDER.map((id) => LESSONS[id])

export function lessonById(id: string): Lesson | undefined {
  return LESSONS[id as HoldId]
}

export function nextHoldId(id: HoldId): HoldId | undefined {
  const i = HOLD_ORDER.indexOf(id)
  return i >= 0 && i + 1 < HOLD_ORDER.length ? HOLD_ORDER[i + 1] : undefined
}

/** Which hold teaches a given solver phase (Wall/HelpMyCube use this to link a phase back to its hold). */
export function holdForPhase(phase: PhaseId): Lesson | undefined {
  return LESSON_LIST.find((l) => l.phaseIds.includes(phase))
}

/** All namedAlgIds referenced anywhere in the curriculum, for tests. */
export function allNamedAlgIds(): string[] {
  return LESSON_LIST.flatMap((l) => l.namedAlgIds)
}

// Re-exported so screens can go straight to the shared source of truth.
export { NAMED_ALGS }
