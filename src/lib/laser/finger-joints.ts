// Finger joints — versión con tabs saliendo hacia afuera del rectángulo
// Puerto simplificado de boxes/edges.py

import { Turtle } from './turtle'
import type { EdgeCode, FingerJointSettings } from '@/types/laser'

// ---- Cálculo de fingers (algoritmo exacto de Boxes.py) ----

export interface FingerCalc {
  fingers: number
  leftover: number
}

export function calcFingers(length: number, s: FingerJointSettings): FingerCalc {
  const { space, finger, surroundingspaces, thickness } = s
  let fingers = Math.floor((length - (surroundingspaces - 1) * space) / (space + finger))
  if (fingers === 0 && length > finger + 1.0 * thickness) fingers = 1
  if (finger === 0) fingers = 0
  let leftover = length - fingers * (space + finger) + space
  if (fingers <= 0) {
    fingers = 0
    leftover = length
  }
  return { fingers, leftover }
}

// ---- Dibujo de un borde con finger joints ----
// El cursor va en +X (angle=0). El tab "positive" sale hacia -Y (afuera, arriba del rect).
// El tab "negative" sale hacia +Y (adentro, dentro del rect).
// Recorremos el rect en sentido HORARIO (en SVG Y-down):
//   bottom: +X (derecha), tabs salen -Y (arriba, afuera si positive)
//   right:  +Y (abajo),   tabs salen +X (derecha, afuera si positive)
//   top:    -X (izq),     tabs salen +Y (abajo, afuera si positive)
//   left:   -Y (arriba),  tabs salen -X (izq, afuera si positive)
function drawEdgeWithFingers(
  t: Turtle,
  code: EdgeCode,
  length: number,
  s: FingerJointSettings,
  outwardDirection: number, // ángulo hacia afuera del borde (90, 180, 270, 0)
): void {
  if (code === 'e' || code === 'E' || code === 's' || code === 'S' || code === 'h') {
    t.edge(length)
    return
  }
  // 'f' = positive (tab hacia afuera)
  // 'F' = negative (slot hacia adentro)
  const positive = code === 'f'
  const { fingers, leftover } = calcFingers(length, s)
  if (fingers === 0) {
    t.edge(length)
    return
  }
  const left = leftover / 2
  const right = leftover - left
  const h = s.thickness
  const f = s.finger

  t.edge(left)
  for (let i = 0; i < fingers; i++) {
    // Dirección del tab: hacia afuera si positive, hacia adentro si negative
    const tabDir = positive ? outwardDirection : (outwardDirection + 180) % 360
    // Rotar al ángulo del tab, avanzar h, rotar de vuelta al ángulo del borde
    const currentAngle = t.angle
    t.setAngle(tabDir)
    t.edge(h)
    t.setAngle(currentAngle)
    t.edge(f)
    t.setAngle((tabDir + 180) % 360)
    t.edge(h)
    t.setAngle(currentAngle)
    if (i < fingers - 1) t.edge(s.space)
  }
  t.edge(right)
}

// ---- Compensación de ancho del borde ----

export function edgeWidth(code: EdgeCode, thickness: number): number {
  switch (code) {
    case 'f':
    case 'F':
      return thickness
    case 'h':
      return 0
    case 'e':
    case 'E':
    case 's':
    case 'S':
    default:
      return 0
  }
}

// ---- rectangularWall: genera una pared rectangular con 4 bordes ----
// edges = [bottom, right, top, left]
// Recorre en sentido horario empezando en (0,0):
//   bottom: → +X, outward = -Y (arriba, afuera)
//   right:  ↓ +Y, outward = +X (derecha, afuera)
//   top:    ← -X, outward = +Y (abajo, afuera)
//   left:   ↑ -Y, outward = -X (izquierda, afuera)
// En SVG Y-down, "arriba" = -Y, "abajo" = +Y, "izq" = -X, "der" = +X

export interface WallResult {
  svg: string
  width: number
  height: number
}

export function rectangularWall(
  w: number,
  h: number,
  edges: [EdgeCode, EdgeCode, EdgeCode, EdgeCode],
  s: FingerJointSettings,
  label = '',
): WallResult {
  const t = new Turtle(s.play)
  // Offset para que los tabs que salen hacia afuera no se salgan del bounding box
  const off = s.thickness
  t.moveTo(off, off)
  t.setAngle(0)

  // Para cada borde: length, turn después, dirección "hacia afuera"
  // bottom: length=w, ángulo=0 (+X), afuera=270 (-Y, arriba en SVG)
  // right:  length=h, ángulo=90 (+Y), afuera=0 (+X, derecha)
  // top:    length=w, ángulo=180 (-X), afuera=90 (+Y, abajo)
  // left:   length=h, ángulo=270 (-Y), afuera=180 (-X, izquierda)
  const config = [
    { len: w, angle: 0,   outward: 270 },
    { len: h, angle: 90,  outward: 0   },
    { len: w, angle: 180, outward: 90  },
    { len: h, angle: 270, outward: 180 },
  ]

  for (let i = 0; i < 4; i++) {
    t.setAngle(config[i].angle)
    drawEdgeWithFingers(t, edges[i], config[i].len, s, config[i].outward)
  }
  t.closePath()

  const totalW = w + 2 * edgeWidth(edges[3], s.thickness) + 2 * edgeWidth(edges[1], s.thickness)
  const totalH = h + 2 * edgeWidth(edges[0], s.thickness) + 2 * edgeWidth(edges[2], s.thickness)
  const svg = t.toSvg()

  return { svg, width: totalW, height: totalH }
}

// ---- Genera un finger joint settings desde parámetros de plantilla ----

export function fingerJointFromParams(
  thickness: number,
  fjSpace: number,
  fjFinger: number,
  fjSurrounding: number,
  fjPlay: number,
  style: FingerJointSettings['style'] = 'rectangular',
): FingerJointSettings {
  return {
    thickness,
    space: fjSpace * thickness,
    finger: fjFinger * thickness,
    surroundingspaces: fjSurrounding,
    play: fjPlay,
    style,
  }
}
