// Finger joints — puerto simplificado y CORREGIDO de boxes/edges.py
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
// positive=true: tab hacia afuera (bulto)
// positive=false: slot hacia adentro (hueco)
export function drawFinger(t: Turtle, f: number, h: number, positive: boolean): void {
  if (positive) {
    // Tab hacia afuera: avanza la mitad, sube h, avanza f, baja h
    // En Y-down SVG: "subir" = -Y si angle=0
    t.corner(-90)
    t.edge(h)
    t.corner(90)
    t.edge(f)
    t.corner(90)
    t.edge(h)
    t.corner(-90)
  } else {
    // Slot hacia adentro
    t.corner(90)
    t.edge(h)
    t.corner(-90)
    t.edge(f)
    t.corner(-90)
    t.edge(h)
    t.corner(90)
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
    case 'E':
    case 's':
    case 'S': {
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
      // Finger holes: línea recta + agujeros rectangulares paralelos
      const { fingers, leftover } = calcFingers(length, s)
      if (fingers === 0) {
        t.edge(length)
        break
      }
      // Solo línea recta, los holes se agregan aparte
      t.edge(length)
      break
    }
    default: {
      t.edge(length)
    }
  }
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
  // Empezar en (0,0), angle 0 (avanza en +X)
  t.moveTo(0, 0)
  t.setAngle(0)

  // Recorrido antihorario: bottom (→), right (↑), top (←), left (↓)
  // En SVG Y-down, "arriba" es -Y. Pero para una wall que se ve como rectángulo
  // normal, hacemos bottom→right→top→left en sentido horario visual.
  const lengths = [w, h, w, h]
  const turns = [-90, -90, -90, -90] // girar -90° (sentido horario en Y-down)

  for (let i = 0; i < 4; i++) {
    drawEdge(t, edges[i], lengths[i], s)
    t.corner(turns[i])
  }
  t.closePath()

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
