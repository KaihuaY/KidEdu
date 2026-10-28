// Pure geometry for drawing a bracelet strand (used by the strand SVGs in
// src/components/BraceletMaker.tsx).

/** The oval the beads sit on: a closed loop like a real bracelet, inset so the beads never clip the edge. */
export function strandOval(width: number, height: number): { cx: number; cy: number; rx: number; ry: number } {
  const inset = Math.max(20, width * 0.075)
  return { cx: width / 2, cy: height / 2, rx: width / 2 - inset, ry: height / 2 - inset }
}

/**
 * One {x,y} per slot, evenly spaced around the oval starting at the top.
 * With 18 slots on a 340-wide strand the beads sit ~41 px apart, so the
 * 38 px hit circles in the editor never overlap a neighbour.
 */
export function slotPositions(count: number, width: number, height: number): { x: number; y: number }[] {
  const { cx, cy, rx, ry } = strandOval(width, height)
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, count)) * Math.PI * 2
    positions.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
  }
  return positions
}

/** The string underneath the beads: the same closed oval. */
export function strandPath(width: number, height: number): string {
  const { cx, cy, rx, ry } = strandOval(width, height)
  return `M ${cx} ${cy - ry} A ${rx} ${ry} 0 1 1 ${cx - 0.01} ${cy - ry} Z`
}

export function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

export function heartPath(cx: number, cy: number, r: number): string {
  const s = r
  return `M ${cx} ${cy + s * 0.35} C ${cx - s} ${cy - s * 0.35}, ${cx - s * 0.5} ${cy - s}, ${cx} ${cy - s * 0.35} C ${cx + s * 0.5} ${cy - s}, ${cx + s} ${cy - s * 0.35}, ${cx} ${cy + s * 0.35} Z`
}
