/**
 * CubeClimb - cube state engine.
 *
 * A cube state is a 54 character string of facelets in URFDLB (Kociemba) order:
 *
 *   index  0..8  = U face      index  9..17 = R face     index 18..26 = F face
 *   index 27..35 = D face      index 36..44 = L face     index 45..53 = B face
 *
 * Inside a face the stickers are read row by row, left to right, as seen from
 * that face with the standard viewing orientation (U is drawn with B at the top
 * of the picture, D with F at the top, and R/F/L/B with U at the top).  Each
 * character is the letter of the face the sticker belongs to on a solved cube.
 *
 * The unfolded net (facelet numbers) looks like this:
 *
 *                 |  0  1  2 |
 *                 |  3  4  5 |
 *                 |  6  7  8 |
 *      |36 37 38 |18 19 20 | 9 10 11 |45 46 47 |
 *      |39 40 41 |21 22 23 |12 13 14 |48 49 50 |
 *      |42 43 44 |24 25 26 |15 16 17 |51 52 53 |
 *                 |27 28 29 |
 *                 |30 31 32 |
 *                 |33 34 35 |
 *
 * Every move is stored as a permutation table.  The six face turns are written
 * out as explicit facelet cycles, everything else (primes, doubles, slices,
 * wide turns, whole cube rotations) is derived from them.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export const SOLVED =
  'UUUUUUUUU' + 'RRRRRRRRR' + 'FFFFFFFFF' + 'DDDDDDDDD' + 'LLLLLLLLL' + 'BBBBBBBBB';

export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** The 9 facelet indices of a face, in reading order. */
export function facePositions(face: Face): number[] {
  const i = FACE_ORDER.indexOf(face);
  if (i < 0) throw new Error('Unknown face: ' + face);
  const out: number[] = [];
  for (let k = 0; k < 9; k++) out.push(i * 9 + k);
  return out;
}

/* ------------------------------------------------------------------ *
 * Permutation plumbing
 * ------------------------------------------------------------------ */

/** `perm[i] === j` means: the sticker sitting at index i travels to index j. */
type Perm = number[];

const IDENTITY: Perm = Array.from({ length: 54 }, (_, i) => i);

function assertPerm(p: Perm): Perm {
  const seen = new Set(p);
  if (p.length !== 54 || seen.size !== 54) {
    throw new Error('Broken permutation table (not a bijection)');
  }
  return p;
}

function permFromCycles(cycles: number[][]): Perm {
  const p = IDENTITY.slice();
  for (const cycle of cycles) {
    for (let k = 0; k < cycle.length; k++) {
      p[cycle[k]] = cycle[(k + 1) % cycle.length];
    }
  }
  return assertPerm(p);
}

function permFromPairs(pairs: Array<[number, number]>): Perm {
  const p = IDENTITY.slice();
  for (const pair of pairs) p[pair[0]] = pair[1];
  return assertPerm(p);
}

function applyPerm(state: string, p: Perm): string {
  const out = new Array<string>(54);
  for (let i = 0; i < 54; i++) out[p[i]] = state[i];
  return out.join('');
}

/** Permutation for "do `first`, then `second`". */
function composePerm(first: Perm, second: Perm): Perm {
  const out = new Array<number>(54);
  for (let i = 0; i < 54; i++) out[i] = second[first[i]];
  return out;
}

function invertPerm(p: Perm): Perm {
  const out = new Array<number>(54);
  for (let i = 0; i < 54; i++) out[p[i]] = i;
  return out;
}

/* ------------------------------------------------------------------ *
 * The six face turns, as explicit facelet cycles.
 *
 * Each cycle lists positions in the order "this sticker moves to the next
 * one".  The first two cycles of every move are the turning face itself, the
 * remaining three are the ring of side stickers travelling around it.
 * ------------------------------------------------------------------ */

// U (clockwise seen from above): F -> L -> B -> R -> F.
const U_PERM = permFromCycles([
  [0, 2, 8, 6],
  [1, 5, 7, 3],
  [18, 36, 45, 9],
  [19, 37, 46, 10],
  [20, 38, 47, 11],
]);

// D (clockwise seen from below): F -> R -> B -> L -> F.
const D_PERM = permFromCycles([
  [27, 29, 35, 33],
  [28, 32, 34, 30],
  [24, 15, 51, 42],
  [25, 16, 52, 43],
  [26, 17, 53, 44],
]);

// R (clockwise seen from the right): F -> U -> B -> D -> F.
const R_PERM = permFromCycles([
  [9, 11, 17, 15],
  [10, 14, 16, 12],
  [20, 2, 51, 29],
  [23, 5, 48, 32],
  [26, 8, 45, 35],
]);

// L (clockwise seen from the left): U -> F -> D -> B -> U.
const L_PERM = permFromCycles([
  [36, 38, 44, 42],
  [37, 41, 43, 39],
  [0, 18, 27, 53],
  [3, 21, 30, 50],
  [6, 24, 33, 47],
]);

// F (clockwise seen from the front): U -> R -> D -> L -> U.
const F_PERM = permFromCycles([
  [18, 20, 26, 24],
  [19, 23, 25, 21],
  [6, 9, 29, 44],
  [7, 12, 28, 41],
  [8, 15, 27, 38],
]);

// B (clockwise seen from behind): U -> L -> D -> R -> U.
const B_PERM = permFromCycles([
  [45, 47, 53, 51],
  [46, 50, 52, 48],
  [2, 36, 33, 17],
  [1, 39, 34, 14],
  [0, 42, 35, 11],
]);

/* ------------------------------------------------------------------ *
 * Whole cube rotations.
 *
 * A rotation moves complete faces around, so it is easiest to write down as a
 * face-to-face mapping.  Rotations permute the centre facelets too, which is
 * exactly what we want: the state string always stays in the fixed URFDLB
 * frame and a rotation is just another permutation.
 * ------------------------------------------------------------------ */

// y: turn the whole cube the way a U turn goes.  F->L->B->R->F, U spins like
// U, D spins like D'.  The side faces keep "up" pointing up, so their stickers
// keep the same index inside the face.
const Y_PERM = (() => {
  const pairs: Array<[number, number]> = [
    [0, 2], [2, 8], [8, 6], [6, 0], [1, 5], [5, 7], [7, 3], [3, 1],
    [27, 33], [33, 35], [35, 29], [29, 27], [28, 30], [30, 34], [34, 32], [32, 28],
  ];
  for (let i = 0; i < 9; i++) {
    pairs.push([18 + i, 36 + i]); // F -> L
    pairs.push([36 + i, 45 + i]); // L -> B
    pairs.push([45 + i, 9 + i]); //  B -> R
    pairs.push([9 + i, 18 + i]); //  R -> F
  }
  return permFromPairs(pairs);
})();

// x: turn the whole cube the way an R turn goes.  F->U->B->D->F, R spins like
// R, L spins like L'.  Going over the top turns the picture upside down, hence
// the 53 - i and 35 - i hops.
const X_PERM = (() => {
  const pairs: Array<[number, number]> = [
    [9, 11], [11, 17], [17, 15], [15, 9], [10, 14], [14, 16], [16, 12], [12, 10],
    [36, 42], [42, 44], [44, 38], [38, 36], [37, 39], [39, 43], [43, 41], [41, 37],
  ];
  for (let i = 0; i < 9; i++) {
    pairs.push([18 + i, 0 + i]); //  F -> U
    pairs.push([0 + i, 53 - i]); //  U -> B (upside down)
    pairs.push([45 + i, 35 - i]); // B -> D (upside down)
    pairs.push([27 + i, 18 + i]); // D -> F
  }
  return permFromPairs(pairs);
})();

// z: turn the whole cube the way an F turn goes.  U->R->D->L->U, F spins like
// F, B spins like B'.  Each of those four faces is rotated a quarter turn
// clockwise inside its own picture: (row, col) -> (col, 2 - row).
const Z_PERM = (() => {
  const pairs: Array<[number, number]> = [
    [18, 20], [20, 26], [26, 24], [24, 18], [19, 23], [23, 25], [25, 21], [21, 19],
    [45, 51], [51, 53], [53, 47], [47, 45], [46, 48], [48, 52], [52, 50], [50, 46],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const from = 3 * r + c;
      const to = 3 * c + (2 - r);
      pairs.push([0 + from, 9 + to]); //   U -> R
      pairs.push([9 + from, 27 + to]); //  R -> D
      pairs.push([27 + from, 36 + to]); // D -> L
      pairs.push([36 + from, 0 + to]); //  L -> U
    }
  }
  return permFromPairs(pairs);
})();

/* ------------------------------------------------------------------ *
 * The move table
 * ------------------------------------------------------------------ */

const MOVES: Record<string, Perm> = {};

function register(name: string, perm: Perm): void {
  MOVES[name] = perm;
  MOVES[name + '2'] = composePerm(perm, perm);
  MOVES[name + "'"] = invertPerm(perm);
}

register('U', U_PERM);
register('R', R_PERM);
register('F', F_PERM);
register('D', D_PERM);
register('L', L_PERM);
register('B', B_PERM);
register('x', X_PERM);
register('y', Y_PERM);
register('z', Z_PERM);

/** Permutation of a sequence of already registered moves. */
function seqPerm(names: string[]): Perm {
  let p = IDENTITY.slice();
  for (const n of names) p = composePerm(p, MOVES[n]);
  return p;
}

// Slices.  A whole cube rotation is the three parallel layers turning at once
// and layer turns commute, so each slice can be peeled straight off:
//   x = R M' L'  =>  M = x' R L'
//   y = U E' D'  =>  E = y' U D'
//   z = F S  B'  =>  S = z F' B
register('M', seqPerm(["x'", 'R', "L'"]));
register('E', seqPerm(["y'", 'U', "D'"]));
register('S', seqPerm(['z', "F'", 'B']));

// Wide turns = outer layer + neighbouring slice, i.e. a whole cube rotation
// with the far layer turned back:  r = R M' = "L x",  l = L M = "R x'", ...
register('r', seqPerm(['L', 'x']));
register('l', seqPerm(['R', "x'"]));
register('u', seqPerm(['D', 'y']));
register('d', seqPerm(['U', "y'"]));
register('f', seqPerm(['B', 'z']));
register('b', seqPerm(['F', "z'"]));

// "Rw" style aliases for the wide turns.
const WIDE_ALIAS: Record<string, string> = {
  Uw: 'u', Rw: 'r', Fw: 'f', Dw: 'd', Lw: 'l', Bw: 'b',
};
for (const alias of Object.keys(WIDE_ALIAS)) {
  const base = WIDE_ALIAS[alias];
  MOVES[alias] = MOVES[base];
  MOVES[alias + "'"] = MOVES[base + "'"];
  MOVES[alias + '2'] = MOVES[base + '2'];
}

/** Every move token `applyMove` understands. */
export const MOVE_NAMES: string[] = Object.keys(MOVES);

export function isMove(token: string): boolean {
  return Object.prototype.hasOwnProperty.call(MOVES, token);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function applyMove(state: string, move: string): string {
  const perm = MOVES[move];
  if (!perm) throw new Error('Unknown move: ' + move);
  if (state.length !== 54) {
    throw new Error('A cube state must be 54 characters, got ' + state.length);
  }
  return applyPerm(state, perm);
}

/** Split an algorithm into move tokens.  Tolerates extra / missing spaces. */
export function parseAlg(alg: string): string[] {
  const trimmed = alg.trim();
  if (trimmed === '') return [];
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  for (const t of tokens) {
    if (!isMove(t)) throw new Error('Unknown move: ' + t);
  }
  return tokens;
}

export function applyAlg(state: string, alg: string): string {
  let s = state;
  for (const move of parseAlg(alg)) s = applyMove(s, move);
  return s;
}

export function invertMove(move: string): string {
  if (!isMove(move)) throw new Error('Unknown move: ' + move);
  if (move.endsWith('2')) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return move + "'";
}

/** "R U' F2" -> "F2 U R'" */
export function invertAlg(alg: string): string {
  return parseAlg(alg).map(invertMove).reverse().join(' ');
}

/** base name + quarter turns (1, 2 or 3) of a move token. */
function splitMove(move: string): { base: string; amount: number } {
  if (move.endsWith('2')) return { base: move.slice(0, -1), amount: 2 };
  if (move.endsWith("'")) return { base: move.slice(0, -1), amount: 3 };
  return { base: move, amount: 1 };
}

function joinMove(base: string, amount: number): string {
  if (amount === 1) return base;
  if (amount === 2) return base + '2';
  return base + "'";
}

/**
 * Merge neighbouring turns of the same face: "U U'" disappears, "U U" becomes
 * "U2", "U U2" becomes "U'".  Cancellations cascade ("R U U' R'" -> "").
 */
export function simplifyAlg(alg: string): string {
  const stack: Array<{ base: string; amount: number }> = [];
  for (const token of parseAlg(alg)) {
    const split = splitMove(token);
    const top = stack[stack.length - 1];
    if (top && top.base === split.base) {
      stack.pop();
      const merged = (top.amount + split.amount) % 4;
      if (merged !== 0) stack.push({ base: split.base, amount: merged });
    } else {
      stack.push(split);
    }
  }
  return stack.map((m) => joinMove(m.base, m.amount)).join(' ');
}

/**
 * A cube counts as solved when every face shows a single colour.  (A solved
 * cube that was turned as a whole is still solved for a 6 year old, and the
 * solver is allowed to finish in any orientation.)
 */
export function isSolved(state: string): boolean {
  if (state.length !== 54) return false;
  for (let f = 0; f < 6; f++) {
    const first = state[f * 9];
    for (let i = 1; i < 9; i++) {
      if (state[f * 9 + i] !== first) return false;
    }
  }
  return true;
}

const SCRAMBLE_FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const SCRAMBLE_SUFFIX = ['', "'", '2'];

function pick<T>(list: T[], rng: () => number): T {
  const i = Math.floor(rng() * list.length);
  return list[Math.min(Math.max(i, 0), list.length - 1)];
}

/** Random face-turn scramble, never turning the same face twice in a row. */
export function randomScramble(length = 25, rng: () => number = Math.random): string {
  const moves: string[] = [];
  let lastFace = '';
  for (let i = 0; i < length; i++) {
    let face = pick(SCRAMBLE_FACES, rng);
    while (face === lastFace) face = pick(SCRAMBLE_FACES, rng);
    lastFace = face;
    moves.push(face + pick(SCRAMBLE_SUFFIX, rng));
  }
  return moves.join(' ');
}
