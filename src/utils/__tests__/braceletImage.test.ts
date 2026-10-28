import { describe, expect, it } from 'vitest'
import { braceletCardSvg } from '../braceletImage'
import type { Bracelet } from '../../store/progress'

describe('braceletCardSvg', () => {
  const beads: (string | null)[] = Array<string | null>(18).fill(null)
  beads[0] = 'red-round'
  beads[1] = 'gold-star'
  beads[2] = 'pink-heart'
  beads[3] = 'sky-flower'
  beads[4] = 'letter-n'
  const bracelet: Bracelet = { id: 'b1', name: 'Tom & <Jerry> "x"', beads, startedAt: 1, finishedAt: 2 }
  const svg = braceletCardSvg(bracelet, { kidName: 'Nora', date: '1/2/2026' })

  it('is a standalone svg with the escaped name and maker line', () => {
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Tom &amp; &lt;Jerry&gt; &quot;x&quot;')
    expect(svg).not.toContain('<Jerry>')
    expect(svg).toContain('Made by Nora')
  })

  it('draws one bead per filled slot and uses no CSS variables', () => {
    expect(svg.match(/class="bead"/g)).toHaveLength(5)
    expect(svg).not.toContain('var(')
  })
})
