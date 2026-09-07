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

/**
 * One page of the Learn stage: the *method* Nora needs before she can copy a
 * trick - how to hold the cube, how to find the piece, which case calls for
 * which trick, and what to do on her own cube right now.
 *
 * `display` is a raw TwistyCube setupAlg/alg pair (see the file header for the
 * z2 convention). Build it with `learnDisplay(movesFromSolved, alg)` so the
 * paused frame is always `applyAlg(SOLVED, movesFromSolved)` and pressing
 * play animates `alg` from there.
 */
export interface LearnCard {
  title: string
  /** 1-3 short sentences, written straight to Nora. */
  text: string
  /** Spoken (via SayIt) version of the same idea. */
  say: string
  display?: { setupAlg: string; alg: string }
  /** A cubing.js experimentalStickering preset - must be in LEARN_STICKERINGS. */
  stickering?: string
  /** "On your cube: ..." steps she ticks off one by one. */
  checklist?: string[]
  /** Show the mirrored back view too (handy whenever the bottom layer matters). */
  backView?: boolean
}

export interface LearnStage {
  cards: LearnCard[]
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
    learn: LearnStage
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

/**
 * setupAlg/alg pair for a Learn card: pause on the state `movesFromSolved`
 * reaches from solved, then animate `alg` forward from there. Pass `alg: ''`
 * for a still picture.
 */
export function learnDisplay(movesFromSolved: string, alg: string): { setupAlg: string; alg: string } {
  return { setupAlg: ('z2 ' + movesFromSolved).trim(), alg }
}

/** The facelet state a Learn card shows while it is paused. */
export function learnCardState(card: LearnCard): string {
  if (!card.display) return SOLVED
  return applyAlg(SOLVED, card.display.setupAlg.replace(/^z2\s*/, ''))
}

/** The facelet state a Learn card ends on once its alg has played. */
export function learnCardEndState(card: LearnCard): string {
  return applyAlg(learnCardState(card), card.display?.alg ?? '')
}

/**
 * cubing.js `experimentalStickering` presets, read out of
 * node_modules/cubing/dist/lib/cubing/chunks/chunk-WBMKMQAL.js (the
 * `experimentalStickerings` table, ~line 272) - only these names exist, and
 * only the ones listed here are used by Learn cards.
 */
export const LEARN_STICKERINGS = ['full', 'Daisy', 'Cross', 'F2L', 'EOLL', 'ELL', 'CPLL', 'OCLL', 'LL'] as const

/** Same closing card on every hold: the escape hatch to the real-cube solver. */
function helpCard(what: string): LearnCard {
  return {
    title: 'Stuck on your real cube?',
    text: `Stuck on ${what}? No worries! Tap Help with my cube and I'll look at YOUR cube and show you every single move.`,
    say: "If you get stuck on your own cube, tap Help with my cube and I will show you every move.",
  }
}

function demoSay(move: string): string {
  return `Here comes ${move}. It means ${KID_MOVE_NAMES[move] ?? move}.`
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
// Learn-stage cube states.
//
// Every one of these was derived (and is re-checked in
// __tests__/lessons.test.ts) against the engine, in Nora's frame: yellow up,
// green front - i.e. engine letters U=yellow, R=orange, F=green, D=white,
// L=red, B=blue.
// ---------------------------------------------------------------------------

const ELEVATOR = namedAlg('elevator')?.alg ?? "R U R' U'"
const GO_RIGHT = namedAlg('goRight')?.alg ?? "U R U' R' U' F' U F"
const GO_LEFT = namedAlg('goLeft')?.alg ?? "U' L' U L U F U' F'"
const YELLOW_CROSS = namedAlg('yellowCross')?.alg ?? "F R U R' U' F'"
const FISH = namedAlg('fish')?.alg ?? "R U R' U R U2 R'"
const CORNER_SWAP = namedAlg('cornerCycle')?.alg ?? "U R U' L' U R' U' L"
const BOTTOM_ELEVATOR = namedAlg('cornerTwist')?.alg ?? "R' D' R D"

const repeatAlg = (alg: string, times: number): string => Array.from({ length: times }, () => alg).join(' ')

/** Four white edges standing up around the yellow centre (all four petals lined up). */
const DAISY_MOVES = 'F2 R2 B2 L2'
/** Daisy with the front petal knocked back down to the bottom, white facing down. */
const CROSS_CASE_BOTTOM = `${DAISY_MOVES} U F2`
/** Daisy with the right petal pushed out into the middle row, white facing front. */
const CROSS_CASE_MIDDLE = `${DAISY_MOVES} R'`
/** Two petals up, and a third white edge on top with its white sticker facing front. */
const CROSS_CASE_FLIPPED = "R2 B2 L' F"

/** The white corner is home but twisted - one Elevator pops it back onto the top. */
const CORNER_CASE_STUCK = repeatAlg(ELEVATOR, 2)

/** A middle edge is in place but the wrong way round / the wrong piece. */
const MIDDLE_CASE_STUCK = GO_RIGHT

/** Yellow cross cases, in the order Nora meets them: line (1 trick), L (2), dot (3). */
const YC_LINE_FIX = YELLOW_CROSS
const YC_L_FIX = repeatAlg(YELLOW_CROSS, 2)
const YC_DOT_FIX = `${YELLOW_CROSS} U2 ${YELLOW_CROSS} ${YELLOW_CROSS}`

/** Edge Ledge: two matching edges at the BACK and the RIGHT - the Fish plus a top turn finishes it. */
const EDGES_ADJACENT_FIX = `${FISH} U`
/** Edge Ledge: two matching edges opposite each other - one Fish turns it into the adjacent case. */
const EDGES_OPPOSITE_FIX = `${FISH} U' ${FISH} U2`

/** Corner Shuffle with NO corner home yet: the pure corner double-swap (E-perm). */
const CORNERS_NONE_HOME = "x' R U' R' D R U R' D' R U R' D R U' R' D' x"

/** The Summit walkthrough: one corner needs 2 rides, the next needs 4, then one last top turn. */
const SUMMIT_FIX = `${repeatAlg(BOTTOM_ELEVATOR, 2)} U ${repeatAlg(BOTTOM_ELEVATOR, 4)} U'`
const SUMMIT_SETUP = invertAlg(SUMMIT_FIX)

// ---------------------------------------------------------------------------
// The 8 holds
// ---------------------------------------------------------------------------

const BASECAMP_MOVES = ['R', "R'", 'L', "L'", 'U', "U'", 'F', "F'", 'D', "D'"]

const basecamp: Lesson = {
  id: 'basecamp',
  number: 0,
  title: 'Base Camp',
  goal: 'Turn every side, both ways, like a pro. No peeking needed!',
  story:
    "Welcome to Base Camp, Nora! 🏕️ Big climbers warm up their hands first. So let's warm up yours. " +
    "Every side of your cube can spin. Watch which way it goes. Then try it yourself. You've got this!",
  phaseIds: [],
  namedAlgIds: [],
  realCubeHint:
    'On your real cube: hold it with yellow on top and green facing you. Try each turn slowly. Watch the colours move!',
  stages: {
    learn: {
      cards: [
        {
          title: 'Hold it like a climber',
          text: 'Put YELLOW on top and GREEN facing you. Look! White hides underneath. Orange is on your right, red on your left, blue is way at the back.',
          say: 'Hold your cube with yellow on top and green facing you. Keep it that way the whole time.',
          display: learnDisplay('', ''),
          backView: true,
          checklist: [
            'On your cube: turn it so YELLOW is on top',
            'On your cube: turn it so GREEN is facing you',
            'Keep holding it that way - do not spin it around',
          ],
        },
        {
          title: 'What is a side?',
          text: 'A side is one whole face of your cube. Nine little squares! The middle square never moves. It always tells you that side\'s colour.',
          say: 'A side is one whole face - nine squares. The middle square never moves, so it tells you the colour of that side.',
          display: learnDisplay('', ''),
        },
        {
          title: 'R = Right side UP',
          text: 'R means the RIGHT side goes UP, like it is climbing a ladder. Press play and watch! Only the right side moves.',
          say: 'R means right side up.',
          display: learnDisplay('', 'R'),
        },
        {
          title: "R' = Right side DOWN",
          text: "R' means the RIGHT side goes back DOWN. Same side, other way. Easy!",
          say: 'R backwards means right side down.',
          display: learnDisplay('', "R'"),
        },
        {
          title: 'U = Top layer LEFT',
          text: 'U is the top layer, like a hat on the cube. U slides that whole hat to the LEFT.',
          say: 'U means top layer left.',
          display: learnDisplay('', 'U'),
        },
        {
          title: "U' = Top layer RIGHT",
          text: "U' slides the top layer back to the RIGHT. Whoosh, back it goes!",
          say: 'U backwards means top layer right.',
          display: learnDisplay('', "U'"),
        },
        {
          title: 'F = the Front side',
          text: 'F is the side looking right at you, the green one. F spins it like a little steering wheel to the right.',
          say: 'F is the front side. It spins like a steering wheel to the right.',
          display: learnDisplay('', 'F'),
        },
        {
          title: 'D = the Bottom layer',
          text: 'D is the bottom layer. It hides way underneath. Watch the little back picture to catch it moving!',
          say: 'D is the bottom layer, underneath the cube.',
          display: learnDisplay('', 'D'),
          backView: true,
        },
        {
          title: "The little ' means backwards",
          text: "Every letter has a backwards twin. R goes up, R' comes right back down. Do one, then the other. Ta-da! Your cube looks exactly like it started.",
          say: 'The little mark means backwards. R goes up, R backwards comes back down.',
          display: learnDisplay('', "R R'"),
          checklist: [
            'On your cube: do R (right side UP)',
            "On your cube: do R' (right side DOWN)",
            'Look at it - nothing changed! You undid your own move',
          ],
        },
        {
          title: 'y = turn the WHOLE cube',
          text: 'y is not one side. It spins the WHOLE cube, like turning a steering wheel. A new colour swings to the front. Yellow stays on top the whole time.',
          say: 'y turns the whole cube like a steering wheel. A new colour comes to the front and yellow stays on top.',
          display: learnDisplay('', 'y'),
        },
        helpCard('turning your cube'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      question: 'Which cube shows the Right side (R) going UP?',
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
  goal: 'Grow a white cross on the bottom. Each white edge sits next to its matching colour. 🌼',
  story:
    "Time to grow a daisy! 🌼 Flip white edges up next to the yellow centre. Look, petals! " +
    'Once your daisy is perfect, tuck each petal straight down. Ta-da, a white cross!',
  phaseIds: ['daisy', 'cross'],
  namedAlgIds: [],
  realCubeHint:
    'On your real cube: hold it yellow on top, green facing you. Find a white edge piece. Spin it up next to the yellow centre to make a petal. Match all four petals to grow your daisy.',
  stages: {
    learn: {
      cards: [
        {
          title: 'Grow a daisy',
          text: 'Find the YELLOW centre on top. That is the middle of our flower! Four WHITE edges standing up around it are the petals. Four petals means your daisy is done.',
          say: 'Find the yellow centre on top. Four white edges standing around it are the petals of your daisy.',
          display: learnDisplay(DAISY_MOVES, ''),
          stickering: 'Daisy',
        },
        {
          title: 'A white edge on the bottom',
          text: 'Look, a white edge down on the bottom, pointing DOWN. Turn that whole side twice. Whoosh! It flies straight up into a petal.',
          say: 'A white edge on the bottom with white pointing down. Turn that side twice and up it comes.',
          display: learnDisplay(CROSS_CASE_BOTTOM, 'F2'),
        },
        {
          title: 'A white edge in the middle row',
          text: 'This white edge is stuck in the middle row. One turn of that side lifts it right up to the top as a petal. If a petal is already sitting there, turn the TOP first to make room.',
          say: 'A white edge in the middle row. Turn that side once to lift it up. If a petal is in the way, turn the top first.',
          display: learnDisplay(CROSS_CASE_MIDDLE, 'R'),
        },
        {
          title: 'White is pointing sideways',
          text: 'This edge is on top already, but its white sticker looks at YOU, not at the sky. Turn it out, then bring it up the next side. Now white looks up. There it is!',
          say: 'This white edge is on top but pointing sideways. Turn it out, then bring it up the next side.',
          display: learnDisplay(CROSS_CASE_FLIPPED, "F' L'"),
        },
        {
          title: 'Tuck the petals down',
          text: "Daisy done! Look at a petal's OTHER colour. Turn the top until that colour sits above its matching centre. Now turn that side TWICE. The petal drops down into your white cross.",
          say: 'Match a petal to the centre below it, then turn that side twice. The petal drops down into the white cross.',
          display: learnDisplay(DAISY_MOVES, 'F2'),
          backView: true,
          checklist: [
            'On your cube: find all four white edges',
            'Make four petals standing around the yellow centre',
            "Turn the top so a petal's side colour matches the centre under it",
            'Turn that side twice to tuck the petal down',
            'Do that for all four petals - now you have a white cross!',
          ],
        },
        helpCard('your daisy or your cross'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      prompt: 'Practice turning a petal into place. You can do it!',
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
  goal: 'All four white corners tucked into the bottom, matching the colours around them. 📦',
  story:
    "Now for the fun part, corners! When a white corner is stuck up top, " +
    "The Elevator trick 🛗 rides it down home. Click, click, click! Do it again and again until it pops into place.",
  phaseIds: ['corners'],
  namedAlgIds: ['elevator'],
  realCubeHint:
    "On your real cube: find a white corner on the top layer. Put its home spot right below it. Do the Elevator (R U R' U') again and again until the white sticker faces down.",
  stages: {
    learn: {
      cards: [
        {
          title: 'Corners have THREE colours',
          text: 'An edge has two colours, but a corner has three. Every corner with WHITE on it belongs downstairs, tucked under your white cross.',
          say: 'A corner has three colours. Every corner with white on it belongs in the bottom layer.',
          display: learnDisplay('', ''),
          backView: true,
        },
        {
          title: 'White corner on top: find its home',
          text: 'This white corner is up on top. Turn the top until it sits right ABOVE its home, the little gap between its two other colours. Hold that gap at the front-right. Now do The Elevator!',
          say: 'Turn the top until the white corner sits above its home. Hold that home at the front right and do the Elevator.',
          display: caseDisplay(ELEVATOR),
        },
        {
          title: 'Sometimes it takes three rides',
          text: 'Same corner, same trick, but this one needs three rides. Keep doing The Elevator until the white sticker points DOWN. Do not turn the whole cube around in the middle!',
          say: 'Keep doing the Elevator until the white sticker points down. Sometimes that takes three rides.',
          display: caseDisplay(repeatAlg(ELEVATOR, 3)),
        },
        {
          title: 'A white corner stuck downstairs',
          text: 'This white corner is already in the bottom, but it is twisted the wrong way. Hold it at the front-right and do ONE Elevator to pop it back up top. Now it is the easy case again. Nice!',
          say: 'If a white corner is in the bottom but twisted, do one Elevator to pop it up, then bring it down properly.',
          display: learnDisplay(CORNER_CASE_STUCK, ELEVATOR),
          checklist: [
            'On your cube: find a white corner on the top layer',
            'Turn the top until it sits above its home gap',
            'Hold that gap at the front-right',
            'Do The Elevator until the white sticker points DOWN',
            'Do all four white corners the same way',
          ],
        },
        helpCard('your white corners'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      question: 'Which cube has every corner home already?',
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
  goal: 'Tuck every middle edge next to its matching colour. No yellow anywhere but the top!',
  story:
    "Almost at the yellow layer! Edges on top with no yellow on them belong in the middle row. " +
    "Send it Right if the edge wants to go right. Send it Left if it wants to go left. Easy peasy!",
  phaseIds: ['middle'],
  namedAlgIds: ['goRight', 'goLeft'],
  realCubeHint:
    'On your real cube: find a top edge with no yellow sticker. Look at its front colour and decide, does it slide home to the right or the left?',
  stages: {
    learn: {
      cards: [
        {
          title: 'No yellow? It lives in the middle',
          text: 'Two layers are done, hooray! The grey top layer here is what is left. Any edge up there with NO yellow on it does not belong on top. It belongs in the middle row.',
          say: 'An edge on top with no yellow on it belongs in the middle row.',
          display: learnDisplay('', ''),
          stickering: 'F2L',
        },
        {
          title: 'Line it up first',
          text: "Turn the TOP until the edge's front colour matches the front centre. Look, a little T shape! Now you can see where it wants to go.",
          say: 'Turn the top until the front colour of the edge matches the front centre. That makes a little T.',
          display: learnDisplay(invertAlg(GO_RIGHT) + " U'", 'U'),
        },
        {
          title: 'Top colour on the RIGHT side? Send it Right',
          text: 'Green matches the front. The colour on TOP of that edge is orange, and orange lives on the RIGHT. This edge wants to go right, so do Send it Right!',
          say: 'The top colour is orange, and orange is the right side. Do Send it Right.',
          display: caseDisplay(GO_RIGHT),
        },
        {
          title: 'Top colour on the LEFT side? Send it Left',
          text: 'Green matches the front again. This time the top colour is red, and red lives on the LEFT. So do Send it Left, the mirror move!',
          say: 'The top colour is red, and red is the left side. Do Send it Left.',
          display: caseDisplay(GO_LEFT),
        },
        {
          title: 'A middle spot with the wrong edge in it',
          text: 'Uh oh, a yellow edge is jammed into this middle spot. Put any top edge above it, hold the spot at the front-right, and do Send it Right. The wrong edge pops back up on top! Now send it home properly.',
          say: 'If a middle spot has the wrong edge in it, do Send it Right to pop it up, then send it home properly.',
          display: learnDisplay(MIDDLE_CASE_STUCK, GO_RIGHT),
          checklist: [
            'On your cube: find a top edge with NO yellow on it',
            'Turn the top so its front colour matches the front centre',
            'Look at its TOP colour: is that the right side or the left side?',
            'Do Send it Right, or Send it Left',
            'Fill all four middle spots',
          ],
        },
        helpCard('the middle row'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      prompt: `Try both moves: ${goRight?.kidName ?? 'Send it Right'} and ${goLeft?.kidName ?? 'Send it Left'}. You can do it!`,
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
  goal: 'A yellow cross on top! Four yellow edges pointing out from the yellow centre. ☀️',
  story:
    'Flip the cube so yellow faces up. Look at the top. Is it a dot, an L, or a line? ' +
    'The Yellow Cross trick turns any of those into a full cross. Dot, then L, then line, then cross! Ta-da!',
  phaseIds: ['yellowCross'],
  namedAlgIds: ['yellowCross'],
  realCubeHint:
    "On your real cube: hold the L shape in the top-left, or the line going straight across. Then do F R U R' U' F'. See a dot? Just do it again.",
  stages: {
    learn: {
      cards: [
        {
          title: 'Dot, L, or line?',
          text: 'Look ONLY at the four edges around the yellow centre. Corners do not count yet! No yellow edges at all? That is a DOT.',
          say: 'Look only at the four edges around the yellow centre. No yellow at all is a dot.',
          display: learnDisplay(invertAlg(YC_DOT_FIX), ''),
          stickering: 'EOLL',
        },
        {
          title: 'The L',
          text: "Two yellow edges NEXT TO each other make an L. Turn the top until the L points BACK and LEFT, like 9 o'clock on a clock. Now do the Yellow Cross trick. First a line, then the cross!",
          say: 'Two yellow edges next to each other make an L. Hold the L pointing back and left, then do the trick.',
          display: caseDisplay(YC_L_FIX),
          stickering: 'EOLL',
        },
        {
          title: 'The line',
          text: 'Two yellow edges ACROSS from each other make a line. Hold it going LEFT to RIGHT. Do the Yellow Cross trick once and, look, the cross appears!',
          say: 'Two yellow edges across from each other make a line. Hold it left to right and do the trick once.',
          display: caseDisplay(YC_LINE_FIX),
          stickering: 'EOLL',
        },
        {
          title: 'A dot needs it up to three times',
          text: 'From a dot: do the trick and get an L. Turn the top so the L points back and left, do it again for a line, then once more for the cross. The rest of the cube looks wild in between. Do not worry, that is normal!',
          say: 'From a dot, do the trick three times: dot, then L, then line, then cross.',
          display: caseDisplay(YC_DOT_FIX),
          checklist: [
            'On your cube: hold it yellow up and look at the top',
            'Dot, L, or line?',
            'L: turn the top so it points back and left',
            'Line: hold it going left to right',
            "Do F R U R' U' F' and then look again",
          ],
        },
        helpCard('the yellow cross'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      prompt: `Do ${yellowCrossNamed?.kidName ?? 'the Yellow Cross'} trick! Watch it shine!`,
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
  goal: 'Match every yellow-top edge to the colour beside it. (Corners can still look silly, that is next!)',
  story:
    "Your yellow cross is glowing! Now let's line up its edges. Turn the top until two of them match their side colours. " +
    'If those two sit right next to each other, hold them at the back and the right. Then do the Fish 🐟 to fix the rest.',
  phaseIds: ['yellowEdges'],
  namedAlgIds: ['fish'],
  realCubeHint:
    "On your real cube: keep the yellow cross on top. Turn the top layer until two edges match the colour beside them. Side by side? Put them at the back and right, then do the Fish (R U R' U R U2 R').",
  stages: {
    learn: {
      cards: [
        {
          title: 'Match the edges to their centres',
          text: 'Your yellow cross is done, hooray! Now look at the SIDE colour of each yellow edge, and the centre below it. Turn the TOP until as many as you can match up.',
          say: 'Turn the top until as many yellow edges as possible match the centre below them.',
          display: learnDisplay(invertAlg(EDGES_ADJACENT_FIX), ''),
          stickering: 'ELL',
        },
        {
          title: 'Two matching, side by side',
          text: 'Here the BACK edge and the RIGHT edge both match their centres. Hold those two at the back and the right. Do the Fish, then turn the top to line everything up.',
          say: 'Two matching edges next to each other. Hold them at the back and the right and do the Fish.',
          display: caseDisplay(EDGES_ADJACENT_FIX),
          stickering: 'ELL',
        },
        {
          title: 'Two matching, across from each other',
          text: 'These two match, but they sit across from each other. No back-and-right pair to hold yet! Do the Fish once anywhere, then look again. Now two matching edges will be side by side.',
          say: 'If the two matching edges are across from each other, do the Fish once anywhere and look again.',
          display: learnDisplay(invertAlg(EDGES_OPPOSITE_FIX), FISH),
          stickering: 'ELL',
          checklist: [
            'On your cube: turn the top until two edges match their centres',
            'Are they side by side, or across from each other?',
            'Side by side: hold them at the BACK and the RIGHT',
            'Across: do the Fish once anywhere, then look again',
            'Do the Fish, then turn the top to finish the line-up',
          ],
        },
        helpCard('the yellow edges'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      prompt: `Do ${fish?.kidName ?? 'the Fish'} trick! Watch it swim.`,
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
  goal: "Every corner in its own spot around the top. (Twisted colours are fine for now, that's next!)",
  story:
    "So close to the summit! Sometimes the yellow corners are in the wrong spots. " +
    "Corner Shuffle sends three of them for a walk around the top while one stays home. Shuffle, shuffle, until every corner belongs where it is. " +
    "If none of them is home yet, just do it once anyway and look again.",
  phaseIds: ['cornerPosition'],
  namedAlgIds: ['cornerCycle'],
  realCubeHint:
    'On your real cube: find a corner that is already in the right spot (even if twisted) and hold it at the front-right. Do Corner Shuffle to walk the other three home. Repeat once or twice.',
  stages: {
    learn: {
      cards: [
        {
          title: 'When is a corner HOME?',
          text: 'A corner is HOME when its three colours match the three centres around it, even if it is twisted the wrong way. Twisted is fine for now! Go hunt for one that is home.',
          say: 'A corner is home when its three colours match the three centres around it, even if it is twisted.',
          display: learnDisplay(invertAlg(CORNER_SWAP), ''),
          stickering: 'CPLL',
        },
        {
          title: 'One corner home? Hold it at the front-right',
          text: 'The front-right corner here is already home. Keep it right there and do Corner Swap. The other three walk around it! Look again, you might need it one more time.',
          say: 'Hold the corner that is already home at the front right, then do Corner Swap and look again.',
          display: caseDisplay(CORNER_SWAP),
          stickering: 'CPLL',
        },
        {
          title: 'No corner home? Do it once anyway',
          text: 'Sometimes NO corner is home. Do not worry! Do Corner Swap once with any corner at the front-right. Look again and one corner will be home.',
          say: 'If no corner is home, do Corner Swap once anywhere, then look again.',
          display: learnDisplay(CORNERS_NONE_HOME, CORNER_SWAP),
          stickering: 'CPLL',
          checklist: [
            'On your cube: find a corner whose 3 colours match the 3 centres around it',
            'Twisted is OK - only the SPOT matters right now',
            'Hold that corner at the front-right',
            'Do Corner Swap and look again',
            'If no corner is home, do Corner Swap once anywhere first',
          ],
        },
        helpCard('the corner spots'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      prompt: `Do ${cornerCycle?.kidName ?? 'Corner Shuffle'}! Watch them walk.`,
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
  goal: 'A fully solved cube! Every corner twisted just right, every colour matched. You made it to the top! 🏔️',
  story:
    "The very last step! Hold a corner that needs fixing at the front-right-top. Do the Bottom Elevator, " +
    "2 times or 4 times, until yellow faces up on that corner. The cube might look messy in the middle. " +
    "That's totally normal! Keep going, it fixes itself. Then turn only the TOP layer to bring the next corner around, and do it again.",
  phaseIds: ['cornerOrient'],
  namedAlgIds: ['cornerTwist'],
  realCubeHint:
    "On your real cube: put a corner that needs twisting at the front-right-top. Do the Bottom Elevator (R' D' R D) 2 or 4 times until it shows yellow on top. Turn ONLY the top layer to bring the next corner to the front-right and repeat, don't turn anything else. When every corner shows yellow on top, you solved the whole cube!",
  stages: {
    learn: {
      cards: [
        {
          title: 'Every corner is home - some are just twisted',
          text: 'Look at the top. Every corner is in the right SPOT, but some do not show yellow on top yet. Find one that is not yellow and hold it at the front-right.',
          say: 'Every corner is in the right spot, but some are twisted. Hold one that is not yellow on top at the front right.',
          display: learnDisplay(SUMMIT_SETUP, ''),
          stickering: 'OCLL',
        },
        {
          title: 'Two rides of the Bottom Elevator',
          text: "Do R' D' R D twice. Count them out loud: one, two! Look, yellow comes up on that front-right corner.",
          say: 'Do the Bottom Elevator two times and watch yellow come up on the front right corner.',
          display: learnDisplay(SUMMIT_SETUP, repeatAlg(BOTTOM_ELEVATOR, 2)),
        },
        {
          title: 'It looks broken - keep going!',
          text: 'Uh oh, the middle of the cube looks messy right now! Do not worry. That is totally normal and it fixes itself at the end. Never turn the whole cube around, just keep riding.',
          say: 'The bottom will look broken in the middle of this. That is normal - keep going and it fixes itself.',
          display: learnDisplay(SUMMIT_SETUP + ' ' + BOTTOM_ELEVATOR, ''),
        },
        {
          title: 'Turn ONLY the top',
          text: 'That corner shows yellow now, yay! Turn ONLY the top layer to bring the next twisted corner round to the front-right. Do not turn anything else!',
          say: 'Turn only the top layer to bring the next twisted corner to the front right.',
          display: learnDisplay(SUMMIT_SETUP + ' ' + repeatAlg(BOTTOM_ELEVATOR, 2), 'U'),
        },
        {
          title: 'Sometimes it takes four rides',
          text: 'This corner needs the Bottom Elevator FOUR times. Count in twos: two, four! Now yellow is up. It is always two or four, never three.',
          say: 'This corner needs the Bottom Elevator four times. Count in twos: two, four.',
          display: learnDisplay(SUMMIT_SETUP + ' ' + repeatAlg(BOTTOM_ELEVATOR, 2) + ' U', repeatAlg(BOTTOM_ELEVATOR, 4)),
        },
        {
          title: 'One last top turn - SUMMIT!',
          text: 'Every corner shows yellow! One last turn of the top layer and the whole cube clicks together. You did it! You are standing on top of the mountain!',
          say: 'One last turn of the top and the whole cube is solved. You made it to the summit!',
          display: learnDisplay(
            SUMMIT_SETUP + ' ' + repeatAlg(BOTTOM_ELEVATOR, 2) + ' U ' + repeatAlg(BOTTOM_ELEVATOR, 4),
            "U'",
          ),
          checklist: [
            'On your cube: find a top corner that is not yellow on top',
            'Hold it at the front-right',
            "Do R' D' R D two times, or four times, until yellow is up",
            'Turn ONLY the top to bring the next corner to the front-right',
            'Repeat until every corner shows yellow',
            'One last turn of the top - SOLVED!',
          ],
        },
        helpCard('the very last corners'),
      ],
      estimatedMinutes: STAGE_MINUTES.learn,
    },
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
      prompt: `Do ${cornerTwist?.kidName ?? 'the Bottom Elevator'}! You are almost at the top!`,
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
