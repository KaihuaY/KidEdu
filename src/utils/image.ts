// Client-side image resizing for teacher-note photos: shrink to a max
// dimension and re-encode as JPEG via canvas, respecting EXIF orientation
// when the browser supports it (createImageBitmap's `imageOrientation`
// option). Kept separate from Settings.tsx's private `downscaleImage` (PNG,
// 256px, used for reward stickers) since teacher notes need two different
// sizes - a small thumbnail plus a full photo uploaded to Drive.

/** Uint8Array -> base64 without blowing the call stack on a large buffer (chunked, same trick as driveUpload.ts). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/** Raw base64 (no `data:` prefix) of a blob's bytes - what a Drive upload body wants. */
export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}

/** A `data:<mime>;base64,...` URL for `blob`. Works without FileReader, so it runs the same in a Worker or a test. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const base64 = await blobToBase64(blob)
  return `data:${blob.type || 'application/octet-stream'};base64,${base64}`
}

/** The width/height a `width`x`height` image scales to so its longest side is at most `maxPx` (never upscales). Pure. */
export function fitWithin(width: number, height: number, maxPx: number): { width: number; height: number } {
  const scale = Math.min(1, maxPx / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

interface Drawable {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  cleanup: () => void
}

/** Loads `source` as something drawable onto a canvas, preferring createImageBitmap (EXIF-aware) over a plain <img> decode. */
async function loadDrawable(source: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      }
    } catch {
      // Some browsers accept createImageBitmap but reject the orientation
      // option (or choke on a given mime type) - fall through to <img>.
    }
  }
  const url = URL.createObjectURL(source)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that image'))
      el.src = url
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(url),
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

/**
 * Draws `source` (a photo file/blob) onto a canvas no larger than `maxPx` on
 * its longest side and re-encodes it as JPEG at `quality` (0-1). Browser-only
 * (canvas + Image/createImageBitmap) - not exercised by the node-environment
 * unit tests, unlike fitWithin/blobToDataUrl above.
 */
export async function downscaleToJpeg(source: Blob, maxPx: number, quality: number): Promise<Blob> {
  const drawable = await loadDrawable(source)
  try {
    const { width, height } = fitWithin(drawable.width, drawable.height, maxPx)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    drawable.draw(ctx, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality)
    })
  } finally {
    drawable.cleanup()
  }
}
