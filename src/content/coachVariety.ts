// Keeps the AI coach's notes from feeling repetitive. Two independent,
// deterministic picks - a THEME (the angle worth leaning into today, when the
// numbers support it) and a VOICE (flavour of how it's said, never a reason
// to bend the truth rules) - are derived from the calendar day so the same
// day always renders the same combination, but the combination itself
// changes most days. A separate `similarity`/`tooSimilar` pair lets
// src/store/coach.ts (Claude path) and src/content/coachPhrases.ts (rules
// path) both check a freshly-written note against her recent ones before
// using it.

export interface CoachTheme {
  id: string
  label: string
  /** One sentence for the prompt: what this angle means and when it fits. */
  description: string
}

export interface CoachVoice {
  id: string
  label: string
  /** One sentence for the prompt: the flavour this voice adds. */
  description: string
}

export const THEMES: readonly CoachTheme[] = [
  {
    id: 'rhythm-flow',
    label: 'rhythm & flow',
    description: 'Notice how evenly the playing moved from one part to the next, when the pause and pace numbers back that up.',
  },
  {
    id: 'quiet-loud',
    label: 'quiet & loud',
    description: 'Notice the contrast between soft and strong playing, when the loud-to-soft range number is there to point to.',
  },
  {
    id: 'tricky-spot',
    label: 'the tricky spot',
    description: 'Zoom in on wherever she got stuck or slowed down, and how she handled it, when a sticky spot or pause was actually measured.',
  },
  {
    id: 'endurance-stamina',
    label: 'endurance & stamina',
    description: 'Notice how long she kept going, when playing time is the clearest evidence available.',
  },
  {
    id: 'fun-challenge',
    label: 'a fun challenge',
    description: 'Frame the next step as a playful dare rather than a correction, while still keeping it concrete.',
  },
  {
    id: 'listening-to-yourself',
    label: 'listening to yourself',
    description: 'Notice what she might have felt or heard herself while playing (pausing to reset, catching a soft spot), when the numbers suggest it.',
  },
  {
    id: 'confidence-performance',
    label: 'confidence & performance',
    description: 'Notice how ready the piece sounds to share with someone, when a strong or complete take supports that.',
  },
] as const

export const VOICES: readonly CoachVoice[] = [
  {
    id: 'playful-coach',
    label: 'playful coach',
    description: 'Warm and upbeat, like a coach cheering from the sideline.',
  },
  {
    id: 'curious-scientist',
    label: 'curious scientist',
    description: 'Curious and observational, like someone delighted to notice a pattern in the numbers.',
  },
  {
    id: 'storyteller',
    label: 'storyteller',
    description: 'A touch of narrative - the practice session as a small scene with a beginning and a nice turn.',
  },
  {
    id: 'sports-commentator',
    label: 'sports commentator',
    description: 'Energetic play-by-play energy, calling out the good moments as they happen.',
  },
  {
    id: 'gentle-grandma',
    label: 'gentle grandma-style encourager',
    description: 'Soft, unhurried, and proud - the kind of warmth that never rushes her.',
  },
] as const

// ---------------------------------------------------------------------------
// Deterministic pick from a YYYY-MM-DD day string
// ---------------------------------------------------------------------------

function stableHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Today's theme - a djb2 hash of "theme:<day>" mod THEMES.length, so it's independent of voiceForDay's cycle. */
export function themeForDay(day: string): CoachTheme {
  return THEMES[stableHash(`theme:${day}`) % THEMES.length]
}

/** Today's voice - a djb2 hash of "voice:<day>" mod VOICES.length (a different salt and a different-length cycle than themeForDay, so combinations vary). */
export function voiceForDay(day: string): CoachVoice {
  return VOICES[stableHash(`voice:${day}`) % VOICES.length]
}

// ---------------------------------------------------------------------------
// Similarity - normalised word overlap, used to catch a note that reuses too
// much of a recent one.
// ---------------------------------------------------------------------------

/** Lowercase words of 3+ letters (or apostrophe-joined, e.g. "didn't"), deduplicated. */
function wordsOf(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[a-z']{3,}/g) ?? []
  return new Set(matches)
}

/** Jaccard similarity (0-1) over each text's set of significant lowercase words. Two empty/word-less texts are 0, not 1 - there's nothing to call "similar". */
export function similarity(a: string, b: string): number {
  const wa = wordsOf(a)
  const wb = wordsOf(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let intersection = 0
  for (const w of wa) if (wb.has(w)) intersection++
  const union = wa.size + wb.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** The threshold above which two notes read as "the same idea again" rather than a fresh one. */
export const SIMILARITY_THRESHOLD = 0.6

/** True when `text` is too similar (>= SIMILARITY_THRESHOLD) to any one of `recent`. */
export function tooSimilar(text: string, recent: readonly string[]): boolean {
  return recent.some((r) => similarity(text, r) >= SIMILARITY_THRESHOLD)
}
