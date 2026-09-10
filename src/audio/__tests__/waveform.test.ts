import { describe, expect, it } from 'vitest'
import { bucketize } from '../waveform'

describe('bucketize', () => {
  it('takes the peak absolute amplitude per bucket, scaled so the loudest bucket is 100', () => {
    // 4 samples, 2 buckets: bucket 0 = [0.1, -0.2] (peak 0.2), bucket 1 = [0.4, -0.05] (peak 0.4, the loudest).
    const samples = [0.1, -0.2, 0.4, -0.05]
    expect(bucketize(samples, 2)).toEqual([50, 100])
  })

  it('returns integers', () => {
    const samples = [0.33, -0.66, 0.11]
    for (const v of bucketize(samples, 3)) {
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('always returns exactly `buckets` values, even with fewer samples than buckets', () => {
    const out = bucketize([1, 0.5], 4)
    expect(out).toHaveLength(4)
    expect(Math.max(...out)).toBe(100) // the loudest sample's bucket reads 100
  })

  it('returns all zeros for silence', () => {
    const samples = new Array(100).fill(0)
    expect(bucketize(samples, 10)).toEqual(new Array(10).fill(0))
  })

  it('returns an all-zero array of the requested length for empty input', () => {
    expect(bucketize([], 10)).toEqual(new Array(10).fill(0))
  })

  it('accepts a Float32Array', () => {
    const samples = new Float32Array([0.2, -0.8, 0.1, 0.05])
    expect(bucketize(samples, 2)).toEqual([100, 13])
  })

  it('defaults to 160 buckets', () => {
    const samples = new Array(1000).fill(0).map((_, i) => Math.sin(i))
    expect(bucketize(samples)).toHaveLength(160)
  })
})
