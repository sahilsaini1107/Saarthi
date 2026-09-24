// Client-side image compression (Phase 25). Runs in the browser before a photo
// is ever sent to the server.
//
// Why this exists: Vercel's serverless functions cap a request body at roughly
// 4.5 MB. Photos ride to the API as base64 inside JSON, and base64 inflates
// bytes by 4/3 — so a 4 MB phone photo becomes ~5.3 MB of request body and is
// rejected by the platform before our route handler ever runs. Compressing to
// ~2.5 MB of raw JPEG lands at ~3.3 MB encoded, comfortably inside the cap.
//
// The server-side ceilings (5 MB exercise photo, 8 MB progress photo) stay
// exactly as they were: this is a client-side courtesy, not the security
// boundary. A hostile client can still post whatever it likes, and still gets
// rejected by the service layer.
//
// EXIF orientation: canvas `drawImage` does NOT apply a JPEG's EXIF Orientation
// tag, and browsers disagree on whether `createImageBitmap` does. Re-encoding
// through a canvas would therefore silently rotate photos that every other app
// shows upright — a real regression for a feature whose whole point is
// comparing two photos side by side. So the tag is parsed here and the rotation
// applied explicitly, with `imageOrientation: 'none'` forcing the browser out
// of the decision.

/** Longest side, px. Well past what a phone-screen comparison view needs. */
export const DEFAULT_MAX_DIMENSION = 1600

/**
 * Raw JPEG bytes to aim for. 2.5 MB becomes ~3.3 MB once base64'd, which leaves
 * headroom under Vercel's ~4.5 MB request-body cap for the surrounding JSON.
 */
export const DEFAULT_TARGET_BYTES = 2.5 * 1024 * 1024

/** Tried in order; the first result under the target wins. */
export const QUALITY_LADDER = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35] as const

/** Never scale below this — past it the photo stops being useful to compare. */
export const DIMENSION_FLOOR = 640

/** How many times the whole quality ladder may be retried at a smaller size. */
const MAX_DIMENSION_ATTEMPTS = 3

export interface CompressOptions {
  maxDimension?: number
  maxBytes?: number
}

export interface CompressResult {
  /** base64 payload with no data-URL prefix — what the API expects */
  base64: string
  mime: string
  fileName: string
  width: number
  height: number
  /** size of the compressed image in raw bytes */
  bytes: number
  /** size of the file the user picked, for a "4.8 MB to 612 KB" line */
  originalBytes: number
}

/* ---------------- EXIF orientation (pure) ---------------- */

/** JPEG EXIF Orientation tag id. */
const TAG_ORIENTATION = 0x0112

/**
 * Read the EXIF Orientation (1–8) out of a JPEG's bytes. Returns 1 ("upright,
 * no transform") for anything that is not a JPEG, carries no EXIF, has no
 * Orientation tag, or is malformed.
 *
 * Never throws: a photo that cannot be parsed should still upload, just without
 * the rotation fix — exactly the behaviour we had before this existed.
 */
export function readJpegOrientation(buffer: ArrayBuffer): number {
  try {
    const view = new DataView(buffer)
    if (view.byteLength < 4) return 1
    // SOI — every JPEG starts 0xFFD8
    if (view.getUint16(0, false) !== 0xffd8) return 1

    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false)
      // SOS (0xFFDA) begins compressed image data; EOI (0xFFD9) ends the file.
      // Either way there are no more metadata segments left to walk.
      if (marker === 0xffda || marker === 0xffd9) return 1
      if ((marker & 0xff00) !== 0xff00) return 1 // desynced — not a marker

      const segmentLength = view.getUint16(offset + 2, false)
      if (segmentLength < 2) return 1

      // APP1 is where EXIF lives
      if (marker === 0xffe1) {
        const dataStart = offset + 4
        // "Exif\0\0"
        if (
          dataStart + 6 <= view.byteLength &&
          view.getUint32(dataStart, false) === 0x45786966 &&
          view.getUint16(dataStart + 4, false) === 0x0000
        ) {
          return readOrientationFromTiff(view, dataStart + 6)
        }
      }
      offset += 2 + segmentLength
    }
    return 1
  } catch {
    return 1
  }
}

/** Parse the TIFF block that follows "Exif\0\0" and pull out Orientation. */
function readOrientationFromTiff(view: DataView, tiffStart: number): number {
  if (tiffStart + 8 > view.byteLength) return 1

  // Byte order: "II" (0x4949) little-endian, "MM" (0x4D4D) big-endian
  const byteOrder = view.getUint16(tiffStart, false)
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1
  const little = byteOrder === 0x4949

  // IFD0 offset is relative to the start of the TIFF header
  const ifdOffset = view.getUint32(tiffStart + 4, little)
  const ifdStart = tiffStart + ifdOffset
  if (ifdStart + 2 > view.byteLength) return 1

  const entryCount = view.getUint16(ifdStart, little)
  for (let i = 0; i < entryCount; i++) {
    // each directory entry is 12 bytes, after the 2-byte count
    const entry = ifdStart + 2 + i * 12
    if (entry + 12 > view.byteLength) return 1
    if (view.getUint16(entry, little) !== TAG_ORIENTATION) continue

    // type 3 = SHORT; the value sits in the first 2 bytes of the 4-byte
    // value/offset field, so it is read in place rather than followed
    const value = view.getUint16(entry + 8, little)
    return value >= 1 && value <= 8 ? value : 1
  }
  return 1
}

/* ---------------- geometry (pure) ---------------- */

/**
 * Orientations 5–8 rotate by 90°, so the output canvas swaps width and height.
 * 1–4 keep the source dimensions.
 */
export function canvasSizeForOrientation(
  orientation: number,
  width: number,
  height: number,
): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height }
}

/** Fit width×height inside a `maxDimension` box, never scaling up. */
export function scaleToFit(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension || longest === 0) return { width, height }
  const scale = maxDimension / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Next size down when the whole quality ladder still came out too big. */
export function nextDimension(current: number): number {
  return Math.max(DIMENSION_FLOOR, Math.round(current * 0.75))
}

/** Compressed output is always JPEG, so the name should say so. */
export function toJpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'photo'
  return `${base}.jpg`
}

/* ---------------- canvas (browser only) ---------------- */

/** A 2D affine transform as canvas takes it: [a, b, c, d, e, f]. */
export type Matrix = [number, number, number, number, number, number]

/**
 * The canvas transform that undoes an EXIF orientation.
 *
 * `canvasWidth`/`canvasHeight` are the DESTINATION dimensions (already swapped
 * for 5–8 by canvasSizeForOrientation); the caller then draws the image at its
 * unrotated size and this matrix puts it right.
 *
 * Pure and exported so the mapping can be unit-tested — a swapped translation
 * here pushes the whole photo off-canvas and yields a blank image, which is
 * invisible until someone uploads a photo with that exact orientation.
 */
export function orientationMatrix(orientation: number, canvasWidth: number, canvasHeight: number): Matrix {
  switch (orientation) {
    case 2: // flip horizontal
      return [-1, 0, 0, 1, canvasWidth, 0]
    case 3: // rotate 180°
      return [-1, 0, 0, -1, canvasWidth, canvasHeight]
    case 4: // flip vertical
      return [1, 0, 0, -1, 0, canvasHeight]
    case 5: // transpose: (x,y) -> (y,x)
      return [0, 1, 1, 0, 0, 0]
    case 6: // rotate 90° cw: (x,y) -> (cw-y, x)
      return [0, 1, -1, 0, canvasWidth, 0]
    case 7: // transverse: (x,y) -> (cw-y, ch-x)
      return [0, -1, -1, 0, canvasWidth, canvasHeight]
    case 8: // rotate 270° cw: (x,y) -> (y, ch-x)
      return [0, -1, 1, 0, 0, canvasHeight]
    default: // 1, or anything unexpected — draw as-is
      return [1, 0, 0, 1, 0, 0]
  }
}

/** Where `orientationMatrix` sends a source point. Mirrors canvas semantics. */
export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = m
  return { x: a * x + c * y + e, y: b * x + d * y + f }
}

/** Apply an EXIF orientation to a canvas context. */
export function applyOrientationTransform(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.transform(...orientationMatrix(orientation, canvasWidth, canvasHeight))
}

type LoadedImage = { source: CanvasImageSource; width: number; height: number; release: () => void }

/**
 * Decode the file for drawing. `imageOrientation: 'none'` is explicit because
 * browsers disagree on the default — we want the raw pixels and apply the EXIF
 * rotation ourselves, or we would risk rotating twice.
 */
async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'none' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That image could not be opened.'))
      el.src = url
    })
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('That image could not be compressed.'))),
      'image/jpeg',
      quality,
    )
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the compressed image.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Resize and re-encode a picked image to JPEG, small enough to survive a
 * serverless request-body cap, with EXIF rotation applied.
 *
 * Walks the quality ladder at the current size; if even the lowest quality is
 * still over target, drops the size and walks it again. Always returns the
 * smallest result it managed — it never refuses to produce something, because
 * a slightly-too-large photo the server can reject is a better outcome than a
 * dead upload button.
 */
export async function compressImageFile(file: File, opts: CompressOptions = {}): Promise<CompressResult> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.')

  const maxBytes = opts.maxBytes ?? DEFAULT_TARGET_BYTES
  let maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION

  const orientation = file.type === 'image/jpeg' ? readJpegOrientation(await file.arrayBuffer()) : 1
  const image = await loadImage(file)

  try {
    let best: { blob: Blob; width: number; height: number } | null = null

    for (let attempt = 0; attempt < MAX_DIMENSION_ATTEMPTS; attempt++) {
      const draw = scaleToFit(image.width, image.height, maxDimension)
      const canvasSize = canvasSizeForOrientation(orientation, draw.width, draw.height)

      const canvas = document.createElement('canvas')
      canvas.width = canvasSize.width
      canvas.height = canvasSize.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('This browser cannot process images.')

      applyOrientationTransform(ctx, orientation, canvasSize.width, canvasSize.height)
      ctx.drawImage(image.source, 0, 0, draw.width, draw.height)

      for (const quality of QUALITY_LADDER) {
        const blob = await canvasToBlob(canvas, quality)
        if (!best || blob.size < best.blob.size) {
          best = { blob, width: canvasSize.width, height: canvasSize.height }
        }
        if (blob.size <= maxBytes) {
          return {
            base64: await blobToBase64(blob),
            mime: 'image/jpeg',
            fileName: toJpegFileName(file.name),
            width: canvasSize.width,
            height: canvasSize.height,
            bytes: blob.size,
            originalBytes: file.size,
          }
        }
      }

      const smaller = nextDimension(maxDimension)
      if (smaller === maxDimension) break // already at the floor
      maxDimension = smaller
    }

    if (!best) throw new Error('That image could not be compressed.')
    return {
      base64: await blobToBase64(best.blob),
      mime: 'image/jpeg',
      fileName: toJpegFileName(file.name),
      width: best.width,
      height: best.height,
      bytes: best.blob.size,
      originalBytes: file.size,
    }
  } finally {
    image.release()
  }
}
