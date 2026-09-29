// Plantillas paramétricas — reescritas para generar SVG CORRECTO
// Sistema: cada pieza es un rectángulo con finger joints opcionales en sus bordes

import type { Template, TemplateParam, TemplatePart, GenerationResult, MaterialInfo, EdgeCode } from '@/types/laser'
import { Turtle } from './turtle'
import { rectangularWall, fingerJointFromParams, edgeWidth } from './finger-joints'

// ---- Helper: layout de partes en una lámina ----

function layoutParts(parts: TemplatePart[], material: MaterialInfo): { svg: string; sheetW: number; sheetH: number; used: number } {
  const PAD = 5
  let x = PAD
  let y = PAD
  let rowMax = 0
  const placed: TemplatePart[] = []
  const MAX_W = 600

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
      const labelSvg = `<text x="${(p.x + p.width / 2).toFixed(2)}" y="${(p.y - 1).toFixed(2)}" font-size="6" font-family="Arial" fill="#6b7280" text-anchor="middle">${escapeXml(p.label)}</text>`
      return `  <g data-role="${p.role}" data-label="${escapeXml(p.label)}" data-w="${p.width.toFixed(2)}" data-h="${p.height.toFixed(2)}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">
${p.svg}
    <rect x="0" y="0" width="${p.width.toFixed(2)}" height="${p.height.toFixed(2)}" fill="none" stroke="${material.cutColor}" stroke-width="0.1" stroke-dasharray="1 1" opacity="0.3"/>
  </g>`
    })
    .join('\n')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}" height="${sheetH}" stroke="${material.cutColor}" stroke-width="0.4" fill="none">
  <rect x="0" y="0" width="${sheetW}" height="${sheetH}" fill="#fafafa" stroke="#d1d5db" stroke-width="0.5"/>
${groups}
</svg>`

  const used = placed.reduce((acc, p) => acc + p.width * p.height, 0)
  return { svg, sheetW, sheetH, used }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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
  const topCode: EdgeCode = lidType === 'closed' ? 'f' : 'F'
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

  // Tirador tipo U (simple): rectángulo con un hueco rectangular central
  const handleT = new Turtle()
  handleT.rect(0, 0, hw, hh + t)
  // Hueco del tirador (donde meter los dedos)
  handleT.rectangularHole(t, t, hw - 2 * t, hh, 2)
  const handlePart: TemplatePart = {
    id: 'handle', label: 'Tirador', role: 'handle',
    svg: handleT.toSvg(), x: 0, y: 0, width: hw, height: hh + t,
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

  // Lados con repisas: bordes verticales con finger holes para insertar repisas
  // Usamos 'f' en bottom y 'e' en top para un estante abierto por arriba
  const left  = rectangularWall(d, h, ['f', 'e', 'f', 'e'], fj, 'left')
  const right = rectangularWall(d, h, ['f', 'e', 'f', 'e'], fj, 'right')
  // Back como pared completa para dar rigidez
  const back  = rectangularWall(w, h, ['f', 'e', 'f', 'e'], fj, 'back')

  const parts: TemplatePart[] = [
    partFromWall('left',  'Lado Izq', 'left',  left),
    partFromWall('right', 'Lado Der', 'right', right),
    partFromWall('back',  'Trasera',  'back',  back),
  ]

  // Repisas: rectángulos con finger joints en lados izquierdo y derecho (encajan en los lados)
  for (let i = 0; i < shelves; i++) {
    const shelf = rectangularWall(w, d, ['e', 'f', 'e', 'f'], fj, `shelf-${i}`)
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

  const stepD = d / steps

  // Lados simples (rectángulos completos)
  const sideT = new Turtle()
  sideT.rect(0, 0, d, h)
  const leftSide: TemplatePart = {
    id: 'left', label: 'Lado Izq', role: 'left',
    svg: sideT.toSvg(), x: 0, y: 0, width: d, height: h,
  }
  const rightSide: TemplatePart = {
    id: 'right', label: 'Lado Der', role: 'right',
    svg: sideT.toSvg(), x: 0, y: 0, width: d, height: h,
  }
  const parts: TemplatePart[] = [leftSide, rightSide]

  // Repisas escalonadas: cada escalón es un rectángulo más profundo
  for (let i = 0; i < steps; i++) {
    const shelfW = w
    const shelfD = stepD * (steps - i)
    const shelf = rectangularWall(shelfW, shelfD, ['e', 'f', 'e', 'f'], fj, `shelf-${i}`)
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
  t.closePath()
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
  // Cuerpo redondeado
  t.moveTo(r, 0)
  t.polyline(w - 2 * r, [90, r])
  t.polyline(h - 2 * r, [90, r])
  t.polyline(w - 2 * r, [90, r])
  t.polyline(h - 2 * r, [90, r])
  t.closePath()
  // Agujeros de montaje en esquinas
  t.circle(8, 8, 2)
  t.circle(w - 8, 8, 2)
  t.circle(8, h - 8, 2)
  t.circle(w - 8, h - 8, 2)
  // Texto principal
  t.text(w / 2, h * 0.4, text, fs)
  // Subtítulo
  if (sub) t.text(w / 2, h * 0.7, sub, fs * 0.6)
  // Borde decorativo interior
  const inner = new Turtle()
  inner.moveTo(r + 3, 3)
  inner.polyline(w - 2 * (r + 3), [90, r])
  inner.polyline(h - 2 * (r + 3), [90, r])
  inner.polyline(w - 2 * (r + 3), [90, r])
  inner.polyline(h - 2 * (r + 3), [90, r])
  inner.closePath()

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
    // Elipse: dos arcos
    const rx = w / 2
    const ry = h / 2
    t.paths.push(`M 0 ${ry.toFixed(3)} A ${rx.toFixed(3)} ${ry.toFixed(3)} 0 1 1 ${w.toFixed(3)} ${ry.toFixed(3)} A ${rx.toFixed(3)} ${ry.toFixed(3)} 0 1 1 0 ${ry.toFixed(3)} Z`)
    t.pathStarted = false
  } else if (border === 'rounded') {
    const r = Math.min(w, h) * 0.15
    t.moveTo(r, 0)
    t.polyline(w - 2 * r, [90, r])
    t.polyline(h - 2 * r, [90, r])
    t.polyline(w - 2 * r, [90, r])
    t.polyline(h - 2 * r, [90, r])
    t.closePath()
  } else {
    t.rect(0, 0, w, h)
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
// PLANTILLA 8: FRAME — portaretrato con soporte trasero
// ============================================================

const frameParams: TemplateParam[] = [
  { id: 'photoW',   label: 'Ancho foto',   type: 'number', default: 200, min: 50, max: 500, unit: 'mm' },
  { id: 'photoH',   label: 'Alto foto',     type: 'number', default: 150, min: 50, max: 500, unit: 'mm' },
  { id: 'border',   label: 'Ancho marco',   type: 'number', default: 25,  min: 10, max: 60,  unit: 'mm' },
  { id: 'thickness', label: 'Grosor',       type: 'number', default: 6,   min: 3,  max: 12,  unit: 'mm' },
  { id: 'standAngle', label: 'Ángulo soporte', type: 'select', default: '15', options: ['10', '15', '20', '25'] },
  { id: 'holeR',    label: 'Radio agujero colgador', type: 'number', default: 3, min: 2, max: 8, unit: 'mm' },
  { id: 'text',     label: 'Grabado (opcional)', type: 'text', default: '' },
  { id: 'fontSize',  label: 'Tamaño texto',  type: 'number', default: 14, min: 8, max: 30 },
]

function generateFrame(params: Record<string, number | string>, material: MaterialInfo): GenerationResult {
  const photoW = num(params, 'photoW', 200)
  const photoH = num(params, 'photoH', 150)
  const b = num(params, 'border', 25)
  const t = num(params, 'thickness', material.thickness)
  const holeR = num(params, 'holeR', 3)
  const text = str(params, 'text', '')
  const fs = num(params, 'fontSize', 14)

  const outerW = photoW + 2 * b
  const outerH = photoH + 2 * b

  // 1) MARCO FRONTAL: rectángulo exterior con ventana rectangular interior
  const frameT = new Turtle()
  // Exterior (sentido horario)
  frameT.rect(0, 0, outerW, outerH)
  // Ventana interior (sentido antihorario para hacer hole con fill-rule)
  frameT.rectangularHole(b, b, photoW, photoH, 0)
  // Agujero colgador centrado arriba
  frameT.circle(outerW / 2, outerH - b / 2, holeR)
  // Grabado opcional en el borde inferior
  if (text) {
    frameT.text(outerW / 2, b / 2 + fs / 3, text, fs)
  }

  const frontPart: TemplatePart = {
    id: 'frame-front', label: 'Marco frontal', role: 'front',
    svg: frameT.toSvg(),
    x: 0, y: 0, width: outerW, height: outerH,
  }

  // 2) RESPALDO: rectángulo completo con 2 agujeros para bisagra
  const backT = new Turtle()
  backT.rect(0, 0, outerW, outerH)
  backT.circle(outerW * 0.3, outerH - 3, 1.5)
  backT.circle(outerW * 0.7, outerH - 3, 1.5)

  const backPart: TemplatePart = {
    id: 'frame-back', label: 'Respaldo', role: 'back',
    svg: backT.toSvg(),
    x: 0, y: 0, width: outerW, height: outerH,
  }

  // 3) PIE DE SOPORTE: triángulo simple con agujero para colgar
  const standAngle = parseInt(str(params, 'standAngle', '15'))
  const standH = Math.min(outerH * 0.5, 80)
  const standW = standH * Math.tan((standAngle * Math.PI) / 180)
  const tri = new Turtle()
  // Triángulo rectángulo: (0,0) → (standW, 0) → (0, standH) → cerrar
  tri.moveTo(0, 0)
  tri.edge(standW)
  tri.corner(90)
  // Hipotenusa hasta (0, standH)
  const hip = Math.sqrt(standW * standW + standH * standH)
  // Calcular ángulo de la hipotenusa
  const hipAngle = Math.atan2(standH, -standW) * 180 / Math.PI
  tri.setAngle(hipAngle)
  tri.edge(hip)
  tri.closePath()
  // Agujero para colgar
  tri.circle(standW / 3, standH / 3, holeR)

  const standPart: TemplatePart = {
    id: 'stand', label: 'Pie de soporte', role: 'handle',
    svg: tri.toSvg(),
    x: 0, y: 0,
    width: standW,
    height: standH,
  }

  const parts: TemplatePart[] = [frontPart, backPart, standPart]
  const layout = layoutParts(parts, material)

  return {
    svg: layout.svg,
    parts,
    dimensions: { width: outerW, height: outerH, depth: t },
    partCount: parts.length,
    materialUsage: { sheetW: layout.sheetW, sheetH: layout.sheetH, used: layout.used },
  }
}

// ============================================================
// REGISTRO DE PLANTILLAS
// ============================================================

export const TEMPLATES: Template[] = [
  { id: 'box',           name: 'Caja',          description: 'Caja ensamblable con 6 caras y finger joints', icon: 'Box',       params: boxParams,      generate: generateBox },
  { id: 'drawer',        name: 'Cajón',         description: 'Cajón con tirador tipo U',                     icon: 'Archive',   params: drawerParams,   generate: generateDrawer },
  { id: 'shelf',         name: 'Estante',       description: 'Estante con repisas internas',                 icon: 'Library',   params: shelfParams,    generate: generateShelf },
  { id: 'display',       name: 'Exhibidor',     description: 'Exhibidor escalonado tipo mostrador',          icon: 'Columns',   params: displayParams,  generate: generateDisplay },
  { id: 'keychain',      name: 'Llavero',       description: 'Llavero con texto personalizado',              icon: 'Key',       params: keychainParams, generate: generateKeychain },
  { id: 'plaque',        name: 'Placa',         description: 'Placa conmemorativa con nombre',               icon: 'Award',     params: plaqueParams,   generate: generatePlaque },
  { id: 'sign',          name: 'Letrero',       description: 'Letrero decorativo con texto grande',          icon: 'Signpost',  params: signParams,     generate: generateSign },
  { id: 'frame',         name: 'Portaretrato',  description: 'Portaretrato con marco, respaldo y pie',       icon: 'Image',     params: frameParams,    generate: generateFrame },
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
