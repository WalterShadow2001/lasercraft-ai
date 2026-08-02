// Finger joints — puerto de boxes/edges.py de Boxes.py
// Algoritmos: calcFingers(), drawFinger(), drawEdge(), rectangularWall()

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

// ---- Dibujo de un finger individual ----

export function drawFinger(t: Turtle, f: number, h: number, positive: boolean): void {
  if (positive) {
    // Tab hacia afuera
    t.polyline(0, -90, h, 90, f, 90, h, -90)
  } else {
    // Slot hacia adentro
    t.polyline(0, 90, h, -90, f, -90, h, 90)
  }
}

// ---- Dibujo de un borde completo con finger joints ----

export function drawEdge(
  t: Turtle,
  code: EdgeCode,
  length: number,
  s: FingerJointSettings,
): void {
  switch (code) {
    case 'e':
    case 'E': {
      t.edge(length)
      break
    }
    case 's':
    case 'S': {
      // Stackable simplificado (recto)
      t.edge(length)
      break
    }
    case 'f':
    case 'F': {
      const positive = code === 'f'
      const { fingers, leftover } = calcFingers(length, s)
      if (fingers === 0) {
        t.edge(length)
        break
      }
      // Distribuir leftover simétricamente
      const left = leftover / 2
      const right = leftover - left
      t.edge(left)
      for (let i = 0; i < fingers; i++) {
        drawFinger(t, s.finger, s.thickness, positive)
        if (i < fingers - 1) t.edge(s.space)
      }
      t.edge(right)
      break
    }
    case 'h': {
      // Finger holes: línea recta con agujeros rectangulares paralelos
      const { fingers, leftover } = calcFingers(length, s)
      if (fingers === 0) {
        t.edge(length)
        break
      }
      const left = leftover / 2
      const right = leftover - left
      // Línea base exterior
      t.edge(length)
      // Agujeros (separados en path distinto)
      let cx = t.x - right - s.finger
      const cy = t.y
      for (let i = 0; i < fingers; i++) {
        t.rectangularHole(cx, cy, s.finger, s.thickness, 0)
        cx -= s.finger + s.space
      }
      break
    }
    default: {
      t.edge(length)
    }
  }
}

// ---- Compensación de ancho del borde (para que la pieza encaje) ----

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
  // Posicionar cursor con compensación de bordes laterales
  const marginLeft = edgeWidth(edges[3], s.thickness)
  const marginTop = edgeWidth(edges[0], s.thickness)
  t.moveTo(marginLeft, marginTop)
  t.setAngle(0)

  // Dibujar 4 bordes en sentido antihorario (Boxes.py usa CW pero SVG Y hacia abajo)
  const lengths = [w, h, w, h]
  const turns = [90, 90, 90, 90] // girar 90° en cada esquina (sentido CCW para Y-down = CW visual)

  for (let i = 0; i < 4; i++) {
    drawEdge(t, edges[i], lengths[i], s)
    // Compensar esquina con el ancho de los bordes que se encuentran
    const nextWidth = edgeWidth(edges[(i + 1) % 4], s.thickness)
    const thisWidth = edgeWidth(edges[i], s.thickness)
    // Si ambos bordes tienen finger joints, no necesitamos compensación adicional
    t.corner(turns[i])
    // Ajustar por diferencia de anchos (concepto de Boxes.py edgeCorner)
    if (thisWidth !== nextWidth) {
      const delta = (thisWidth - nextWidth) / 2
      // Avanzar para compensar (simplificado)
      if (delta !== 0) {
        // No aplicamos translate porque complica demasiado para este puerto simplificado
      }
    }
  }

  const totalW = w + edgeWidth(edges[3], s.thickness) + edgeWidth(edges[1], s.thickness)
  const totalH = h + edgeWidth(edges[0], s.thickness) + edgeWidth(edges[2], s.thickness)
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

// ---- Helper: convertir mm a string SVG con unidades ----

export function mm(n: number): string {
  return `${n.toFixed(3)}mm`
}
