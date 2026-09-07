// Sticker color map for CubeClimb, in the solver's frame: cube held with
// yellow on top (U) and green facing you (F).
//   U = yellow, R = orange, F = green, D = white, L = red, B = blue
// This matches the facelet string convention used across src/engine
// (54-char URFDLB string, Kociemba face order).

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

export interface FaceColor {
  name: string
  hex: string
}

export const CUBE_COLORS: Record<Face, FaceColor> = {
  U: { name: 'yellow', hex: '#f5d91a' },
  R: { name: 'orange', hex: '#ff8a00' },
  F: { name: 'green', hex: '#1fa953' },
  D: { name: 'white', hex: '#f5f5f5' },
  L: { name: 'red', hex: '#e62b2b' },
  B: { name: 'blue', hex: '#1f5fd9' },
}

export const FACE_ORDER: Face[] = ['U', 'R', 'F', 'D', 'L', 'B']

export function letterToColor(letter: string): FaceColor | undefined {
  return CUBE_COLORS[letter as Face]
}

export function colorToLetter(colorName: string): Face | undefined {
  const lower = colorName.toLowerCase()
  for (const face of FACE_ORDER) {
    if (CUBE_COLORS[face].name === lower) return face
  }
  return undefined
}
