/**
 * A 2D context that records what was drawn, and two ways to look at it.
 *
 * This repo has never been able to see itself. The render path only runs in a
 * browser, this machine has no shared libraries for a headless one, and every
 * check here asserts on numbers — "a circle of radius r was drawn at x, y" —
 * which catches a missing joystick and cannot catch a body that looks wrong.
 * Every judgement about how something looks has had to be made by deploying
 * it and squinting at a phone.
 *
 * So: a context that keeps the shapes, an SVG writer for a browser and a
 * rasteriser for a PNG. It implements exactly the calls the drawing code
 * makes, samples curves into line segments rather than converting them, and
 * supersamples the raster to hide the fact that it is a hundred lines of
 * scanline fill rather than a graphics library.
 *
 * The one thing it does not do is text: laying out glyphs needs a font, and a
 * font is an asset. The SVG carries the labels — a browser has fonts — and
 * the PNG carries the shapes, which is what shapes have to be judged on.
 */

import { deflateSync } from 'node:zlib'

type Pt = [number, number]
type Matrix = [number, number, number, number, number, number]

interface Shape {
  subpaths: { pts: Pt[]; closed: boolean }[]
  fill?: { colour: string; alpha: number }
  stroke?: { colour: string; alpha: number; width: number; cap: string; join: string }
}

interface TextItem {
  text: string
  x: number
  y: number
  colour: string
  size: number
  anchor: string
  alpha: number
}

/**
 * A gradient, flattened to one colour.
 *
 * The game paints its floor and several of its bars with gradients, and a
 * recording that only knows about flat fills would crash on the first one.
 * Every ramp here runs between two shades of the same thing, so the middle
 * stop is a fair stand-in and costs nothing.
 */
class Gradient {
  private stops: { at: number; colour: string }[] = []
  addColorStop(at: number, colour: string): void {
    this.stops.push({ at, colour })
  }
  flat(): string {
    if (!this.stops.length) return '#222230'
    let best = this.stops[0]!
    for (const stop of this.stops) {
      if (Math.abs(stop.at - 0.5) < Math.abs(best.at - 0.5)) best = stop
    }
    return best.colour
  }
}

/** Whatever a fill or stroke style is, as a colour string. */
function colourOf(style: unknown): string {
  if (typeof style === 'string') return style
  if (style instanceof Gradient) return style.flat()
  return '#222230'
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const ARC_STEPS = 48

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export class RecordingCtx {
  shapes: Shape[] = []
  texts: TextItem[] = []
  private m: Matrix = IDENTITY
  private stack: Matrix[] = []
  private path: { pts: Pt[]; closed: boolean }[] = []

  fillStyle: string | Gradient = '#000000'
  strokeStyle: string | Gradient = '#000000'
  lineWidth = 1
  globalAlpha = 1
  lineJoin = 'round'
  lineCap = 'round'
  font = '10px sans-serif'
  textAlign = 'left'
  textBaseline = 'alphabetic'
  readonly canvas = { width: 0, height: 0 }

  save(): void {
    this.stack.push(this.m)
  }
  restore(): void {
    this.m = this.stack.pop() ?? IDENTITY
  }
  translate(x: number, y: number): void {
    this.m = multiply(this.m, [1, 0, 0, 1, x, y])
  }
  rotate(a: number): void {
    this.m = multiply(this.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])
  }
  scale(x: number, y: number): void {
    this.m = multiply(this.m, [x, 0, 0, y, 0, 0])
  }
  setLineDash(): void {}
  clearRect(): void {}
  drawImage(): void {}

  /**
   * Clipping is ignored, and that is the one place a recording differs from
   * the screen: anything the game clips to the arena will be drawn past its
   * edge here. Honouring it means intersecting polygons, which is a much
   * larger machine than a preview is worth — so a stray band of floor outside
   * the arena in a screenshot is this, not a bug in the game.
   */
  clip(): void {}

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    const sub = this.sub()
    const from = sub.pts[sub.pts.length - 1]
    if (!from) return
    const c1 = this.at(c1x, c1y)
    const c2 = this.at(c2x, c2y)
    const to = this.at(x, y)
    for (let i = 1; i <= 20; i++) {
      const t = i / 20
      const u = 1 - t
      sub.pts.push([
        u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
        u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
      ])
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number): void {
    this.lineTo(x1, y1)
    this.lineTo(x2, y2)
  }
  roundRect(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h)
  }

  private at(x: number, y: number): Pt {
    return [this.m[0] * x + this.m[2] * y + this.m[4], this.m[1] * x + this.m[3] * y + this.m[5]]
  }
  /** How much the current transform stretches a stroke width. */
  private zoom(): number {
    return Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2])) || 1
  }
  private sub(): { pts: Pt[]; closed: boolean } {
    const last = this.path[this.path.length - 1]
    if (last && !last.closed) return last
    const fresh = { pts: [] as Pt[], closed: false }
    this.path.push(fresh)
    return fresh
  }

  beginPath(): void {
    this.path = []
  }
  moveTo(x: number, y: number): void {
    this.path.push({ pts: [this.at(x, y)], closed: false })
  }
  lineTo(x: number, y: number): void {
    this.sub().pts.push(this.at(x, y))
  }
  closePath(): void {
    const last = this.path[this.path.length - 1]
    if (last) last.closed = true
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const sub = this.sub()
    const from = sub.pts[sub.pts.length - 1]
    if (!from) return
    // Sampled after the transform, which is allowed: the control point goes
    // through the same matrix the ends do.
    const c = this.at(cx, cy)
    const to = this.at(x, y)
    for (let i = 1; i <= 16; i++) {
      const t = i / 16
      const u = 1 - t
      sub.pts.push([
        u * u * from[0] + 2 * u * t * c[0] + t * t * to[0],
        u * u * from[1] + 2 * u * t * c[1] + t * t * to[1],
      ])
    }
  }
  arc(x: number, y: number, r: number, from: number, to: number): void {
    this.ellipse(x, y, r, r, 0, from, to)
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    from: number,
    to: number,
  ): void {
    const sub = this.sub()
    const span = to - from
    for (let i = 0; i <= ARC_STEPS; i++) {
      const a = from + (span * i) / ARC_STEPS
      const px = Math.cos(a) * rx
      const py = Math.sin(a) * ry
      sub.pts.push(
        this.at(
          x + px * Math.cos(rotation) - py * Math.sin(rotation),
          y + px * Math.sin(rotation) + py * Math.cos(rotation),
        ),
      )
    }
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.beginPath()
    this.moveTo(x, y)
    this.lineTo(x + w, y)
    this.lineTo(x + w, y + h)
    this.lineTo(x, y + h)
    this.closePath()
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h)
    this.fill()
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h)
    this.stroke()
  }

  private taken(): Shape['subpaths'] {
    return this.path
      .filter((p) => p.pts.length > 0)
      .map((p) => ({ pts: [...p.pts], closed: p.closed }))
  }
  fill(): void {
    const subpaths = this.taken()
    if (subpaths.length) {
      this.shapes.push({
        subpaths,
        fill: { colour: colourOf(this.fillStyle), alpha: this.globalAlpha },
      })
    }
  }
  stroke(): void {
    const subpaths = this.taken()
    if (!subpaths.length) return
    this.shapes.push({
      subpaths,
      stroke: {
        colour: colourOf(this.strokeStyle),
        alpha: this.globalAlpha,
        width: this.lineWidth * this.zoom(),
        cap: this.lineCap,
        join: this.lineJoin,
      },
    })
  }
  fillText(text: string, x: number, y: number): void {
    const [px, py] = this.at(x, y)
    const size = Number.parseFloat(this.font.replace(/^bold\s+/, '')) || 10
    this.texts.push({
      text,
      x: px,
      y: py + (this.textBaseline === 'middle' ? size * 0.35 : 0),
      colour: colourOf(this.fillStyle),
      size,
      anchor: this.textAlign,
      alpha: this.globalAlpha,
    })
  }
  /** Outlined text is the same text: the recorder keeps one copy of it. */
  strokeText(): void {}
  measureText(text: string): { width: number } {
    return { width: text.length * 6 }
  }
  createLinearGradient(): Gradient {
    return new Gradient()
  }
  createRadialGradient(): Gradient {
    return new Gradient()
  }

  /** Hands the recorder to code that wants a real canvas context. */
  as2d(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D
  }
}

// --- SVG -------------------------------------------------------------------

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function toSvg(ctx: RecordingCtx, w: number, h: number, background: string): string {
  const body: string[] = []
  for (const shape of ctx.shapes) {
    const d = shape.subpaths
      .map(
        (p) =>
          `M ${p.pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')}${p.closed ? ' Z' : ''}`,
      )
      .join(' ')
    if (shape.fill) {
      body.push(`<path d="${d}" fill="${shape.fill.colour}" fill-opacity="${shape.fill.alpha}"/>`)
    }
    if (shape.stroke) {
      const s = shape.stroke
      body.push(
        `<path d="${d}" fill="none" stroke="${s.colour}" stroke-opacity="${s.alpha}" stroke-width="${s.width.toFixed(2)}" stroke-linecap="${s.cap}" stroke-linejoin="${s.join}"/>`,
      )
    }
  }
  for (const t of ctx.texts) {
    const anchor = t.anchor === 'center' ? 'middle' : t.anchor === 'right' ? 'end' : 'start'
    body.push(
      `<text x="${t.x.toFixed(2)}" y="${t.y.toFixed(2)}" fill="${t.colour}" fill-opacity="${t.alpha}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="${t.size}" text-anchor="${anchor}">${escape(t.text)}</text>`,
    )
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${background}"/>`,
    ...body,
    '</svg>',
  ].join('\n')
}

// --- raster ----------------------------------------------------------------

const SS = 2 // supersample factor, averaged down at the end

function rgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const parts = hex.match(/[\d.]+/g) ?? []
    return [Number(parts[0] ?? 0), Number(parts[1] ?? 0), Number(parts[2] ?? 0)]
  }
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  const n = Number.parseInt(h.slice(0, 6), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 0, 255]
}

function alphaOf(colour: string): number {
  if (!colour.startsWith('rgba')) return 1
  const parts = colour.match(/[\d.]+/g) ?? []
  return Number(parts[3] ?? 1)
}

/** Fills closed polygons by nonzero winding, one scanline at a time. */
function fillPolys(
  buf: Float32Array,
  w: number,
  h: number,
  polys: Pt[][],
  colour: [number, number, number],
  alpha: number,
): void {
  if (alpha <= 0) return
  let minY = Infinity
  let maxY = -Infinity
  const edges: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!
      const b = poly[(i + 1) % poly.length]!
      if (a[1] === b[1]) continue
      edges.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1] })
      minY = Math.min(minY, a[1], b[1])
      maxY = Math.max(maxY, a[1], b[1])
    }
  }
  if (!edges.length) return
  const from = Math.max(0, Math.floor(minY))
  const to = Math.min(h - 1, Math.ceil(maxY))
  const hits: { x: number; dir: number }[] = []
  for (let y = from; y <= to; y++) {
    const sy = y + 0.5
    hits.length = 0
    for (const e of edges) {
      const lo = Math.min(e.y0, e.y1)
      const hi = Math.max(e.y0, e.y1)
      if (sy < lo || sy >= hi) continue
      const t = (sy - e.y0) / (e.y1 - e.y0)
      hits.push({ x: e.x0 + (e.x1 - e.x0) * t, dir: e.y1 > e.y0 ? 1 : -1 })
    }
    if (hits.length < 2) continue
    hits.sort((a, b) => a.x - b.x)
    let winding = 0
    for (let i = 0; i < hits.length - 1; i++) {
      winding += hits[i]!.dir
      if (winding === 0) continue
      const x0 = Math.max(0, Math.ceil(hits[i]!.x - 0.5))
      const x1 = Math.min(w - 1, Math.floor(hits[i + 1]!.x - 0.5))
      for (let x = x0; x <= x1; x++) {
        const at = (y * w + x) * 3
        buf[at] = buf[at]! + (colour[0] - buf[at]!) * alpha
        buf[at + 1] = buf[at + 1]! + (colour[1] - buf[at + 1]!) * alpha
        buf[at + 2] = buf[at + 2]! + (colour[2] - buf[at + 2]!) * alpha
      }
    }
  }
}

/** A stroked polyline, as one quad per segment and a disc at every joint. */
function strokePolys(
  buf: Float32Array,
  w: number,
  h: number,
  subpaths: Shape['subpaths'],
  width: number,
  colour: [number, number, number],
  alpha: number,
): void {
  const r = Math.max(0.35, width / 2)
  const disc: Pt[] = []
  for (const sub of subpaths) {
    const pts = sub.closed && sub.pts.length > 1 ? [...sub.pts, sub.pts[0]!] : sub.pts
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]!
      const [x1, y1] = pts[i + 1]!
      const dx = x1 - x0
      const dy = y1 - y0
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) continue
      const nx = (-dy / len) * r
      const ny = (dx / len) * r
      fillPolys(
        buf,
        w,
        h,
        [
          [
            [x0 + nx, y0 + ny],
            [x1 + nx, y1 + ny],
            [x1 - nx, y1 - ny],
            [x0 - nx, y0 - ny],
          ],
        ],
        colour,
        alpha,
      )
    }
    // Joints and caps, so a corner is not a notch. Everything the game draws
    // is round-capped and round-joined, which is a disc either way.
    if (r > 0.7) {
      for (const [x, y] of pts) {
        disc.length = 0
        for (let a = 0; a < 12; a++) {
          const t = (a / 12) * Math.PI * 2
          disc.push([x + Math.cos(t) * r, y + Math.sin(t) * r])
        }
        fillPolys(buf, w, h, [disc], colour, alpha)
      }
    }
  }
}

export function toPng(ctx: RecordingCtx, w: number, h: number, background: string): Buffer {
  const bw = w * SS
  const bh = h * SS
  const buf = new Float32Array(bw * bh * 3)
  const bg = rgb(background)
  for (let i = 0; i < bw * bh; i++) {
    buf[i * 3] = bg[0]
    buf[i * 3 + 1] = bg[1]
    buf[i * 3 + 2] = bg[2]
  }

  for (const shape of ctx.shapes) {
    const scaled = shape.subpaths.map((p) => ({
      pts: p.pts.map(([x, y]) => [x * SS, y * SS] as Pt),
      closed: p.closed,
    }))
    if (shape.fill) {
      fillPolys(
        buf,
        bw,
        bh,
        scaled.map((p) => p.pts),
        rgb(shape.fill.colour),
        shape.fill.alpha * alphaOf(shape.fill.colour),
      )
    }
    if (shape.stroke) {
      strokePolys(
        buf,
        bw,
        bh,
        scaled,
        shape.stroke.width * SS,
        rgb(shape.stroke.colour),
        shape.stroke.alpha * alphaOf(shape.stroke.colour),
      )
    }
  }

  // Down to the real size, which is the whole antialiasing story.
  const stride = w * 3 + 1
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    px[y * stride] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            sum += buf[((y * SS + sy) * bw + (x * SS + sx)) * 3 + c]!
          }
        }
        px[y * stride + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(sum / (SS * SS))))
      }
    }
  }
  return png(px, w, h)
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(pixels: Buffer, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
