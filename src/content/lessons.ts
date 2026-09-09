/**
 * CubeClimb curriculum: 10 holds on a climbing wall, bottom to top. Pure data
 * (typed), no React. Screens (Wall.tsx, Lesson.tsx) render this content and
 * track progress against it via src/store/progress.ts and src/store/missions.ts.
 *
 * Each hold is broken into 2-5 tiny missions ("Look -> Do -> Check", 3-6
 * minutes each) instead of the old Watch/Try/Spot/Climb stages. One
 * "Yes, I did it!" unlocks the next mission. A mission's `goalCheck` reads
 * her actual cube state (via src/engine/progress.ts counters, or the
 * solver's own isPhaseDone) so the camera-scan help flow (ScanHelp.tsx) can
 * tell automatically whether she's there yet; `goalPhase`, when present,
 * bounds how far a "show me the steps" walkthrough is allowed to walk, and
 * `prereqPhase` is the phase that must already be done before this mission's
 * own goal can be checked - "Get me ready" free help gets her there first, at
 * no cost to her token tier.
 *
 * Move/alg strings are validated in __tests__/lessons.test.ts: every alg must
 * parse and apply against the engine's SOLVED state without throwing, every
 * namedAlgId must exist in NAMED_ALGS, every mission id is on the frozen
 * ALL_MISSION_IDS list, and every check picture actually satisfies its own
 * mission's goalCheck.
 *
 * --- How a Learn/Mission card's alg maps to what's on screen -------------
 * TwistyCube always renders `setupAlg` first, then sits paused there (no
 * card presses Play automatically). The house convention (see TwistyCube.tsx
 * and caseDisplay() below) is: pass the alg that WOULD SOLVE the case you
 * want to display. Concretely, for `caseDisplay(X)` the frame shown is
 * `applyAlg(SOLVED, invertAlg(X))` - i.e. "the state X reaches *back* to
 * solved". So:
 *   - to show "solved": X = ''
 *   - to show "the case some trick X solves" (e.g. a popped-out corner just
 *     before doing the Elevator): use X = that trick's alg, unchanged
 *   - to show "the state you get by turning some move M forward from
 *     solved" (e.g. Base Camp's "this is what R looks like"): use
 *     X = invertAlg(M)
 *
 * --- The z2 display convention ---------------------------------------------
 * Every `setupAlg` built by `learnDisplay`/`caseDisplay` carries a leading
 * "z2 " - that's a TwistyCube rendering correction (see TwistyCube.tsx), not
 * a move Nora performs. `learnCardState()`/`checkpointState()`/`missionCheckState()`
 * strip it before computing the facelet state, so all the alg constants below
 * are written as if starting from a plain "yellow up, green front" SOLVED cube.
 */

import { SOLVED, applyAlg, invertAlg } from '../engine/cube'
import { NAMED_ALGS, namedAlg } from '../engine/notation'
import {
  countCornersPositioned,
  countCrossEdges,
  countDaisyPetals,
  countMiddleEdges,
  countWhiteCorners,
  countYellowEdgesAligned,
  yellowCrossShape,
} from '../engine/progress'
import { isPhaseDone, type PhaseId } from '../engine/solver'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HoldId =
  | 'basecamp'
  | 'daisy'
  | 'cross'
  | 'cornerFind'
  | 'corners'
  | 'middle'
  | 'yellowCross'
  | 'yellowEdges'
  | 'cornerPosition'
  | 'cornerOrient'

export type { PhaseId }

export const HOLD_ORDER: HoldId[] = [
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
]

/**
 * One picture/animation of the *method* Nora needs - how to hold the cube,
 * how to find the piece, which case calls for which trick, and what to do on
 * her own cube right now.
 *
 * `display` is a raw TwistyCube setupAlg/alg pair (see the file header for the
 * z2 convention). Build it with `learnDisplay(movesFromSolved, alg)` so the
 * paused frame is always `applyAlg(SOLVED, movesFromSolved)` and pressing
 * play animates `alg` forward from there.
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

/** A mission's Look/Do card is just a LearnCard - same shape, same rendering. */
export type MissionCard = LearnCard

/**
 * One case she might see, offered as a tappable card in a `pick` step's
 * "which one looks like yours?" picker. `display` is always a STILL picture
 * (`alg: ''`) of the case; `then` is the sequence of steps to run once she
 * picks it (usually a single `do` card carrying the animated trick).
 */
export interface PickOption {
  label: string
  display: { setupAlg: string; alg: string }
  stickering?: string
  then: MissionStep[]
}

/** One step of a mission's "Do" phase: an animated card, a tap-along practice drill, or a case picker. */
export type MissionStep =
  | (MissionCard & { kind: 'do'; namedAlgId?: string; followAlong?: boolean })
  | { kind: 'practice'; prompt: string; say: string; sequence: string; sequences?: string[] }
  | { kind: 'pick'; title: string; text: string; say: string; options: PickOption[] }

/** The "does yours look like this?" picture shown at the end of a mission. */
export interface MissionCheck {
  text: string
  say: string
  display?: { setupAlg: string; alg: string }
  stickering?: string
  backView?: boolean
}

export interface GoalResult {
  done: boolean
  /** e.g. "2 of 4 petals" - shown while she's still working on it. */
  progressText?: string
}

/** Reads a facelet state and says whether a mission's goal is met yet. */
export type GoalCheck = (state: string) => GoalResult

export interface Mission {
  /** STABLE progress key ('D2'). Never renumber - insert a new one as 'D2b'. */
  id: string
  title: string
  /** 3-6 minutes. */
  estimatedMinutes: number
  look: MissionCard
  steps: MissionStep[]
  check: MissionCheck
  goalCheck: GoalCheck
  /** Present => the camera-scan "show me my cube" help is offered, and a
   * walkthrough is sliced to end by this phase. */
  goalPhase?: PhaseId
  /** A phase that must already be done before this mission's own goal makes
   * sense - "Get me ready" free help walks her there first, no token cost. */
  prereqPhase?: PhaseId
}

/**
 * "Before you start this hold, your cube should look like this." Shown as a
 * Ready? card before the mission list (once per session) and reused as a
 * "what's next" preview once a hold is mastered. Every hold except Base Camp
 * and The Daisy Ledge has one - those two are the only two holds Nora can
 * start from ANY scrambled cube, so there's nothing to check yet.
 */
export interface Checkpoint {
  /** "Your cube should look like this:" 1-2 short sentences. */
  look: string
  /** "Hold it like this:" 1 sentence. */
  hold: string
  say: string
  /** A still picture - build with `learnDisplay(movesFromSolved, '')`. */
  display?: { setupAlg: string; alg: string }
  /** A cubing.js experimentalStickering preset - must be in LEARN_STICKERINGS. */
  stickering?: string
  backView?: boolean
  /** Hold id to send her back to if the cube does NOT look like this. */
  fallbackHoldId?: HoldId
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
  checkpoint?: Checkpoint
  missions: Mission[]
}

/** The centre-ritual shown once per local day, before any hold but Base Camp. */
export interface RitualCard extends MissionCard {
  /** Only card 2 has one - the "yes, I'm holding it right" confirm button. */
  confirmLabel?: string
}

/** setupAlg/alg pair for TwistyCube to show the case `alg` solves, paused at the case. */
export function caseDisplay(alg: string): { setupAlg: string; alg: string } {
  return { setupAlg: 'z2 ' + invertAlg(alg), alg }
}

/** setupAlg/alg pair for a fully static picture (no case-to-solve narrative, e.g. Base Camp). */
export function forwardDisplay(movesFromSolved: string): { setupAlg: string; alg: string } {
  return caseDisplay(invertAlg(movesFromSolved))
}

/**
 * setupAlg/alg pair for a Learn/Mission card: pause on the state
 * `movesFromSolved` reaches from solved, then animate `alg` forward from
 * there. Pass `alg: ''` for a still picture.
 */
export function learnDisplay(movesFromSolved: string, alg: string): { setupAlg: string; alg: string } {
  return { setupAlg: ('z2 ' + movesFromSolved).trim(), alg }
}

/** A still preview (`alg: ''`) of a Do card's display, for a PickOption. */
function stillOf(display: { setupAlg: string; alg: string }): { setupAlg: string; alg: string } {
  return { setupAlg: display.setupAlg, alg: '' }
}

/** The facelet state a display pair (setupAlg/alg) shows while paused, before `alg` plays. */
function stateFromDisplay(display?: { setupAlg: string; alg: string }): string {
  if (!display) return SOLVED
  return applyAlg(SOLVED, display.setupAlg.replace(/^z2\s*/, ''))
}

/** The facelet state a Learn/Mission card shows while it is paused. */
export function learnCardState(card: LearnCard): string {
  return stateFromDisplay(card.display)
}

/** The facelet state a Learn/Mission card ends on once its alg has played. */
export function learnCardEndState(card: LearnCard): string {
  return applyAlg(learnCardState(card), card.display?.alg ?? '')
}

/** The facelet state a checkpoint's picture shows (same z2-stripping rule as learnCardState). */
export function checkpointState(checkpoint: Checkpoint): string {
  return stateFromDisplay(checkpoint.display)
}

/** The facelet state a mission's check picture shows. */
export function missionCheckState(check: MissionCheck): string {
  return stateFromDisplay(check.display)
}

/**
 * cubing.js `experimentalStickering` presets, read out of
 * node_modules/cubing/dist/lib/cubing/chunks/chunk-WBMKMQAL.js (the
 * `experimentalStickerings` table, ~line 272) - only these names exist, and
 * only the ones listed here are used by Look/Do cards and check pictures.
 */
export const LEARN_STICKERINGS = ['full', 'Daisy', 'Cross', 'F2L', 'EOLL', 'ELL', 'CPLL', 'OCLL', 'LL'] as const

// ---------------------------------------------------------------------------
// Goal factories
// ---------------------------------------------------------------------------

/** A mission whose "done" is entirely Nora's own call - she looks, taps yes. */
function selfReport(): GoalCheck {
  return () => ({ done: true })
}

/**
 * "Reached at least n of this counter" - and, when `prereqPhase` is given,
 * only once that earlier phase is also genuinely done. That prereq guard is
 * the main defence against a lucky scramble satisfying a low threshold (e.g.
 * "1 corner already home") before she's actually built up to it; see the
 * plan's Risks section for the (accepted) residual on the very first
 * threshold of a curriculum, where there's no earlier phase to check.
 */
function atLeast(
  counter: (state: string) => number,
  n: number,
  noun: string,
  prereqPhase?: PhaseId,
): GoalCheck {
  return (state) => {
    const count = counter(state)
    const done = count >= n && (prereqPhase === undefined || isPhaseDone(state, prereqPhase))
    return { done, progressText: `${Math.min(Math.max(count, 0), n)} of ${n} ${noun}` }
  }
}

/** Straight from the solver's own phase predicate. */
function phaseDone(phase: PhaseId): GoalCheck {
  return (state) => ({ done: isPhaseDone(state, phase) })
}

/** Daisy petals plus already-tucked cross edges - stays monotone once tucking starts (see file header). */
function petalsAndCross(state: string): number {
  return countDaisyPetals(state) + countCrossEdges(state)
}

// ---------------------------------------------------------------------------
// The orientation ritual - shown once per local day before any hold but Base Camp
// ---------------------------------------------------------------------------

const RITUAL_SCRAMBLE = "R2 U F2 D' L2 B R' U2 F L' D2"

export const ORIENTATION_RITUAL: [RitualCard, RitualCard] = [
  {
    title: 'The middle sticker never moves',
    text: "No matter how scrambled your cube looks, the middle sticker of each side stays put. It always tells you that side's true colour.",
    say: "The middle sticker of each side never moves. It always tells you that side's true colour.",
    display: learnDisplay(RITUAL_SCRAMBLE, "R U R' U'"),
  },
  {
    title: 'Yellow on top, green facing you',
    text: 'Turn the WHOLE cube (not just one side!) until the yellow middle is on top and the green middle faces you. That is how every climb starts.',
    say: 'Turn the whole cube until yellow is on top and green faces you.',
    display: learnDisplay('x y', "y' x'"),
    confirmLabel: 'Yellow is on top, green faces me ✅',
  },
]

// ---------------------------------------------------------------------------
// Hand-derived cube states, found by breadth-first search over the state
// graph (not kept in the repo - just the resulting short algs below), plus a
// few simple "pop one piece away from solved" states verified directly
// against the engine's own counters. Each is last-layer-only (D face and the
// bottom two rows of R/F/L/B untouched) starting from SOLVED, unless noted.
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
/** Daisy with the front petal already tucked down - a fresh, aligned front petal ready to tuck. */
const CROSS_CASE_TUCK_ONE = `${DAISY_MOVES} F2`

/**
 * The three cases a white edge can be in on the way to becoming a daisy
 * petal - shared between D2 (first petal) and D3 (every later petal, same
 * three tricks). Each option's `display` is a still of the exact case its
 * `then` step animates.
 */
const PETAL_OPTIONS: PickOption[] = [
  {
    label: 'White on the bottom',
    display: stillOf(learnDisplay(CROSS_CASE_BOTTOM, 'F2')),
    then: [
      {
        kind: 'do',
        title: 'A white edge on the bottom',
        text: 'See the white edge on the bottom, white pointing DOWN? Turn that side TWICE. Whoosh, it flies up!',
        say: 'A white edge on the bottom with white pointing down. Turn that side twice and up it comes.',
        display: learnDisplay(CROSS_CASE_BOTTOM, 'F2'),
      },
    ],
  },
  {
    label: 'In the middle row',
    display: stillOf(learnDisplay(CROSS_CASE_MIDDLE, 'R')),
    then: [
      {
        kind: 'do',
        title: 'A white edge in the middle row',
        text: 'White edge stuck in the middle row? One turn of that side lifts it up. If a petal is already there, turn the TOP first to make room.',
        say: 'A white edge in the middle row. Turn that side once to lift it up. If a petal is in the way, turn the top first.',
        display: learnDisplay(CROSS_CASE_MIDDLE, 'R'),
      },
    ],
  },
  {
    label: 'On top, sideways',
    display: stillOf(learnDisplay(CROSS_CASE_FLIPPED, "F' L'")),
    then: [
      {
        kind: 'do',
        title: 'White is pointing sideways',
        text: 'This one is on top but white looks at YOU. Turn it out, then bring it up the next side.',
        say: 'This white edge is on top but pointing sideways. Turn it out, then bring it up the next side.',
        display: learnDisplay(CROSS_CASE_FLIPPED, "F' L'"),
      },
    ],
  },
]

/** The white corner is home but twisted - one Elevator pops it back onto the top. */
const CORNER_CASE_STUCK = repeatAlg(ELEVATOR, 2)

/** A middle edge is in place but the wrong way round / the wrong piece. */
const MIDDLE_CASE_STUCK = GO_RIGHT

/** Yellow cross cases, in the order Nora meets them: line (1 trick), L (2), dot (3). */
const YC_LINE_FIX = YELLOW_CROSS
const YC_L_FIX = repeatAlg(YELLOW_CROSS, 2)
const YC_DOT_FIX = `${YELLOW_CROSS} U2 ${YELLOW_CROSS} ${YELLOW_CROSS}`
const YELLOW_CROSS_DOT_ALG = "L' B' U' B U L R' U' F' U F R"

/** Edge Ledge: two matching edges at the BACK and the RIGHT - the Fish plus a top turn finishes it. */
const EDGES_ADJACENT_FIX = `${FISH} U`
/** Edge Ledge: two matching edges opposite each other - one Fish turns it into the adjacent case. */
const EDGES_OPPOSITE_FIX = `${FISH} U' ${FISH} U2`

/**
 * Corner Shuffle with NO corner home yet: the pure corner double-swap
 * (E-perm). Every phase up to and including yellow-edges is actually still
 * solved underneath it (verified: cross/corners/middle/yellowCross/
 * yellowEdges all read done) - only the LAST-LAYER corner *positions* are
 * scrambled - so `stickering: 'Cross'` or `'F2L'` is what keeps the picture
 * honest wherever this gets reused as an earlier-hold "cross done" check.
 */
const CORNERS_NONE_HOME = "x' R U' R' D R U R' D' R U R' D R U' R' D' x"

/** Bottom layer + middle band solved, only the top messy (2 of 4 middle edges tucked). */
const BOTTOM_LAYER_DONE_TOP_MESSY = `${GO_RIGHT} U2 ${GO_LEFT} U ${GO_RIGHT}`

/** Pops one white corner up off its home - undoes a single Elevator ride. */
const POP_ONE_CORNER = "U R U' R'"
const POP_TWO_CORNERS = `${POP_ONE_CORNER} y ${POP_ONE_CORNER}`
const POP_THREE_CORNERS = `${POP_ONE_CORNER} y ${POP_ONE_CORNER} y ${POP_ONE_CORNER}`

/** Pops one middle edge up off its home - undoes a single Send it Right. */
const POP_ONE_MIDDLE = "F' U F U R U' R' U'"
const POP_THREE_MIDDLE = `${POP_ONE_MIDDLE} y ${POP_ONE_MIDDLE} y ${POP_ONE_MIDDLE}`

/** The Summit walkthrough: one corner needs 2 rides, the next needs 4, then one last top turn. */
const SUMMIT_FIX = `${repeatAlg(BOTTOM_ELEVATOR, 2)} U ${repeatAlg(BOTTOM_ELEVATOR, 4)} U'`
const SUMMIT_SETUP = invertAlg(SUMMIT_FIX)

// ---------------------------------------------------------------------------
// The 10 holds
// ---------------------------------------------------------------------------

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
  missions: [
    {
      id: 'B1',
      title: 'Hold it like a climber',
      estimatedMinutes: 3,
      look: {
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
      steps: [
        {
          kind: 'do',
          title: 'What is a side?',
          text: 'A side is one whole face of your cube. Nine little squares! The middle square never moves. It always tells you that side\'s colour.',
          say: 'A side is one whole face - nine squares. The middle square never moves, so it tells you the colour of that side.',
          display: learnDisplay('', ''),
        },
      ],
      check: {
        text: 'Yellow on top, green facing you - just like this! ✅',
        say: 'Check: yellow on top, green facing you.',
        display: learnDisplay('', ''),
        backView: true,
      },
      goalCheck: selfReport(),
    },
    {
      id: 'B2',
      title: 'R and R’',
      estimatedMinutes: 4,
      look: {
        title: 'Meet R and R’',
        text: 'R is the RIGHT side of your cube. The little mark (’) means backwards. R goes one way, R’ goes right back the other way.',
        say: 'R is the right side. The little mark means backwards.',
        display: learnDisplay('', ''),
      },
      steps: [
        {
          kind: 'do',
          title: 'R = Right side UP',
          text: 'R means the RIGHT side goes UP, like it is climbing a ladder. Press play and watch! Only the right side moves.',
          say: 'R means right side up.',
          display: learnDisplay('', 'R'),
        },
        {
          kind: 'do',
          title: "R' = Right side DOWN",
          text: "R' means the RIGHT side goes back DOWN. Same side, other way. Easy!",
          say: 'R backwards means right side down.',
          display: learnDisplay('', "R'"),
        },
        {
          kind: 'practice',
          prompt: "Now you try! Tap R, then tap R backwards.",
          say: 'Turn the right side up, then back down.',
          sequence: "R R'",
        },
      ],
      check: {
        text: 'Your cube looks exactly like it started - nothing changed! You undid your own move.',
        say: 'Nothing changed - you undid your own move.',
        display: learnDisplay('', ''),
      },
      goalCheck: selfReport(),
    },
    {
      id: 'B3',
      title: 'U and U’',
      estimatedMinutes: 4,
      look: {
        title: 'Meet U and U’',
        text: 'U is the TOP layer, like a hat on the cube. U slides that whole hat one way, U’ slides it back.',
        say: 'U is the top layer, like a hat on the cube.',
        display: learnDisplay('', ''),
      },
      steps: [
        {
          kind: 'do',
          title: 'U = Top layer LEFT',
          text: 'U slides the top layer to the LEFT.',
          say: 'U means top layer left.',
          display: learnDisplay('', 'U'),
        },
        {
          kind: 'do',
          title: "U' = Top layer RIGHT",
          text: "U' slides the top layer back to the RIGHT. Whoosh, back it goes!",
          say: 'U backwards means top layer right.',
          display: learnDisplay('', "U'"),
        },
        {
          kind: 'practice',
          prompt: 'Tap U, then tap U backwards.',
          say: 'Turn the top left, then back right.',
          sequence: "U U'",
        },
      ],
      check: {
        text: 'The top layer is back where it started. Nice hat-spinning!',
        say: 'The top layer is back where it started.',
        display: learnDisplay('', ''),
      },
      goalCheck: selfReport(),
    },
    {
      id: 'B4',
      title: 'F, D, L (and B hides behind)',
      estimatedMinutes: 4,
      look: {
        title: 'Three more sides',
        text: 'F is the green side looking right at you. D is the white side, hiding underneath. L is the red side, on your left. B (blue) is way at the back - it hides behind everything!',
        say: 'F is the front, D is the bottom, L is the left. B is the back - it hides behind everything.',
        display: learnDisplay('', ''),
        backView: true,
      },
      steps: [
        {
          kind: 'do',
          title: 'F = the Front side',
          text: 'F is the side looking right at you, the green one. F spins it like a little steering wheel to the right.',
          say: 'F is the front side. It spins like a steering wheel to the right.',
          display: learnDisplay('', 'F'),
        },
        {
          kind: 'do',
          title: 'D = the Bottom layer',
          text: 'D is the bottom layer. It hides way underneath. Watch the little back picture to catch it moving!',
          say: 'D is the bottom layer, underneath the cube.',
          display: learnDisplay('', 'D'),
          backView: true,
        },
        {
          kind: 'do',
          title: 'L = the Left side',
          text: 'L is the red side, on your left hand. It spins the opposite way from R.',
          say: 'L is the left side.',
          display: learnDisplay('', 'L'),
        },
      ],
      check: {
        text: 'You spun F, D and L. Blue (B) hides at the very back - you will meet it soon!',
        say: 'You spun F, D and L. Blue hides at the very back.',
        display: learnDisplay('', ''),
      },
      goalCheck: selfReport(),
    },
    {
      id: 'B5',
      title: 'Read a recipe',
      estimatedMinutes: 4,
      look: {
        title: 'What is a recipe?',
        text: 'Big climbers use little "recipes" - a list of moves, in order, that always does the same trick. Let’s read your very first one!',
        say: 'A recipe is a list of moves in order that always does the same trick.',
        display: learnDisplay('', ''),
      },
      steps: [
        {
          kind: 'practice',
          prompt: "Tap R, then U, then R backwards, then U backwards - in that order!",
          say: "Right side up, top left, right side down, top right.",
          sequence: "R U R' U'",
        },
      ],
      check: {
        text: 'You read your first recipe! This one even has a name: The Elevator 🛗. You will use it a lot.',
        say: 'You read your first recipe. It is called the Elevator, and you will use it a lot.',
        display: caseDisplay("R U R' U'"),
      },
      goalCheck: selfReport(),
    },
  ],
}

const daisy: Lesson = {
  id: 'daisy',
  number: 1,
  title: 'The Daisy Ledge',
  goal: 'Grow a daisy: four white edges standing up around the yellow centre. 🌼',
  story:
    "Time to grow a daisy! 🌼 Every white edge piece wants to stand up next to the yellow centre, like a petal. " +
    'Hunt for one, bring it up, and check its colours. Four petals means your daisy is done!',
  phaseIds: ['daisy'],
  namedAlgIds: [],
  realCubeHint:
    'On your real cube: hold it yellow on top, green facing you. Find a white edge piece. Spin it up next to the yellow centre to make a petal. Match all four petals to grow your daisy.',
  missions: [
    {
      id: 'D1',
      title: 'Find the four white edges',
      estimatedMinutes: 3,
      look: {
        title: 'Every edge has two colours',
        text: 'Every white edge piece has TWO stickers: white, and one other colour. Hunt around your WHOLE cube - white edges can be anywhere.',
        say: 'Every white edge has two stickers: white, and one other colour. Hunt your whole cube for them.',
        display: learnDisplay('', ''),
      },
      steps: [
        {
          kind: 'do',
          title: 'Spot one on top already',
          text: 'Look, one white edge might already be on top! Point to it. See the white sticker AND its other colour?',
          say: 'One white edge might already be on top. Point to it.',
          display: learnDisplay('', ''),
        },
      ],
      check: {
        text: 'Did you find all four white edges? Point to each one, anywhere on your cube.',
        say: 'Did you find all four white edges?',
        display: learnDisplay('', ''),
      },
      goalCheck: selfReport(),
    },
    {
      id: 'D2',
      title: 'Make ONE petal',
      estimatedMinutes: 5,
      look: {
        title: 'Grow a daisy',
        text: 'Find the YELLOW centre on top. That is the middle of our flower! A WHITE edge standing up next to it is a petal.',
        say: 'Find the yellow centre on top. A white edge standing up next to it is a petal.',
        display: learnDisplay(DAISY_MOVES, ''),
        stickering: 'Daisy',
      },
      steps: [
        {
          kind: 'pick',
          title: 'Which one looks like yours?',
          text: 'Every white edge you find will be in one of these three spots. Tap the one that matches.',
          say: 'Every white edge you find will be in one of these three spots. Tap the one that matches yours.',
          options: PETAL_OPTIONS,
        },
      ],
      check: {
        text: 'Do you have at least ONE petal? A white sticker standing up next to yellow.',
        say: 'Do you have at least one petal - a white sticker standing up next to yellow?',
        display: forwardDisplay('F2'),
        stickering: 'Daisy',
      },
      goalCheck: atLeast(petalsAndCross, 1, 'petals'),
      goalPhase: 'daisy',
    },
    {
      id: 'D3',
      title: 'Two petals without breaking the first',
      estimatedMinutes: 5,
      look: {
        title: 'A second petal',
        text: 'One petal is standing tall. Now find a SECOND white edge and make it stand up too - without knocking the first one back down.',
        say: 'Find a second white edge and make it stand up too, without knocking the first one down.',
        display: forwardDisplay('F2'),
        stickering: 'Daisy',
      },
      steps: [
        {
          kind: 'pick',
          title: 'Which one is your next white edge?',
          text: 'Bottom, middle row, or sideways on top - the same three moves make any white edge into a petal. Which case matches?',
          say: 'The same three moves work for any white edge: bottom, middle row, or sideways on top. Which case matches?',
          options: PETAL_OPTIONS,
        },
        {
          kind: 'do',
          title: 'Count as you go',
          text: 'One petal is up. See the white edge at the bottom on the RIGHT? Turn the RIGHT side twice. Now count: one… two!',
          say: 'One petal is up. Turn the right side twice to bring up the second. Now count: one, two.',
          display: learnDisplay('F2', 'R2'),
          stickering: 'Daisy',
        },
      ],
      check: {
        text: 'Two petals now? Check both are still standing tall next to yellow.',
        say: 'Do you have two petals standing tall?',
        display: forwardDisplay('F2 B2'),
        stickering: 'Daisy',
      },
      goalCheck: atLeast(petalsAndCross, 2, 'petals'),
      goalPhase: 'daisy',
    },
    {
      id: 'D4',
      title: 'Finish the daisy',
      estimatedMinutes: 5,
      look: {
        title: 'The last two petals',
        text: 'Two more white edges to go! Hunt around your cube, bring each one up, and check it stands next to yellow.',
        say: 'Two more petals to go. Hunt for each white edge and bring it up.',
        display: forwardDisplay('F2 B2'),
        stickering: 'Daisy',
      },
      steps: [
        {
          kind: 'do',
          title: 'Count your petals',
          text: 'Look at the top of your cube. Can you count FOUR white petals standing around the yellow centre?',
          say: 'Count your petals. Four white petals around the yellow centre means your daisy is done.',
          display: learnDisplay(DAISY_MOVES, ''),
          stickering: 'Daisy',
          checklist: [
            'On your cube: count the white petals around the yellow centre',
            'Four petals? Your daisy is done!',
            'Fewer than four? Find another white edge and make a petal',
          ],
        },
      ],
      check: {
        text: 'Four petals all the way around the yellow centre - your daisy is complete! 🌼',
        say: 'Four petals all the way around - your daisy is complete.',
        display: learnDisplay(DAISY_MOVES, ''),
        stickering: 'Daisy',
      },
      goalCheck: phaseDone('daisy'),
      goalPhase: 'daisy',
    },
  ],
}

const cross: Lesson = {
  id: 'cross',
  number: 2,
  title: 'The White Cross Bridge',
  goal: 'Tuck every petal down into a white cross - matching every centre around it. 🌉',
  story:
    "Your daisy is ready to cross the bridge! Pick a petal, line it up with its own colour, and tuck it straight down. " +
    'Do all four and you get a white cross. Then peek underneath to check, and put yellow back on top.',
  phaseIds: ['cross'],
  namedAlgIds: [],
  realCubeHint:
    "On your real cube: grow your daisy first. Turn the top until a petal's side colour matches the centre under it, then turn that side twice to tuck it down. Do all four, then peek underneath to check.",
  checkpoint: {
    look: 'Four white petals stand around the yellow centre on top',
    hold: 'Yellow on top, green facing you',
    say: 'Check your cube. Do you see four white petals standing up around the yellow centre? Keep yellow on top and green facing you.',
    display: learnDisplay(DAISY_MOVES, ''),
    stickering: 'Daisy',
    fallbackHoldId: 'daisy',
  },
  missions: [
    {
      id: 'C1',
      title: 'Tuck ONE petal',
      estimatedMinutes: 4,
      look: {
        title: 'Pick one petal',
        text: 'Choose any white petal standing on top. Look at its OTHER colour - the one on the side, not white.',
        say: 'Choose any petal and look at its other colour, the one on the side.',
        display: learnDisplay(DAISY_MOVES, ''),
        stickering: 'Daisy',
      },
      steps: [
        {
          kind: 'do',
          title: 'Line it up',
          text: "Turn the TOP until that petal's side colour matches the centre below it.",
          say: "Turn the top until the petal's side colour matches the centre below it.",
          display: learnDisplay(`${DAISY_MOVES} U`, "U'"),
        },
        {
          kind: 'do',
          title: 'Turn that side twice - it drops down',
          text: 'Now turn THAT SIDE, not the top, twice. The petal drops straight down into the cross.',
          say: 'Turn that side twice. The petal drops straight down into the cross.',
          display: learnDisplay(DAISY_MOVES, 'F2'),
        },
      ],
      check: {
        text: 'One petal tucked in, matching the colour beside it - a little upside-down T shape!',
        say: 'One petal tucked in, matching the colour beside it.',
        display: learnDisplay(CROSS_CASE_TUCK_ONE, ''),
      },
      goalCheck: (state) => ({
        done: countCrossEdges(state) >= 1 && petalsAndCross(state) === 4,
        progressText: `${Math.min(countCrossEdges(state), 4)} of 4 tucked`,
      }),
      goalPhase: 'cross',
      prereqPhase: 'daisy',
    },
    {
      id: 'C2',
      title: 'Tuck all four',
      estimatedMinutes: 5,
      look: {
        title: 'Do the other three the same way',
        text: 'One down, three to go! Line up the next petal, tuck it down, and keep going until all four petals are in.',
        say: 'Line up the next petal and tuck it down. Keep going until all four are in.',
        display: learnDisplay(CROSS_CASE_TUCK_ONE, ''),
      },
      steps: [
        {
          kind: 'do',
          title: 'Line up, then tuck',
          text: 'Same two steps every time: turn the TOP to line up a petal\'s colour, then turn THAT SIDE twice.',
          say: 'Turn the top to line up a petal, then turn that side twice to tuck it.',
          display: learnDisplay(`${DAISY_MOVES} U`, "U' F2"),
        },
      ],
      check: {
        text: 'Every side shows a little upside-down T: a white edge above a matching centre. That is your white cross!',
        say: 'Every side shows a little upside-down T - white edge above a matching centre.',
        display: learnDisplay(CORNERS_NONE_HOME, ''),
        stickering: 'Cross',
        backView: true,
      },
      goalCheck: atLeast(countCrossEdges, 4, 'cross edges', 'daisy'),
      goalPhase: 'cross',
      prereqPhase: 'daisy',
    },
    {
      id: 'C3',
      title: 'Check the T shapes, yellow back on top',
      estimatedMinutes: 4,
      look: {
        title: 'Check: T shapes all around',
        text: 'Tip the cube to peek underneath. Every side should show a little upside-down T: a white edge above a matching centre.',
        say: 'Tip the cube to peek underneath. Every side should show a matching T shape.',
        display: learnDisplay(CORNERS_NONE_HOME, ''),
        stickering: 'Cross',
        backView: true,
        checklist: [
          'On your cube: tip it to peek underneath',
          'Every side shows a matching upside-down T?',
          'Put yellow back on top, green facing you',
        ],
      },
      steps: [
        {
          kind: 'do',
          title: 'Tip it back: yellow on top again',
          text: 'Great check! Now tip the cube back so yellow is on top and green faces you again, ready for the next wall.',
          say: 'Tip the cube back so yellow is on top and green faces you again.',
          display: learnDisplay(CORNERS_NONE_HOME, ''),
          stickering: 'Cross',
        },
      ],
      check: {
        text: 'A full white cross, every edge matching its centre - and yellow back on top. 🌉',
        say: 'A full white cross, matching all around, yellow back on top.',
        display: learnDisplay(CORNERS_NONE_HOME, ''),
        stickering: 'Cross',
        backView: true,
      },
      goalCheck: phaseDone('cross'),
      goalPhase: 'cross',
      prereqPhase: 'daisy',
    },
  ],
}

const cornerFind: Lesson = {
  id: 'cornerFind',
  number: 3,
  title: 'Corner Lookout',
  goal: 'Spot a white corner, find its home, and park it above home at the front-right. 🔭',
  story:
    "Before the next big trick, let's go on a corner hunt! Every white corner has a home: the little gap " +
    'between its two other colours. Find it, turn the TOP to park the corner right above it, and hold that home at the front-right.',
  phaseIds: [],
  namedAlgIds: [],
  realCubeHint:
    "On your real cube: find any white corner. It has three colours. Its home is the gap between its other two colours. Turn the TOP until it sits right above that gap, then hold that gap at the front-right.",
  checkpoint: {
    look: 'A white cross on the BOTTOM, and each cross edge matches the centre beside it (little upside-down T shapes on every side)',
    hold: 'White on the BOTTOM now, yellow on top',
    say: 'Check your cube. Flip it over and peek underneath - do you see a white cross with T shapes matching all around? Keep white on the bottom and yellow on top.',
    display: learnDisplay(CORNERS_NONE_HOME, ''),
    stickering: 'Cross',
    backView: true,
    fallbackHoldId: 'cross',
  },
  missions: [
    {
      id: 'K1',
      title: 'Find a white corner and its home',
      estimatedMinutes: 4,
      look: {
        title: 'Corners have THREE colours',
        text: 'An edge has two colours, but a corner has three. Every corner with WHITE on it belongs downstairs, tucked under your white cross.',
        say: 'A corner has three colours. Every corner with white on it belongs in the bottom layer.',
        display: learnDisplay('', ''),
        backView: true,
      },
      steps: [
        {
          kind: 'do',
          title: 'Where is home?',
          text: "A white corner's home is the gap between its OTHER two colours - the spot where those two centres meet. Find the gap first, then match the corner to it.",
          say: "A white corner's home is the gap between its other two colours, where those two centres meet.",
          display: learnDisplay(invertAlg(ELEVATOR), ''),
          followAlong: false,
        },
        {
          kind: 'do',
          title: 'The corner is right above its home',
          text: 'See? The corner is sitting right above the gap where its home is. That is exactly what you are looking for.',
          say: 'The corner is sitting right above the gap where its home is.',
          display: learnDisplay(invertAlg(ELEVATOR), ''),
          backView: true,
          followAlong: false,
        },
      ],
      check: {
        text: 'Point to a white corner, and point to its home - the gap between its two other colours.',
        say: 'Point to a white corner, and point to its home.',
        display: caseDisplay(ELEVATOR),
      },
      goalCheck: selfReport(),
      prereqPhase: 'cross',
    },
    {
      id: 'K2',
      title: 'Park it above home, front-right',
      estimatedMinutes: 4,
      look: {
        title: 'Park it above home',
        text: 'Turn the TOP layer, only the top, until the white corner sits directly above its home gap. Do not move anything else yet!',
        say: 'Turn only the top layer until the white corner sits directly above its home gap.',
        display: learnDisplay(`${invertAlg(ELEVATOR)} U`, "U'"),
      },
      steps: [
        {
          kind: 'do',
          title: 'Hold home at the front-right',
          text: 'Once it is parked above home, hold that gap at the FRONT-RIGHT of the cube. That is exactly where the next wall expects it.',
          say: 'Hold the home gap at the front-right of the cube.',
          display: learnDisplay(`${invertAlg(ELEVATOR)} U`, "U'"),
        },
        {
          kind: 'practice',
          prompt: 'Turn the top - one click, or back, or twice - to park a corner above its home.',
          say: 'Turn the top layer until the corner sits right above its home.',
          sequence: 'U',
          sequences: ['U', "U'", 'U2'],
        },
      ],
      check: {
        text: 'White sticker pointing right, front, or up all fine - as long as the corner sits right above its home, held at the front-right.',
        say: 'It does not matter which way the white sticker points, as long as the corner sits right above its home.',
        display: caseDisplay(repeatAlg(ELEVATOR, 3)),
      },
      goalCheck: selfReport(),
      prereqPhase: 'cross',
    },
  ],
}

const corners: Lesson = {
  id: 'corners',
  number: 4,
  title: 'Corner Crack',
  goal: 'All four white corners tucked into the bottom, matching the colours around them. 📦',
  story:
    "You already know how to find a white corner's home and park it above home at the front-right. Now for the fun part: " +
    'The Elevator trick 🛗 rides it down home. Click, click, click! Do it again and again until it pops into place.',
  phaseIds: ['corners'],
  namedAlgIds: ['elevator'],
  realCubeHint:
    "On your real cube: find a white corner on the top layer. Put its home spot right below it. Do the Elevator (R U R' U') again and again until the white sticker faces down.",
  checkpoint: {
    look: 'A white cross on the BOTTOM with matching T shapes, and a white corner parked above its home at the front-right',
    hold: 'White on the BOTTOM, yellow on TOP, green facing you',
    say: 'Check your cube. White cross on the bottom? Good - now find a white corner, park it above home, and hold that home at the front-right.',
    display: learnDisplay(CORNERS_NONE_HOME, ''),
    stickering: 'Cross',
    backView: true,
    fallbackHoldId: 'cornerFind',
  },
  missions: [
    {
      id: 'E1',
      title: 'Elevator one corner down',
      estimatedMinutes: 4,
      look: {
        title: 'Ready to ride',
        text: 'You already found a white corner and parked it above home, held at the front-right. Now do The Elevator!',
        say: 'Hold the home gap at the front-right and do the Elevator.',
        display: caseDisplay(ELEVATOR),
      },
      steps: [
        {
          kind: 'do',
          title: 'One Elevator ride',
          text: 'Right side UP, top LEFT, right side DOWN, top RIGHT. That is one ride. Watch the white corner!',
          say: 'Right side up, top left, right side down, top right. That is one ride. Watch the white corner.',
          display: caseDisplay(ELEVATOR),
          namedAlgId: 'elevator',
        },
        {
          kind: 'do',
          title: 'Sometimes it takes three rides',
          text: 'Not down yet? Ride again. Sometimes it takes three rides. Do not turn the whole cube around in the middle!',
          say: 'Not down yet? Ride again. Sometimes that takes three rides.',
          display: caseDisplay(repeatAlg(ELEVATOR, 3)),
          namedAlgId: 'elevator',
          followAlong: false,
        },
      ],
      check: {
        text: 'At least one white corner tucked home, matching the colours around it.',
        say: 'Is at least one white corner tucked home?',
        display: learnDisplay(POP_THREE_CORNERS, ''),
      },
      goalCheck: atLeast(countWhiteCorners, 1, 'corners tucked', 'cross'),
      goalPhase: 'corners',
      prereqPhase: 'cross',
    },
    {
      id: 'E2',
      title: 'Second corner',
      estimatedMinutes: 4,
      look: {
        title: 'Find the next one',
        text: 'Great! Now find another white corner still up top, park it above ITS home, front-right, and ride the Elevator again.',
        say: 'Find another white corner, park it above its home, and ride the Elevator again.',
        display: learnDisplay(POP_THREE_CORNERS, ''),
      },
      steps: [
        {
          kind: 'do',
          title: 'Same trick, new corner',
          text: 'Park the next white corner above ITS home, hold it front-right, and ride the Elevator until white points down.',
          say: 'Park the next white corner above its home, hold it front-right, and ride the Elevator until white points down.',
          display: caseDisplay(ELEVATOR),
          namedAlgId: 'elevator',
        },
      ],
      check: {
        text: 'Two white corners tucked home now?',
        say: 'Are two white corners tucked home?',
        display: learnDisplay(POP_TWO_CORNERS, ''),
      },
      goalCheck: atLeast(countWhiteCorners, 2, 'corners tucked', 'cross'),
      goalPhase: 'corners',
      prereqPhase: 'cross',
    },
    {
      id: 'E3',
      title: 'All four corners',
      estimatedMinutes: 5,
      look: {
        title: 'Two corners to go',
        text: 'Keep going the same way: find a white corner, park it above home at the front-right, ride the Elevator until white points down.',
        say: 'Keep going: find, park, ride the Elevator.',
        display: learnDisplay(POP_TWO_CORNERS, ''),
      },
      steps: [
        {
          kind: 'pick',
          title: 'Which one looks like yours?',
          text: 'One white corner left. Is it already on top, or stuck downstairs twisted the wrong way?',
          say: 'Is the last white corner already on top, or stuck downstairs twisted the wrong way?',
          options: [
            {
              label: 'On top, above home',
              display: stillOf(caseDisplay(repeatAlg(ELEVATOR, 3))),
              then: [
                {
                  kind: 'do',
                  title: 'Ride the Elevator until it drops in',
                  text: 'Same trick as before: keep doing The Elevator until the white sticker points DOWN.',
                  say: 'Keep doing the Elevator until the white sticker points down.',
                  display: caseDisplay(repeatAlg(ELEVATOR, 3)),
                  namedAlgId: 'elevator',
                  followAlong: false,
                },
              ],
            },
            {
              label: 'Stuck downstairs, twisted',
              display: stillOf(learnDisplay(CORNER_CASE_STUCK, ELEVATOR)),
              then: [
                {
                  kind: 'do',
                  title: 'Pop it back up first',
                  text: 'If the last corner is already down but twisted, remember: ONE Elevator pops it back up, then bring it home properly.',
                  say: 'A twisted corner already downstairs needs one Elevator to pop it back up first.',
                  display: learnDisplay(CORNER_CASE_STUCK, ELEVATOR),
                  namedAlgId: 'elevator',
                },
              ],
            },
          ],
        },
      ],
      check: {
        text: 'A white cross with all four corners tucked home, matching all around. Every side of the bottom two rows is solid!',
        say: 'All four white corners are tucked home, matching all around.',
        display: learnDisplay(CORNERS_NONE_HOME, ''),
        stickering: 'F2L',
      },
      goalCheck: phaseDone('corners'),
      goalPhase: 'corners',
      prereqPhase: 'cross',
    },
  ],
}

const middle: Lesson = {
  id: 'middle',
  number: 5,
  title: 'Middle Traverse',
  goal: 'Tuck every middle edge next to its matching colour. No yellow anywhere but the top!',
  story:
    "Almost at the yellow layer! Edges on top with no yellow on them belong in the middle row. " +
    "Send it Right if the edge wants to go right. Send it Left if it wants to go left. Easy peasy!",
  phaseIds: ['middle'],
  namedAlgIds: ['goRight', 'goLeft'],
  realCubeHint:
    'On your real cube: find a top edge with no yellow sticker. Look at its front colour and decide, does it slide home to the right or the left?',
  checkpoint: {
    look: 'The whole bottom layer is solved: white on the bottom and a full band of one colour on every side',
    hold: 'White on the bottom, yellow on top, green facing you',
    say: 'Check your cube. Is the whole bottom layer solved - white cross, white corners, and a matching band of colour all around? The top can still look messy.',
    display: learnDisplay(BOTTOM_LAYER_DONE_TOP_MESSY, ''),
    stickering: 'F2L',
    fallbackHoldId: 'corners',
  },
  missions: [
    {
      id: 'M1',
      title: 'Find a middle edge and line it up',
      estimatedMinutes: 3,
      look: {
        title: 'No yellow? It lives in the middle',
        text: 'Two layers are done, hooray! Any edge on top with NO yellow on it does not belong there - it belongs in the middle row.',
        say: 'An edge on top with no yellow on it belongs in the middle row.',
        display: learnDisplay('', ''),
        stickering: 'F2L',
      },
      steps: [
        {
          kind: 'do',
          title: 'Line it up first',
          text: "Turn the TOP until the edge's front colour matches the front centre. Look, a little T shape! Now you can see where it wants to go.",
          say: 'Turn the top until the front colour of the edge matches the front centre. That makes a little T.',
          display: learnDisplay(invertAlg(GO_RIGHT) + " U'", 'U'),
        },
      ],
      check: {
        text: 'Point to a top edge with no yellow on it, lined up in a little T with the front colour.',
        say: 'Point to a top edge with no yellow, lined up with the front colour.',
        display: learnDisplay(invertAlg(GO_RIGHT), ''),
      },
      goalCheck: selfReport(),
      prereqPhase: 'corners',
    },
    {
      id: 'M2',
      title: 'Send it Right',
      estimatedMinutes: 4,
      look: {
        title: 'Top colour on the RIGHT side? Send it Right',
        text: 'Green matches the front. The colour on TOP of that edge is orange, and orange lives on the RIGHT. This edge wants to go right, so do Send it Right!',
        say: 'The top colour is orange, and orange is the right side. Do Send it Right.',
        display: caseDisplay(GO_RIGHT),
      },
      steps: [
        {
          kind: 'do',
          title: 'Send it Right',
          text: 'Line it up so the front colours match, then Send it Right. Eight moves - follow along!',
          say: 'Line it up so the front colours match, then send it right.',
          display: caseDisplay(GO_RIGHT),
          namedAlgId: 'goRight',
        },
      ],
      check: {
        text: 'At least one middle edge tucked home, matching both colours beside it.',
        say: 'Is at least one middle edge tucked home?',
        display: learnDisplay(POP_THREE_MIDDLE, ''),
        stickering: 'F2L',
      },
      goalCheck: atLeast(countMiddleEdges, 1, 'edges home', 'corners'),
      goalPhase: 'middle',
      prereqPhase: 'corners',
    },
    {
      id: 'M3',
      title: 'Send it Left',
      estimatedMinutes: 4,
      look: {
        title: 'Top colour on the LEFT side? Send it Left',
        text: 'Green matches the front again. This time the top colour is red, and red lives on the LEFT. So do Send it Left, the mirror move!',
        say: 'The top colour is red, and red is the left side. Do Send it Left.',
        display: caseDisplay(GO_LEFT),
      },
      steps: [
        {
          kind: 'do',
          title: 'Send it Left',
          text: 'Line it up so the front colours match - this time the top colour lives on the LEFT, so Send it Left - the mirror of Send it Right.',
          say: 'Line it up so the front colours match, then send it left - the mirror of send it right.',
          display: caseDisplay(GO_LEFT),
          namedAlgId: 'goLeft',
        },
      ],
      check: {
        text: 'Two middle edges tucked home now, on their own matching colours.',
        say: 'Are two middle edges tucked home?',
        display: learnDisplay(BOTTOM_LAYER_DONE_TOP_MESSY, ''),
        stickering: 'F2L',
      },
      goalCheck: atLeast(countMiddleEdges, 2, 'edges home', 'corners'),
      goalPhase: 'middle',
      prereqPhase: 'corners',
    },
    {
      id: 'M4',
      title: 'All four, no yellow but the top',
      estimatedMinutes: 5,
      look: {
        title: 'Two more middle spots',
        text: 'Keep hunting: any edge on top with no yellow belongs in the middle. Line it up, Send it Right or Left, until the whole middle band is done.',
        say: 'Keep hunting for edges with no yellow and sending them home.',
        display: learnDisplay(BOTTOM_LAYER_DONE_TOP_MESSY, ''),
        stickering: 'F2L',
      },
      steps: [
        {
          kind: 'pick',
          title: 'Which one looks like yours?',
          text: 'One middle spot left. Is the edge waiting on top with no yellow, or already stuck in the wrong middle spot?',
          say: 'Is the last edge waiting on top with no yellow, or already stuck in the wrong middle spot?',
          options: [
            {
              label: 'An edge on top, no yellow',
              display: stillOf(caseDisplay(GO_RIGHT)),
              then: [
                {
                  kind: 'do',
                  title: 'Send it home',
                  text: 'Line it up with the front colour, check where its top colour lives, then Send it Right or Send it Left.',
                  say: 'Line it up, check its top colour, then send it right or send it left.',
                  display: caseDisplay(GO_RIGHT),
                  namedAlgId: 'goRight',
                },
              ],
            },
            {
              label: 'Stuck in the wrong middle spot',
              display: stillOf(learnDisplay(MIDDLE_CASE_STUCK, GO_RIGHT)),
              then: [
                {
                  kind: 'do',
                  title: 'Fill all four middle spots',
                  text: 'When you cannot find a no-yellow edge on top, one wrong edge might be stuck downstairs - do Send it Right once to pop it back up, then send it home properly.',
                  say: 'If you cannot find a no-yellow edge on top, one might be stuck in the middle already - pop it up first.',
                  display: learnDisplay(MIDDLE_CASE_STUCK, GO_RIGHT),
                  namedAlgId: 'goRight',
                },
              ],
            },
          ],
        },
      ],
      check: {
        text: 'The whole bottom TWO layers are solved - no yellow sticker anywhere but the very top!',
        say: 'The whole bottom two layers are solved - no yellow anywhere but the top.',
        display: learnDisplay(YELLOW_CROSS_DOT_ALG, ''),
        stickering: 'F2L',
      },
      goalCheck: phaseDone('middle'),
      goalPhase: 'middle',
      prereqPhase: 'corners',
    },
  ],
}

const yellowCross: Lesson = {
  id: 'yellowCross',
  number: 6,
  title: 'Yellow Cross Ridge',
  goal: 'A yellow cross on top! Four yellow edges pointing out from the yellow centre. ☀️',
  story:
    'Look at the top. Is it a dot, an L, or a line? ' +
    'The Yellow Cross trick turns any of those into a full cross. Dot, then L, then line, then cross! Ta-da!',
  phaseIds: ['yellowCross'],
  namedAlgIds: ['yellowCross'],
  realCubeHint:
    "On your real cube: hold the L shape in the top-left, or the line going straight across. Then do F R U R' U' F'. See a dot? Just do it again.",
  checkpoint: {
    look: 'Two layers solved, only the top is messy',
    hold: 'Yellow on top, green facing you',
    say: 'Check your cube. Are the bottom two layers completely solved, a solid colour band all the way around? Only the top should look messy.',
    display: learnDisplay(YELLOW_CROSS_DOT_ALG, ''),
    stickering: 'F2L',
    fallbackHoldId: 'middle',
  },
  missions: [
    {
      id: 'Y1',
      title: 'Dot, L or line? Do the trick once',
      estimatedMinutes: 4,
      look: {
        title: 'Dot, L, or line?',
        text: 'Look ONLY at the four edges around the yellow centre. Corners do not count yet! No yellow edges at all is a DOT. Two next to each other is an L. Two across from each other is a line.',
        say: 'Look only at the four edges around the yellow centre. No yellow at all is a dot.',
        display: learnDisplay(invertAlg(YC_DOT_FIX), ''),
        stickering: 'EOLL',
      },
      steps: [
        {
          kind: 'pick',
          title: 'Dot, L, or line?',
          text: 'Look at the four edges around the yellow centre. Which shape matches yours?',
          say: 'Look at the four edges around the yellow centre. Which shape matches yours - a dot, an L, or a line?',
          options: [
            {
              label: 'A dot (no yellow edges up top)',
              display: stillOf(learnDisplay(invertAlg(YC_DOT_FIX), YELLOW_CROSS)),
              then: [
                {
                  kind: 'do',
                  title: 'The dot',
                  text: 'No yellow edges standing up at all? Just do the Yellow Cross trick once. Watch it turn into an L!',
                  say: 'No yellow edges standing up at all. Do the Yellow Cross trick once and watch it turn into an L.',
                  display: learnDisplay(invertAlg(YC_DOT_FIX), YELLOW_CROSS),
                  stickering: 'EOLL',
                  namedAlgId: 'yellowCross',
                },
              ],
            },
            {
              label: 'An L (two next to each other)',
              display: stillOf(caseDisplay(YC_L_FIX)),
              then: [
                {
                  kind: 'do',
                  title: 'The L',
                  text: "Two yellow edges NEXT TO each other make an L. Turn the top until the L points BACK and LEFT. Now do the Yellow Cross trick.",
                  say: 'Two yellow edges next to each other make an L. Hold the L pointing back and left, then do the trick.',
                  display: caseDisplay(YC_L_FIX),
                  stickering: 'EOLL',
                  namedAlgId: 'yellowCross',
                  followAlong: false,
                },
              ],
            },
            {
              label: 'A line (two across from each other)',
              display: stillOf(caseDisplay(YC_LINE_FIX)),
              then: [
                {
                  kind: 'do',
                  title: 'The line',
                  text: 'Two yellow edges ACROSS from each other make a line. Hold it going LEFT to RIGHT. Do the Yellow Cross trick once.',
                  say: 'Two yellow edges across from each other make a line. Hold it left to right and do the trick once.',
                  display: caseDisplay(YC_LINE_FIX),
                  stickering: 'EOLL',
                  namedAlgId: 'yellowCross',
                },
              ],
            },
          ],
        },
      ],
      check: {
        text: 'Did the shape grow? Dot became an L, L became a line, or line became a full cross.',
        say: 'Did the shape grow - dot to L, L to line, or line to cross?',
        display: learnDisplay(YELLOW_CROSS, ''),
        stickering: 'EOLL',
      },
      goalCheck: (state) => ({ done: yellowCrossShape(state) !== 'dot' && isPhaseDone(state, 'middle') }),
      goalPhase: 'yellowCross',
      prereqPhase: 'middle',
    },
    {
      id: 'Y2',
      title: 'Finish the yellow cross',
      estimatedMinutes: 4,
      look: {
        title: 'A dot needs it up to three times',
        text: 'From a dot: do the trick and get an L. Turn the top so the L points back and left, do it again for a line, then once more for the cross. The rest of the cube looks wild in between. Do not worry, that is normal!',
        say: 'From a dot, do the trick three times: dot, then L, then line, then cross.',
        display: caseDisplay(YC_DOT_FIX),
        checklist: [
          'On your cube: hold it yellow up and look at the top',
          'Dot, L, or line?',
          'L: turn the top so it points back and left',
          'Line: hold it going left to right',
          'Do the Yellow Cross trick and then look again',
        ],
      },
      steps: [
        {
          kind: 'practice',
          prompt: 'Tap out the Yellow Cross trick once.',
          say: 'Front turn, right side up, top left, right side down, top right, front turn back.',
          sequence: "F R U R' U' F'",
        },
      ],
      check: {
        text: 'A full yellow cross - four yellow edges pointing out from the yellow centre. ☀️',
        say: 'A full yellow cross on top.',
        display: learnDisplay(invertAlg(EDGES_ADJACENT_FIX), ''),
        stickering: 'EOLL',
      },
      goalCheck: phaseDone('yellowCross'),
      goalPhase: 'yellowCross',
      prereqPhase: 'middle',
    },
  ],
}

const yellowEdges: Lesson = {
  id: 'yellowEdges',
  number: 7,
  title: 'Edge Ledge',
  goal: 'Match every yellow-top edge to the colour beside it. (Corners can still look silly, that is next!)',
  story:
    "Your yellow cross is glowing! Now let's line up its edges. Turn the top until two of them match their side colours. " +
    'If those two sit right next to each other, hold them at the back and the right. Then do the Fish 🐟 to fix the rest.',
  phaseIds: ['yellowEdges'],
  namedAlgIds: ['fish'],
  realCubeHint:
    "On your real cube: keep the yellow cross on top. Turn the top layer until two edges match the colour beside them. Side by side? Put them at the back and right, then do the Fish (R U R' U R U2 R').",
  checkpoint: {
    look: 'A yellow cross on top',
    hold: 'Yellow on top, green facing you',
    say: 'Check your cube. Do you see a full yellow cross on top? The edges do not need to match yet - just the cross shape.',
    display: learnDisplay(invertAlg(EDGES_ADJACENT_FIX), ''),
    stickering: 'ELL',
    fallbackHoldId: 'yellowCross',
  },
  missions: [
    {
      id: 'YE1',
      title: 'Two edges match',
      estimatedMinutes: 4,
      look: {
        title: 'Match the edges to their centres',
        text: 'Your yellow cross is done, hooray! Now look at the SIDE colour of each yellow edge, and the centre below it. Turn the TOP until as many as you can match up.',
        say: 'Turn the top until as many yellow edges as possible match the centre below them.',
        display: learnDisplay(invertAlg(EDGES_ADJACENT_FIX), ''),
        stickering: 'ELL',
      },
      steps: [
        {
          kind: 'pick',
          title: 'Which one looks like yours?',
          text: 'Two yellow edges match their centres. Are they sitting right next to each other, or across from each other?',
          say: 'Are the two matching edges sitting right next to each other, or across from each other?',
          options: [
            {
              label: 'Two matching, next to each other',
              display: stillOf(caseDisplay(EDGES_ADJACENT_FIX)),
              then: [
                {
                  kind: 'do',
                  title: 'Two matching, next to each other',
                  text: 'These two already match and sit right next door to each other. Hold them at the BACK and the RIGHT, then do the Fish and turn the top to finish.',
                  say: 'Hold the two matching edges at the back and the right, then do the Fish and turn the top to finish.',
                  display: caseDisplay(EDGES_ADJACENT_FIX),
                  stickering: 'ELL',
                  namedAlgId: 'fish',
                },
              ],
            },
            {
              label: 'Two matching, across from each other',
              display: stillOf(learnDisplay(invertAlg(EDGES_OPPOSITE_FIX), FISH)),
              then: [
                {
                  kind: 'do',
                  title: 'Two matching, across from each other',
                  text: 'These two match, but they sit across from each other. No back-and-right pair to hold yet! Do the Fish once anywhere, then look again.',
                  say: 'If the two matching edges are across from each other, do the Fish once anywhere and look again.',
                  display: learnDisplay(invertAlg(EDGES_OPPOSITE_FIX), FISH),
                  stickering: 'ELL',
                  namedAlgId: 'fish',
                },
              ],
            },
          ],
        },
      ],
      check: {
        text: 'At least two yellow edges matching the colour beside them.',
        say: 'Are two yellow edges matching the colour beside them?',
        display: learnDisplay(EDGES_ADJACENT_FIX, ''),
        stickering: 'ELL',
      },
      goalCheck: atLeast(countYellowEdgesAligned, 2, 'edges matched', 'yellowCross'),
      goalPhase: 'yellowEdges',
      prereqPhase: 'yellowCross',
    },
    {
      id: 'YE2',
      title: 'The Fish until all four match',
      estimatedMinutes: 5,
      look: {
        title: 'Two matching, side by side',
        text: 'Here the BACK edge and the RIGHT edge both match their centres. Hold those two at the back and the right. Do the Fish, then turn the top to line everything up.',
        say: 'Two matching edges next to each other. Hold them at the back and the right and do the Fish.',
        display: caseDisplay(EDGES_ADJACENT_FIX),
        stickering: 'ELL',
        checklist: [
          'On your cube: turn the top until two edges match their centres',
          'Are they side by side, or across from each other?',
          'Side by side: hold them at the BACK and the RIGHT',
          'Across: do the Fish once anywhere, then look again',
          'Do the Fish, then turn the top to finish the line-up',
        ],
      },
      steps: [
        {
          kind: 'practice',
          prompt: 'Tap out the Fish trick once.',
          say: 'Right side up, top left, right side down, top left, right side up, top twice, right side down.',
          sequence: "R U R' U R U2 R'",
        },
      ],
      check: {
        text: 'All four yellow edges match the colour beside them - the yellow layer edges are done!',
        say: 'All four yellow edges match the colour beside them.',
        display: learnDisplay(invertAlg(CORNER_SWAP), ''),
        stickering: 'ELL',
      },
      goalCheck: phaseDone('yellowEdges'),
      goalPhase: 'yellowEdges',
      prereqPhase: 'yellowCross',
    },
  ],
}

const cornerPosition: Lesson = {
  id: 'cornerPosition',
  number: 8,
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
  checkpoint: {
    look: 'Yellow cross on top and every cross edge matches the centre under it',
    hold: 'Yellow on top, green facing you',
    say: 'Check your cube. Yellow cross on top, and every edge matches the colour beside it? You are ready for corners.',
    display: learnDisplay(invertAlg(CORNER_SWAP), ''),
    stickering: 'CPLL',
    fallbackHoldId: 'yellowEdges',
  },
  missions: [
    {
      id: 'P1',
      title: 'Find a corner that is home',
      estimatedMinutes: 4,
      look: {
        title: 'When is a corner HOME?',
        text: 'A corner is HOME when its three colours match the three centres around it, even if it is twisted the wrong way. Twisted is fine for now! Go hunt for one that is home.',
        say: 'A corner is home when its three colours match the three centres around it, even if it is twisted.',
        display: learnDisplay(invertAlg(CORNER_SWAP), ''),
        stickering: 'CPLL',
      },
      steps: [
        {
          kind: 'do',
          title: 'No corner home? Do it once anyway',
          text: 'Sometimes NO corner is home. Do not worry! Do Corner Swap once with any corner at the front-right. Look again and one corner will be home.',
          say: 'If no corner is home, do Corner Swap once anywhere, then look again.',
          display: learnDisplay(CORNERS_NONE_HOME, CORNER_SWAP),
          stickering: 'CPLL',
          namedAlgId: 'cornerCycle',
        },
      ],
      check: {
        text: 'At least one corner home - its three colours match the three centres around it.',
        say: 'Is at least one corner home?',
        display: learnDisplay(CORNER_SWAP, ''),
        stickering: 'CPLL',
      },
      goalCheck: atLeast(countCornersPositioned, 1, 'corners home', 'yellowEdges'),
      goalPhase: 'cornerPosition',
      prereqPhase: 'yellowEdges',
    },
    {
      id: 'P2',
      title: 'Corner Swap until all home',
      estimatedMinutes: 5,
      look: {
        title: 'One corner home? Hold it at the front-right',
        text: 'The front-right corner here is already home. Keep it right there and do Corner Swap. The other three walk around it! Look again, you might need it one more time.',
        say: 'Hold the corner that is already home at the front right, then do Corner Swap and look again.',
        display: caseDisplay(CORNER_SWAP),
        stickering: 'CPLL',
      },
      steps: [
        {
          kind: 'practice',
          prompt: 'Tap out Corner Swap once.',
          say: 'Top left, right side up, top right, left side back, top left, right side down, top right, left side forward.',
          sequence: "U R U' L' U R' U' L",
        },
      ],
      check: {
        text: 'Every corner sits in its own spot now (twisted colours are still fine) - ready for the very last trick!',
        say: 'Every corner sits in its own spot now.',
        display: learnDisplay(SUMMIT_SETUP, ''),
        stickering: 'OCLL',
      },
      goalCheck: phaseDone('cornerPosition'),
      goalPhase: 'cornerPosition',
      prereqPhase: 'yellowEdges',
    },
  ],
}

const cornerOrient: Lesson = {
  id: 'cornerOrient',
  number: 9,
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
  checkpoint: {
    look: 'Every corner sits in its own spot (its three colours match the centres around it), some may be twisted',
    hold: 'Yellow on top, green facing you',
    say: 'Check your cube. Is every corner in the right spot, even if some show the wrong colour on top? You are on the summit doorstep.',
    display: learnDisplay(SUMMIT_SETUP, ''),
    stickering: 'OCLL',
    fallbackHoldId: 'cornerPosition',
  },
  missions: [
    {
      id: 'S1',
      title: 'Bottom Elevator on one corner',
      estimatedMinutes: 5,
      look: {
        title: 'Every corner is home - some are just twisted',
        text: 'Look at the top. Every corner is in the right SPOT, but some do not show yellow on top yet. Find one that is not yellow and hold it at the front-right.',
        say: 'Every corner is in the right spot, but some are twisted. Hold one that is not yellow on top at the front right.',
        display: learnDisplay(SUMMIT_SETUP, ''),
        stickering: 'OCLL',
      },
      steps: [
        {
          kind: 'do',
          title: 'Two rides of the Bottom Elevator',
          text: 'Do the Bottom Elevator twice. Count out loud: one, two! Look, yellow comes up on that front-right corner.',
          say: 'Do the Bottom Elevator two times and watch yellow come up on the front right corner.',
          display: learnDisplay(SUMMIT_SETUP, repeatAlg(BOTTOM_ELEVATOR, 2)),
          namedAlgId: 'cornerTwist',
        },
        {
          kind: 'do',
          title: 'It looks broken - keep going!',
          text: 'Uh oh, the middle of the cube looks messy right now! Do not worry. That is totally normal and it fixes itself at the end. Never turn the whole cube around, just keep riding.',
          say: 'The bottom will look broken in the middle of this. That is normal - keep going and it fixes itself.',
          display: learnDisplay(SUMMIT_SETUP + ' ' + BOTTOM_ELEVATOR, ''),
        },
        {
          kind: 'do',
          title: 'Sometimes it takes four rides',
          text: 'This corner needs the Bottom Elevator FOUR times. Count in twos: two, four! Now yellow is up. It is always two or four, never three.',
          say: 'This corner needs the Bottom Elevator four times. Count in twos: two, four.',
          display: learnDisplay(SUMMIT_SETUP + ' ' + repeatAlg(BOTTOM_ELEVATOR, 2) + ' U', repeatAlg(BOTTOM_ELEVATOR, 4)),
          namedAlgId: 'cornerTwist',
          followAlong: false,
        },
      ],
      check: {
        text: 'Did yellow come up on that corner? Two rides, or four - never three.',
        say: 'Did yellow come up on that corner?',
        display: caseDisplay(BOTTOM_ELEVATOR),
      },
      // Mid-phase counting is deliberately unsafe here (the solver comment on
      // solveCornerOrient warns the bottom is scrambled between rides), so
      // this one stays a self-report, no camera check.
      goalCheck: selfReport(),
    },
    {
      id: 'S2',
      title: 'SUMMIT!',
      estimatedMinutes: 6,
      look: {
        title: 'Turn ONLY the top',
        text: 'That corner shows yellow now, yay! Turn ONLY the top layer to bring the next twisted corner round to the front-right. Do not turn anything else!',
        say: 'Turn only the top layer to bring the next twisted corner to the front right.',
        display: learnDisplay(SUMMIT_SETUP + ' ' + repeatAlg(BOTTOM_ELEVATOR, 2), 'U'),
      },
      steps: [
        {
          kind: 'do',
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
            'Do the Bottom Elevator two times, or four, until yellow is up',
            'Turn ONLY the top to bring the next corner to the front-right',
            'Repeat until every corner shows yellow',
            'One last turn of the top - SOLVED!',
          ],
        },
      ],
      check: {
        text: 'A FULLY SOLVED CUBE. Every side is one colour. You climbed the whole wall! 🏔️',
        say: 'A fully solved cube. You climbed the whole wall!',
        display: learnDisplay('', ''),
      },
      goalCheck: phaseDone('cornerOrient'),
      goalPhase: 'cornerOrient',
      prereqPhase: 'cornerPosition',
    },
  ],
}

export const LESSONS: Record<HoldId, Lesson> = {
  basecamp,
  daisy,
  cross,
  cornerFind,
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

/** Which hold teaches a given solver phase (Wall/HelpMyCube use this to link
 * a phase back to its hold). Returns the FIRST hold in wall order whose
 * phaseIds includes it - 'cornerFind' deliberately carries no phaseIds (see
 * the PhaseId doc comment), so a 'corners' phase always resolves to the
 * 'corners' hold, never the knowledge-only lookout hold before it. */
export function holdForPhase(phase: PhaseId): Lesson | undefined {
  return LESSON_LIST.find((l) => l.phaseIds.includes(phase))
}

/** All namedAlgIds referenced anywhere in the curriculum, for tests. */
export function allNamedAlgIds(): string[] {
  return LESSON_LIST.flatMap((l) => l.namedAlgIds)
}

/** The mission with this id within a given hold, if any. */
export function missionById(holdId: string, missionId: string): Mission | undefined {
  return lessonById(holdId)?.missions.find((m) => m.id === missionId)
}

/** The id of the mission right after `missionId` within `lesson`, if any. */
export function nextMissionId(lesson: Lesson, missionId: string): string | undefined {
  const i = lesson.missions.findIndex((m) => m.id === missionId)
  return i >= 0 && i + 1 < lesson.missions.length ? lesson.missions[i + 1].id : undefined
}

/** Every mission id across the whole curriculum, in wall/mission order. Frozen by a test - these are progress keys. */
export const ALL_MISSION_IDS: string[] = LESSON_LIST.flatMap((l) => l.missions.map((m) => m.id))

// Re-exported so screens can go straight to the shared source of truth.
export { NAMED_ALGS }
