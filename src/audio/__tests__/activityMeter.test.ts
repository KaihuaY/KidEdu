import { describe, expect, it } from 'vitest'
import { ActivityMeter } from '../activityMeter'

describe('ActivityMeter', () => {
  it('credits nothing for pure silence', () => {
    const meter = new ActivityMeter()
    let t = 0
    for (let i = 0; i < 100; i++) {
      // 10 s @ 100 ms steps
      meter.push(0.005, t)
      t += 100
    }
    expect(meter.activeMs).toBe(0)
  })

  it('credits most of a session of piano-like bursts with rests between notes', () => {
    const meter = new ActivityMeter()
    let t = 0
    const totalMs = 20_000
    while (t < totalMs) {
      // A note: peaks at 0.25 and decays linearly to 0.01 over 1.5 s.
      for (let i = 0; i < 15; i++) {
        const frac = i / 14
        const rms = 0.25 + (0.01 - 0.25) * frac
        meter.push(rms, t)
        t += 100
      }
      // A short rest between notes.
      for (let i = 0; i < 5; i++) {
        meter.push(0.005, t)
        t += 100
      }
    }
    expect(meter.activeMs).toBeGreaterThanOrEqual(17_000)
  })

  it('adapts the floor up to a constant hum so it is never counted as playing', () => {
    const meter = new ActivityMeter()
    let t = 0
    for (let i = 0; i < 150; i++) {
      // 15 s @ 100 ms steps of a constant, louder-than-quiet hum
      meter.push(0.02, t)
      t += 100
    }
    expect(meter.activeMs).toBeLessThan(3000)
  })

  it('credits roughly the hold window for a single short note after warm-up', () => {
    const meter = new ActivityMeter()
    let t = 0
    // 1 s of quiet warm-up.
    for (let i = 0; i < 10; i++) {
      meter.push(0.003, t)
      t += 100
    }
    // 1 s note.
    for (let i = 0; i < 10; i++) {
      meter.push(0.3, t)
      t += 100
    }
    // 6 s of quiet afterward - the 2 s hold should tail off inside this window.
    for (let i = 0; i < 60; i++) {
      meter.push(0.005, t)
      t += 100
    }
    expect(meter.activeMs).toBeGreaterThan(2500)
    expect(meter.activeMs).toBeLessThan(3200)
  })

  it('clamps a large gap between samples so it cannot inflate activeMs', () => {
    const meter = new ActivityMeter()
    let t = 0
    // Calibrate a low floor, then get well past the warm-up window while loud.
    for (let i = 0; i < 20; i++) {
      meter.push(0.003, t)
      t += 100
    }
    for (let i = 0; i < 5; i++) {
      meter.push(0.3, t)
      t += 100
    }
    const before = meter.activeMs
    t += 5000 // a 5 s gap in sampling (e.g. a throttled background tab)
    meter.push(0.3, t)
    const delta = meter.activeMs - before
    expect(delta).toBeLessThanOrEqual(500)
    expect(delta).toBeGreaterThan(0)
  })

  it('grows silentMs during silence and resets it on a loud sample', () => {
    const meter = new ActivityMeter()
    let t = 0
    for (let i = 0; i < 5; i++) {
      meter.push(0.003, t) // calibrate a low floor
      t += 100
    }
    const loud = meter.push(0.3, t)
    expect(loud.silentMs).toBe(0)
    t += 100

    const frame1 = meter.push(0.003, t)
    expect(frame1.silentMs).toBe(100)
    t += 900

    const frame2 = meter.push(0.003, t)
    expect(frame2.silentMs).toBe(1000)

    const frame3 = meter.push(0.3, t + 100)
    expect(frame3.silentMs).toBe(0)
  })
})
