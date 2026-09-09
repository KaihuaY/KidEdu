import { describe, expect, it } from 'vitest'
import { bandsFromSpectrum, OnsetDetector } from '../spectrum'

describe('bandsFromSpectrum', () => {
  it('returns bandCount values all within 0..1', () => {
    const bytes = new Uint8Array(1024)
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round((Math.sin(i / 7) * 0.5 + 0.5) * 255)
    const bands = bandsFromSpectrum(bytes, 44100, 2048, 24)
    expect(bands.length).toBe(24)
    for (const v of bands) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('honors a custom band count', () => {
    const bytes = new Uint8Array(1024)
    const bands = bandsFromSpectrum(bytes, 44100, 2048, 12)
    expect(bands.length).toBe(12)
  })

  it('lights exactly the band that contains a single peak bin', () => {
    // fftSize 2048 @ 44100 Hz -> bin width ~21.53 Hz, 1024 bins - plenty of
    // real bins per log band across 60Hz-6kHz, so only the band whose
    // [lo, hi) range contains the peak bin's frequency should be non-zero.
    const bytes = new Uint8Array(1024)
    const sampleRate = 44100
    const fftSize = 2048
    const peakBin = 46 // ~989 Hz
    bytes[peakBin] = 255

    const bands = bandsFromSpectrum(bytes, sampleRate, fftSize, 24)

    let litCount = 0
    let litIndex = -1
    for (let i = 0; i < bands.length; i++) {
      if (bands[i] > 0) {
        litCount++
        litIndex = i
      }
    }
    expect(litCount).toBe(1)

    // Confirm that band's frequency range actually contains the peak bin.
    const peakHz = (peakBin * sampleRate) / fftSize
    const ratio = Math.pow(6000 / 60, 1 / 24)
    const lo = 60 * Math.pow(ratio, litIndex)
    const hi = 60 * Math.pow(ratio, litIndex + 1)
    expect(peakHz).toBeGreaterThanOrEqual(lo)
    expect(peakHz).toBeLessThan(hi)
  })

  it('reuses the nearest bin for a band with no bins in range', () => {
    // A coarse spectrum (few bins) leaves some of the 24 log bands empty;
    // those should read the nearest bin's value rather than 0.
    const bytes = new Uint8Array(8).fill(200)
    const bands = bandsFromSpectrum(bytes, 44100, 32, 24)
    for (const v of bands) expect(v).toBeCloseTo(200 / 255, 5)
  })
})

describe('OnsetDetector', () => {
  it('fires on a step up from silence', () => {
    const d = new OnsetDetector()
    expect(d.push(0)).toBe(false)
    expect(d.push(0.5)).toBe(true)
  })

  it('does not re-fire while the energy stays sustained', () => {
    const d = new OnsetDetector()
    d.push(0)
    expect(d.push(0.5)).toBe(true)
    expect(d.push(0.5)).toBe(false)
    expect(d.push(0.48)).toBe(false)
    expect(d.push(0.5)).toBe(false)
  })

  it('fires again after a dip and a fresh rise', () => {
    const d = new OnsetDetector()
    d.push(0)
    expect(d.push(0.6)).toBe(true)
    // Dip to near-silence and let the envelope decay back down over many
    // ticks (each push decays the envelope by the configured factor).
    for (let i = 0; i < 40; i++) d.push(0.02)
    // A fresh, louder attack should clear envelope + rise again.
    expect(d.push(0.6)).toBe(true)
  })

  it('does not fire on a rise smaller than the configured threshold', () => {
    const d = new OnsetDetector({ rise: 0.5 })
    d.push(0)
    expect(d.push(0.2)).toBe(false)
  })
})
