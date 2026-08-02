// Plantillas paramétricas — 7 modelos basados en Boxes.py
// Sistema de edges: 'e' (recto), 'f' (finger positivo), 'F' (finger negativo), 'h' (holes)

import type { Template, TemplateParam, TemplatePart, GenerationResult, MaterialInfo, EdgeCode } from '@/types/laser'
import { Turtle } from './turtle'
import { rectangularWall, fingerJointFromParams, edgeWidth } from './finger-joints'

// ---- Helper: layout de partes en una lámina ----

function layoutParts(parts: TemplatePart[], material: MaterialInfo): { svg: string; sheetW: number; sheetH: number; used: number } {
  // Padding entre piezas
  const PAD = 5
  let x = PAD
  let y = PAD
  let rowMax = 0
  const placed: TemplatePart[] = []
  const MAX_W = 600 // ancho de lámina virtual

  for (const p of parts) {
    if (x + p.width + PAD > MAX_W) {
      x = PAD
      y += rowMax + PAD
      rowMax = 0
    }
    placed.push({ ...p, x, y })
    x += p.width + PAD
    rowMax = Math.max(rowMax, p.height)
  }

  const sheetW = MAX_W
  const sheetH = y + rowMax + PAD

  const groups = placed
    .map((p) => {
      const w = p.width
      const h = p.height
      const labelSvg = `<text x="${(p.x + w / 2).toFixed(2)}" y="${(p.y - 1).toFixed(2)}" font-size="6" font-family="Arial" fill="#6b7280" text-anchor="middle">${escapeXml(p.label)}</text>`
      return `  <g data-role="${p.role}" data-label="${escapeXml(p.label)}" data-w="${w}" data-h="${h}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">
${p.svg}
    <rect x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="none" stroke="${material.cutColor}" stroke-width="0.1" stroke-dasharray="1 1" opacity="0.3"/>
  </g>`
    })
    .join('\n')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}" height="${sheetH}" stroke="${material.cutColor}" stroke-width="0.4" fill="none">
  <rect x="0" y="0" width="${sheetW}" height="${sheetH}" fill="#fafafa" stroke="#d1d5db" stroke-width="0.5"/>
${groups}
</svg>`

  // Calcular área usada
  const used = placed.reduce((acc, p) => acc + p.width * p.height, 0)
  return { svg, sheetW, sheetH, used }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---- Helper: convertir Turtle SVG a TemplatePart ----

function partFromWall(
  id: string,
  label: string,
  role: TemplatePart['role'],
  wall: { svg: string; width: number; height: number },
): TemplatePart {
  return {
    id,
    label,
    role,
    svg: wall.svg,
    x: 0,
    y: 0,
    width: wall.width,
    height: wall.height,
  }
}

// ---- Helper: leer parámetros numéricos con defaults ----

function num(params: Record<string, number | string>, key: string, fallback: number): number {
  const v = params[key]
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function str(params: Record<string, number | string>, key: string, fallback: string): string {
  const v = params[key]
  if (v === undefined || v === null || v === '') return fallback
  return String(v)
}

// ============================================================
// PLANTILLA 1: BOX — caja ensamblable con 6 caras
// ============================================================

const boxParams: TemplateParam[] = [
  { id: 'width',       label: 'Ancho (X)',       type: 'number', default: 100, min: 30, max: 500, unit: 'mm' },
  { id: 'height',      label: 'Alto (Y)',        type: 'number', default: 80,  min: 30, max: 500, unit: 'mm' },
  { id: 'depth',       label: 'Profundidad (Z)', type: 'number', default: 60,  min: 30, max: 500, unit: 'mm' },
  { id: 'thickness',   label: 'Grosor material', type: 'number', default: 6,   min: 3,  max: 12,  unit: 'mm' },
  { id: 'fjSpace',     label: 'Espacio finger',  type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
  { id: 'fjFinger',    label: 'Ancho finger',    type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
  { id: 'fjSurrounding', label: 'Bordes finger', type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1 },
  { id: 'fjPlay',      label: 'Juego (play)',    type: 'number', default: 0.0, min: 0.0, max: 1.0, step: 0.05, unit: 'mm' },
  { id: 'lidType',     label: 'Tipo de tapa',    type: 'select', default: 'closed', options: ['closed', 'removable', 'flat'] },
  { id: 'bottomEdge',  label: 'Base',            type: 'select', default: 'finger', options: ['finger', 'straight', 'holes'] },
  { id: 'engravingText', label: 'Grabado',       type: 'text',   default: '' },
]

function generateBox(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 100)
  const h = num(params, 'height', 80)
  const d = num(params, 'depth', 60)
  const t = num(params, 'thickness', material.thickness)
  const lidType = str(params, 'lidType', 'closed')
  const bottomEdge = str(params, 'bottomEdge', 'finger')
  const engraving = str(params, 'engravingText', '')

  const fj = fingerJointFromParams(
    t,
    num(params, 'fjSpace', 2.0),
    num(params, 'fjFinger', 2.0),
    num(params, 'fjSurrounding', 2.0),
    num(params, 'fjPlay', 0.0),
  )

  const bottomCode: EdgeCode = bottomEdge === 'straight' ? 'e' : bottomEdge === 'holes' ? 'h' : 'f'
  const topCode: EdgeCode = lidType === 'closed' ? 'f' : 'F' // F = slot (tapa removible)
  const lidCode: EdgeCode = lidType === 'closed' ? 'F' : 'f'

  // Front y back: bordes [bottom, right, top, left]
  const front = rectangularWall(w, h, [bottomCode, 'f', topCode, 'f'], fj, 'front')
  const back  = rectangularWall(w, h, [bottomCode, 'F', topCode, 'F'], fj, 'back')
  const left  = rectangularWall(d, h, [bottomCode, 'f', topCode, 'F'], fj, 'left')
  const right = rectangularWall(d, h, [bottomCode, 'F', topCode, 'f'], fj, 'right')
  const bottom = rectangularWall(w, d, ['F', 'F', 'F', 'F'], fj, 'bottom')
  const top    = rectangularWall(w, d, [lidCode, lidCode, lidCode, lidCode], fj, 'top')

  const parts: TemplatePart[] = [
    partFromWall('front',  'Frente',   'front',  front),
    partFromWall('back',   'Trasera',  'back',   back),
    partFromWall('left',   'Lado Izq', 'left',   left),
    partFromWall('right',  'Lado Der', 'right',  right),
    partFromWall('bottom', 'Base',     'bottom', bottom),
    partFromWall('top',    'Tapa',     lidType === 'closed' ? 'top' : 'lid', top),
  ]

  // Grabado opcional en la tapa
  if (engraving) {
    const t2 = new Turtle()
    t2.text(top.width / 2, top.height / 2, engraving, 14)
    parts[5].svg += '\n' + t2.toSvg('fill="black" stroke="none"')
  }

  const layout = layoutParts(parts, material)

  return {
    svg: layout.svg,
    parts,
    dimensions: { width: w, height: h, depth: d },
    partCount: parts.length,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// PLANTILLA 2: DRAWER — cajón con tirador tipo U
// ============================================================

const drawerParams: TemplateParam[] = [
  { id: 'width',     label: 'Ancho',     type: 'number', default: 120, min: 40, max: 400, unit: 'mm' },
  { id: 'height',    label: 'Alto',      type: 'number', default: 50,  min: 20, max: 200, unit: 'mm' },
  { id: 'depth',     label: 'Profund.',  type: 'number', default: 100, min: 40, max: 400, unit: 'mm' },
  { id: 'thickness', label: 'Grosor',    type: 'number', default: 6,   min: 3,  max: 12,  unit: 'mm' },
  { id: 'handleWidth', label: 'Ancho tirador', type: 'number', default: 40, min: 20, max: 100, unit: 'mm' },
  { id: 'handleHeight', label: 'Alto tirador', type: 'number', default: 15, min: 8,  max: 40,  unit: 'mm' },
  { id: 'fjSpace',     label: 'Espacio finger',  type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
  { id: 'fjFinger',    label: 'Ancho finger',    type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
]

function generateDrawer(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 120)
  const h = num(params, 'height', 50)
  const d = num(params, 'depth', 100)
  const t = num(params, 'thickness', material.thickness)
  const hw = num(params, 'handleWidth', 40)
  const hh = num(params, 'handleHeight', 15)

  const fj = fingerJointFromParams(t, num(params, 'fjSpace', 2.0), num(params, 'fjFinger', 2.0), 2.0, 0)

  const front = rectangularWall(w, h, ['e', 'f', 'f', 'f'], fj, 'front')
  const back  = rectangularWall(w, h, ['e', 'F', 'F', 'F'], fj, 'back')
  const left  = rectangularWall(d, h, ['e', 'f', 'F', 'f'], fj, 'left')
  const right = rectangularWall(d, h, ['e', 'F', 'f', 'F'], fj, 'right')
  const bottom = rectangularWall(w, d, ['F', 'F', 'F', 'F'], fj, 'bottom')

  // Tirador tipo U
  const handleT = new Turtle()
  handleT.moveTo(0, 0)
  handleT.polyline(hw / 2, 90, hh, -90, hw, -90, hh, 90)

  const handlePart: TemplatePart = {
    id: 'handle',
    label: 'Tirador',
    role: 'handle',
    svg: handleT.toSvg(),
    x: 0,
    y: 0,
    width: hw,
    height: hh + t,
  }

  const parts: TemplatePart[] = [
    partFromWall('front',  'Frente',   'front',  front),
    partFromWall('back',   'Trasera',  'back',   back),
    partFromWall('left',   'Lado Izq', 'left',   left),
    partFromWall('right',  'Lado Der', 'right',  right),
    partFromWall('bottom', 'Base',     'bottom', bottom),
    handlePart,
  ]

  const layout = layoutParts(parts, material)
  return {
    svg: layout.svg,
    parts,
    dimensions: { width: w, height: h, depth: d },
    partCount: parts.length,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// PLANTILLA 3: SHELF — estante con repisas
// ============================================================

const shelfParams: TemplateParam[] = [
  { id: 'width',     label: 'Ancho',     type: 'number', default: 200, min: 80, max: 600, unit: 'mm' },
  { id: 'height',    label: 'Alto',      type: 'number', default: 250, min: 100, max: 600, unit: 'mm' },
  { id: 'depth',     label: 'Profund.',  type: 'number', default: 80,  min: 40, max: 300, unit: 'mm' },
  { id: 'thickness', label: 'Grosor',    type: 'number', default: 6,   min: 3,  max: 12,  unit: 'mm' },
  { id: 'shelves',   label: 'Núm. repisas', type: 'number', default: 3, min: 1, max: 8 },
  { id: 'fjSpace',   label: 'Espacio finger',  type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
  { id: 'fjFinger',  label: 'Ancho finger',    type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
]

function generateShelf(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 200)
  const h = num(params, 'height', 250)
  const d = num(params, 'depth', 80)
  const t = num(params, 'thickness', material.thickness)
  const shelves = Math.floor(num(params, 'shelves', 3))

  const fj = fingerJointFromParams(t, num(params, 'fjSpace', 2.0), num(params, 'fjFinger', 2.0), 2.0, 0)

  const left  = rectangularWall(d, h, ['e', 'f', 'e', 'f'], fj, 'left')
  const right = rectangularWall(d, h, ['e', 'F', 'e', 'F'], fj, 'right')
  const back  = rectangularWall(w, h, ['e', 'e', 'e', 'e'], fj, 'back')

  const parts: TemplatePart[] = [
    partFromWall('left',  'Lado Izq', 'left',  left),
    partFromWall('right', 'Lado Der', 'right', right),
    partFromWall('back',  'Trasera',  'back',  back),
  ]

  // Repisas
  for (let i = 0; i < shelves; i++) {
    const shelf = rectangularWall(w, d, ['F', 'F', 'F', 'F'], fj, `shelf-${i}`)
    parts.push(partFromWall(`shelf-${i}`, `Repisa ${i + 1}`, 'shelf', shelf))
  }

  const layout = layoutParts(parts, material)
  return {
    svg: layout.svg,
    parts,
    dimensions: { width: w, height: h, depth: d },
    partCount: parts.length,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// PLANTILLA 4: DISPLAY — exhibidor escalonado
// ============================================================

const displayParams: TemplateParam[] = [
  { id: 'width',     label: 'Ancho',     type: 'number', default: 200, min: 80, max: 400, unit: 'mm' },
  { id: 'height',    label: 'Alto',      type: 'number', default: 150, min: 80, max: 300, unit: 'mm' },
  { id: 'depth',     label: 'Profund.',  type: 'number', default: 100, min: 60, max: 250, unit: 'mm' },
  { id: 'thickness', label: 'Grosor',    type: 'number', default: 6,   min: 3,  max: 12,  unit: 'mm' },
  { id: 'steps',     label: 'Núm. escalones', type: 'number', default: 3, min: 2, max: 5 },
  { id: 'fjSpace',   label: 'Espacio finger',  type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
  { id: 'fjFinger',  label: 'Ancho finger',    type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.1, unit: '×t' },
]

function generateDisplay(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 200)
  const h = num(params, 'height', 150)
  const d = num(params, 'depth', 100)
  const t = num(params, 'thickness', material.thickness)
  const steps = Math.floor(num(params, 'steps', 3))

  const fj = fingerJointFromParams(t, num(params, 'fjSpace', 2.0), num(params, 'fjFinger', 2.0), 2.0, 0)

  const stepH = h / steps
  const stepD = d / steps

  const parts: TemplatePart[] = []

  // Lados escalonados (en forma de escalera)
  const sideT = new Turtle()
  sideT.moveTo(0, 0)
  for (let i = 0; i < steps; i++) {
    sideT.polyline(stepD, 90, stepH, -90)
  }
  sideT.polyline(d, 90, h, 90, d, 90, h, 90)

  const leftSide: TemplatePart = {
    id: 'left', label: 'Lado Izq', role: 'left',
    svg: sideT.toSvg(), x: 0, y: 0, width: d, height: h,
  }
  const rightSide: TemplatePart = {
    id: 'right', label: 'Lado Der', role: 'right',
    svg: sideT.toSvg(), x: 0, y: 0, width: d, height: h,
  }
  parts.push(leftSide, rightSide)

  // Repisas escalonadas
  for (let i = 0; i < steps; i++) {
    const shelfW = w
    const shelfD = stepD * (steps - i)
    const shelf = rectangularWall(shelfW, shelfD, ['F', 'F', 'e', 'F'], fj, `shelf-${i}`)
    parts.push(partFromWall(`shelf-${i}`, `Escalón ${i + 1}`, 'shelf', shelf))
  }

  const layout = layoutParts(parts, material)
  return {
    svg: layout.svg,
    parts,
    dimensions: { width: w, height: h, depth: d },
    partCount: parts.length,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// PLANTILLA 5: KEYCHAIN — llavero con texto
// ============================================================

const keychainParams: TemplateParam[] = [
  { id: 'width',     label: 'Ancho',     type: 'number', default: 50, min: 20, max: 120, unit: 'mm' },
  { id: 'height',    label: 'Alto',      type: 'number', default: 20, min: 10, max: 60,  unit: 'mm' },
  { id: 'holeR',     label: 'Radio agujero', type: 'number', default: 3, min: 2, max: 8, unit: 'mm' },
  { id: 'text',      label: 'Texto',     type: 'text',   default: 'LaserCraft' },
  { id: 'fontSize',  label: 'Tamaño texto', type: 'number', default: 10, min: 4, max: 24 },
  { id: 'radius',    label: 'Radio esquinas', type: 'number', default: 3, min: 0, max: 10, unit: 'mm' },
]

function generateKeychain(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 50)
  const h = num(params, 'height', 20)
  const r = num(params, 'radius', 3)
  const holeR = num(params, 'holeR', 3)
  const text = str(params, 'text', 'LaserCraft')
  const fs = num(params, 'fontSize', 10)

  const t = new Turtle()
  // Cuerpo redondeado
  t.moveTo(r, 0)
  t.polyline(w - 2 * r, [90, r])
  t.polyline(h - 2 * r, [90, r])
  t.polyline(w - 2 * r, [90, r])
  t.polyline(h - 2 * r, [90, r])
  // Agujero para llavero
  t.circle(holeR + 2, h / 2, holeR)
  // Texto
  if (text) {
    t.text(w / 2 + holeR + 2, h / 2 + fs / 3, text, fs)
  }

  const body: TemplatePart = {
    id: 'body', label: 'Llavero', role: 'body',
    svg: t.toSvg(), x: 0, y: 0, width: w, height: h,
  }

  const layout = layoutParts([body], material)
  return {
    svg: layout.svg,
    parts: [body],
    dimensions: { width: w, height: h, depth: material.thickness },
    partCount: 1,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// PLANTILLA 6: PLAQUE — placa con nombre
// ============================================================

const plaqueParams: TemplateParam[] = [
  { id: 'width',     label: 'Ancho',     type: 'number', default: 100, min: 40, max: 300, unit: 'mm' },
  { id: 'height',    label: 'Alto',      type: 'number', default: 60,  min: 20, max: 200, unit: 'mm' },
  { id: 'text',      label: 'Texto',     type: 'text',   default: 'Premio Excelencia' },
  { id: 'subtext',   label: 'Subtítulo', type: 'text',   default: '2025' },
  { id: 'fontSize',  label: 'Tamaño texto', type: 'number', default: 18, min: 8, max: 40 },
  { id: 'radius',    label: 'Radio esquinas', type: 'number', default: 5, min: 0, max: 20, unit: 'mm' },
]

function generatePlaque(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 100)
  const h = num(params, 'height', 60)
  const r = num(params, 'radius', 5)
  const text = str(params, 'text', 'Premio')
  const sub = str(params, 'subtext', '2025')
  const fs = num(params, 'fontSize', 18)

  const t = new Turtle()
  t.moveTo(r, 0)
  t.polyline(w - 2 * r, [90, r])
  t.polyline(h - 2 * r, [90, r])
  t.polyline(w - 2 * r, [90, r])
  t.polyline(h - 2 * r, [90, r])
  // Texto principal
  t.text(w / 2, h * 0.4, text, fs)
  // Subtítulo
  if (sub) t.text(w / 2, h * 0.7, sub, fs * 0.6)
  // Borde decorativo interior
  const inner = new Turtle()
  inner.moveTo(r + 3, 3)
  inner.polyline(w - 2 * (r + 3), [90, r], h - 2 * (r + 3), [90, r], w - 2 * (r + 3), [90, r], h - 2 * (r + 3), [90, r])

  const plate: TemplatePart = {
    id: 'plate', label: 'Placa', role: 'plate',
    svg: t.toSvg() + '\n' + inner.toSvg('stroke="blue" stroke-width="0.3" fill="none"'),
    x: 0, y: 0, width: w, height: h,
  }

  const layout = layoutParts([plate], material)
  return {
    svg: layout.svg,
    parts: [plate],
    dimensions: { width: w, height: h, depth: material.thickness },
    partCount: 1,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// PLANTILLA 7: SIGN — letrero decorativo
// ============================================================

const signParams: TemplateParam[] = [
  { id: 'width',     label: 'Ancho',     type: 'number', default: 200, min: 60, max: 500, unit: 'mm' },
  { id: 'height',    label: 'Alto',      type: 'number', default: 80,  min: 30, max: 200, unit: 'mm' },
  { id: 'text',      label: 'Texto',     type: 'text',   default: 'BIENVENIDO' },
  { id: 'fontSize',  label: 'Tamaño texto', type: 'number', default: 30, min: 10, max: 60 },
  { id: 'holeR',     label: 'Radio agujeros', type: 'number', default: 3, min: 2, max: 8, unit: 'mm' },
  { id: 'border',    label: 'Borde',     type: 'select', default: 'rect', options: ['rect', 'rounded', 'oval'] },
]

function generateSign(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const w = num(params, 'width', 200)
  const h = num(params, 'height', 80)
  const text = str(params, 'text', 'BIENVENIDO')
  const fs = num(params, 'fontSize', 30)
  const holeR = num(params, 'holeR', 3)
  const border = str(params, 'border', 'rect')

  const t = new Turtle()

  if (border === 'oval') {
    // Elipse
    const rx = w / 2
    const ry = h / 2
    t.paths.push(`M 0 ${ry} A ${rx} ${ry} 0 1 1 ${w} ${ry} A ${rx} ${ry} 0 1 1 0 ${ry} Z`)
  } else if (border === 'rounded') {
    const r = Math.min(w, h) * 0.15
    t.moveTo(r, 0)
    t.polyline(w - 2 * r, [90, r])
    t.polyline(h - 2 * r, [90, r])
    t.polyline(w - 2 * r, [90, r])
    t.polyline(h - 2 * r, [90, r])
  } else {
    t.moveTo(0, 0)
    t.polyline(w, 90, h, 90, w, 90, h, 90)
  }

  // Agujeros de montaje
  t.circle(holeR + 2, h / 2, holeR)
  t.circle(w - holeR - 2, h / 2, holeR)
  // Texto centrado
  if (text) t.text(w / 2, h / 2 + fs / 3, text, fs)

  const plate: TemplatePart = {
    id: 'plate', label: 'Letrero', role: 'plate',
    svg: t.toSvg(), x: 0, y: 0, width: w, height: h,
  }

  const layout = layoutParts([plate], material)
  return {
    svg: layout.svg,
    parts: [plate],
    dimensions: { width: w, height: h, depth: material.thickness },
    partCount: 1,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// REGISTRO DE PLANTILLAS
// ============================================================

export const TEMPLATES: Template[] = [
  { id: 'box',      name: 'Caja',         description: 'Caja ensamblable con 6 caras y finger joints', icon: 'Box',       params: boxParams,      generate: generateBox },
  { id: 'drawer',   name: 'Cajón',        description: 'Cajón con tirador tipo U',                     icon: 'Archive',   params: drawerParams,   generate: generateDrawer },
  { id: 'shelf',    name: 'Estante',      description: 'Estante con repisas internas',                 icon: 'Library',   params: shelfParams,    generate: generateShelf },
  { id: 'display',  name: 'Exhibidor',    description: 'Exhibidor escalonado tipo mostrador',          icon: 'Columns',   params: displayParams,  generate: generateDisplay },
  { id: 'keychain', name: 'Llavero',      description: 'Llavero con texto personalizado',              icon: 'Key',       params: keychainParams, generate: generateKeychain },
  { id: 'plaque',   name: 'Placa',        description: 'Placa conmemorativa con nombre',               icon: 'Award',     params: plaqueParams,   generate: generatePlaque },
  { id: 'sign',     name: 'Letrero',      description: 'Letrero decorativo con texto grande',          icon: 'Signpost',  params: signParams,     generate: generateSign },
]

export const TEMPLATE_MAP: Record<string, Template> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
)

export function getTemplate(id: string): Template | undefined {
  return TEMPLATE_MAP[id]
}

export function generateFromTemplate(
  templateId: string,
  params: Record<string, number | string>,
  material: MaterialInfo,
): GenerationResult {
  const tmpl = getTemplate(templateId)
  if (!tmpl) {
    throw new Error(`Plantilla no encontrada: ${templateId}`)
  }
  // Aplicar defaults
  const merged: Record<string, number | string> = {}
  for (const p of tmpl.params) merged[p.id] = p.default
  Object.assign(merged, params)
  return tmpl.generate(merged, material)
}

export { edgeWidth }
