import { describe, expect, it } from 'vitest'
import { blobToBase64, blobToDataUrl, bytesToBase64, fitWithin } from '../image'

describe('fitWithin', () => {
  it('scales the longest side down to maxPx, keeping aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never upscales a smaller image', () => {
    expect(fitWithin(100, 80, 1600)).toEqual({ width: 100, height: 80 })
  })

  it('always returns at least 1x1', () => {
    expect(fitWithin(1, 1000, 240)).toEqual({ width: 1, height: 240 })
  })
})

describe('bytesToBase64', () => {
  it('round-trips through atob, including a buffer larger than one chunk', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256)
    const b64 = bytesToBase64(bytes)
    const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    expect(decoded).toEqual(bytes)
  })
})

describe('blobToBase64 / blobToDataUrl', () => {
  it('encodes a blob as raw base64', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const b64 = await blobToBase64(blob)
    expect(atob(b64)).toBe('hello')
  })

  it('wraps the base64 in a data: URL with the blob mime type', async () => {
    const blob = new Blob(['hi'], { type: 'image/jpeg' })
    const url = await blobToDataUrl(blob)
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
    const base64 = url.slice('data:image/jpeg;base64,'.length)
    expect(atob(base64)).toBe('hi')
  })

  it('falls back to application/octet-stream for a blob with no type', async () => {
    const blob = new Blob(['x'])
    const url = await blobToDataUrl(blob)
    expect(url.startsWith('data:application/octet-stream;base64,')).toBe(true)
  })
})
