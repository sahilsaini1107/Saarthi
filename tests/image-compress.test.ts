import { describe, expect, it } from 'vitest'
import {
  applyMatrix,
  canvasSizeForOrientation,
  DIMENSION_FLOOR,
  nextDimension,
  orientationMatrix,
  readJpegOrientation,
  scaleToFit,
  toJpegFileName,
} from '@/lib/image-compress'

/**
 * Build a minimal JPEG carrying an EXIF Orientation tag, byte by byte, from the
 * spec rather than from the parser — otherwise the test just agrees with
 * whatever the implementation happens to do.
 *
 * Layout:
 *   FFD8                      SOI
 *   FFE1 <len>                APP1 marker + big-endian length (includes itself)
 *     "Exif\0\0"              6 bytes
 *     II|MM 2A00|002A         TIFF header: byte order + magic 42
 *     <ifd0 offset = 8>       4 bytes, relative to the TIFF header
 *     <entry count = 1>       2 bytes
 *     0112 0003 00000001 ..   Orientation tag, type SHORT, count 1, value
 *     <next IFD = 0>          4 bytes
 *   FFD9                      EOI
 */
function jpegWithOrientation(orientation: number, endian: 'little' | 'big' = 'little'): ArrayBuffer {
  const little = endian === 'little'
  const u16 = (n: number): number[] => (little ? [n & 0xff, (n >> 8) & 0xff] : [(n >> 8) & 0xff, n & 0xff])
  const u32 = (n: number): number[] =>
    little
      ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
      : [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]

  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]), // "II" or "MM"
    ...u16(42), // TIFF magic
    ...u32(8), // IFD0 begins right after this 8-byte header
    ...u16(1), // one directory entry
    ...u16(0x0112), // tag: Orientation
    ...u16(3), // type: SHORT
    ...u32(1), // count: 1
    ...u16(orientation), // value, in the first 2 of the 4 value bytes
    0x00,
    0x00, // ...padding
    ...u32(0), // no next IFD
  ]

  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff] // "Exif\0\0" + TIFF
  const length = exif.length + 2 // APP1 length counts itself
  const bytes = [
    0xff,
    0xd8, // SOI
    0xff,
    0xe1, // APP1
    (length >> 8) & 0xff,
    length & 0xff, // length is ALWAYS big-endian
    ...exif,
    0xff,
    0xd9, // EOI
  ]
  return new Uint8Array(bytes).buffer
}

const bufferOf = (...bytes: number[]): ArrayBuffer => new Uint8Array(bytes).buffer

describe('readJpegOrientation', () => {
  it('reads every orientation from a little-endian ("II") EXIF block', () => {
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(readJpegOrientation(jpegWithOrientation(o, 'little')), `orientation ${o}`).toBe(o)
    }
  })

  it('reads every orientation from a big-endian ("MM") EXIF block', () => {
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(readJpegOrientation(jpegWithOrientation(o, 'big')), `orientation ${o}`).toBe(o)
    }
  })

  it('walks past an earlier APP0/JFIF segment to find APP1', () => {
    const withExif = new Uint8Array(jpegWithOrientation(6))
    // splice a 4-byte APP0 segment (FFE0 0004 + 2 bytes) in after SOI
    const spliced = new Uint8Array(withExif.length + 6)
    spliced.set(withExif.slice(0, 2), 0) // SOI
    spliced.set([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00], 2) // APP0, length 4
    spliced.set(withExif.slice(2), 8) // the rest, APP1 onward
    expect(readJpegOrientation(spliced.buffer)).toBe(6)
  })

  it('defaults to 1 when the JPEG has no EXIF at all', () => {
    // SOI + APP0/JFIF (length 4) + EOI
    expect(readJpegOrientation(bufferOf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9))).toBe(1)
  })

  it('defaults to 1 when EXIF is present but carries no Orientation tag', () => {
    const b = new Uint8Array(jpegWithOrientation(6))
    // rewrite the tag id 0x0112 -> 0x010e (ImageDescription), little-endian
    const tagAt = b.indexOf(0x12)
    b[tagAt] = 0x0e
    expect(readJpegOrientation(b.buffer)).toBe(1)
  })

  it('defaults to 1 for an out-of-range orientation value', () => {
    expect(readJpegOrientation(jpegWithOrientation(99))).toBe(1)
    expect(readJpegOrientation(jpegWithOrientation(0))).toBe(1)
  })

  it('defaults to 1 for a non-JPEG (PNG magic bytes)', () => {
    expect(readJpegOrientation(bufferOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(1)
  })

  it('never throws on truncated or garbage input', () => {
    expect(readJpegOrientation(new ArrayBuffer(0))).toBe(1)
    expect(readJpegOrientation(bufferOf(0xff))).toBe(1)
    expect(readJpegOrientation(bufferOf(0xff, 0xd8))).toBe(1)
    expect(readJpegOrientation(bufferOf(0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20, 0x45, 0x78))).toBe(1) // claims EXIF, cut short
    expect(readJpegOrientation(bufferOf(0x00, 0x01, 0x02, 0x03, 0x04))).toBe(1)
  })

  it('stops at the start of scan rather than reading image data as markers', () => {
    // SOI + SOS — a real file's compressed bytes follow and must not be parsed
    expect(readJpegOrientation(bufferOf(0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04))).toBe(1)
  })
})

describe('canvasSizeForOrientation', () => {
  it('swaps width and height for the four rotated orientations', () => {
    for (const o of [5, 6, 7, 8]) {
      expect(canvasSizeForOrientation(o, 1200, 1600), `orientation ${o}`).toEqual({ width: 1600, height: 1200 })
    }
  })

  it('leaves the upright and flipped orientations alone', () => {
    for (const o of [1, 2, 3, 4]) {
      expect(canvasSizeForOrientation(o, 1200, 1600), `orientation ${o}`).toEqual({ width: 1200, height: 1600 })
    }
  })
})

describe('scaleToFit', () => {
  it('scales a landscape photo down by its longest side', () => {
    expect(scaleToFit(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('scales a portrait photo down by its longest side', () => {
    expect(scaleToFit(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never scales an already-small image up', () => {
    expect(scaleToFit(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('keeps a tiny dimension at 1px rather than rounding to 0', () => {
    expect(scaleToFit(10000, 3, 1600).height).toBe(1)
  })

  it('handles a zero-sized image without dividing by zero', () => {
    expect(scaleToFit(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})

describe('nextDimension', () => {
  it('steps down by a quarter each time', () => {
    expect(nextDimension(1600)).toBe(1200)
    expect(nextDimension(1200)).toBe(900)
  })

  it('stops at the floor instead of shrinking indefinitely', () => {
    expect(nextDimension(700)).toBe(DIMENSION_FLOOR)
    expect(nextDimension(DIMENSION_FLOOR)).toBe(DIMENSION_FLOOR)
  })
})

describe('toJpegFileName', () => {
  it('re-extensions whatever was picked, since output is always JPEG', () => {
    expect(toJpegFileName('progress.png')).toBe('progress.jpg')
    expect(toJpegFileName('IMG_4821.HEIC')).toBe('IMG_4821.jpg')
    expect(toJpegFileName('photo.jpeg')).toBe('photo.jpg')
  })

  it('handles a name with no extension, and dots inside the name', () => {
    expect(toJpegFileName('scan')).toBe('scan.jpg')
    expect(toJpegFileName('week.4.front.png')).toBe('week.4.front.jpg')
  })

  it('falls back to a usable name for a degenerate input', () => {
    expect(toJpegFileName('')).toBe('photo.jpg')
    expect(toJpegFileName('.png')).toBe('photo.jpg')
  })
})

describe('orientationMatrix — where a photo\u2019s corners actually land', () => {
  // A 40x20 landscape source. For orientations 5-8 the canvas swaps to 20x40.
  const SRC_W = 40
  const SRC_H = 20

  /** Which corner of the output the source's top-left pixel ends up in. */
  function cornerOfTopLeft(orientation: number): string {
    const canvas = canvasSizeForOrientation(orientation, SRC_W, SRC_H)
    const m = orientationMatrix(orientation, canvas.width, canvas.height)
    const p = applyMatrix(m, 0, 0)
    const right = p.x > canvas.width / 2
    const bottom = p.y > canvas.height / 2
    return `${bottom ? 'B' : 'T'}${right ? 'R' : 'L'}`
  }

  /**
   * Straight from the EXIF spec: orientation N says how the stored pixels are
   * rotated/mirrored away from upright, so the top-left of the stored image
   * has one correct destination corner in each case.
   */
  it.each([
    [1, 'TL', 'normal'],
    [2, 'TR', 'flip horizontal'],
    [3, 'BR', 'rotate 180'],
    [4, 'BL', 'flip vertical'],
    [5, 'TL', 'transpose'],
    [6, 'TR', 'rotate 90 cw'],
    [7, 'BR', 'transverse'],
    [8, 'BL', 'rotate 270 cw'],
  ])('orientation %i (%s) puts the top-left corner at %s', (orientation, expected) => {
    expect(cornerOfTopLeft(orientation as number)).toBe(expected)
  })

  it('keeps every corner inside the canvas — a swapped translation blanks the photo', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const canvas = canvasSizeForOrientation(orientation, SRC_W, SRC_H)
      const m = orientationMatrix(orientation, canvas.width, canvas.height)
      for (const [x, y] of [
        [0, 0],
        [SRC_W, 0],
        [0, SRC_H],
        [SRC_W, SRC_H],
      ]) {
        const p = applyMatrix(m, x, y)
        expect(p.x, `orientation ${orientation} corner (${x},${y}) x`).toBeGreaterThanOrEqual(0)
        expect(p.x, `orientation ${orientation} corner (${x},${y}) x`).toBeLessThanOrEqual(canvas.width)
        expect(p.y, `orientation ${orientation} corner (${x},${y}) y`).toBeGreaterThanOrEqual(0)
        expect(p.y, `orientation ${orientation} corner (${x},${y}) y`).toBeLessThanOrEqual(canvas.height)
      }
    }
  })

  it('covers the full canvas area for every orientation', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const canvas = canvasSizeForOrientation(orientation, SRC_W, SRC_H)
      const m = orientationMatrix(orientation, canvas.width, canvas.height)
      const pts = [
        applyMatrix(m, 0, 0),
        applyMatrix(m, SRC_W, 0),
        applyMatrix(m, 0, SRC_H),
        applyMatrix(m, SRC_W, SRC_H),
      ]
      const spanX = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
      const spanY = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
      expect(spanX, `orientation ${orientation} width`).toBe(canvas.width)
      expect(spanY, `orientation ${orientation} height`).toBe(canvas.height)
    }
  })

  it('leaves an unknown orientation as the identity transform', () => {
    expect(orientationMatrix(99, 40, 20)).toEqual([1, 0, 0, 1, 0, 0])
    expect(applyMatrix(orientationMatrix(99, 40, 20), 7, 3)).toEqual({ x: 7, y: 3 })
  })
})
