// Ensamblaje 2D → 3D — lee roles de las partes y las posiciona en 3D
// Basado en el concepto de data-role de Boxes.py

import type { Placement, TemplatePart, GenerationResult, MaterialInfo } from '@/types/laser'

export interface AssemblyOptions {
  exploded?: boolean // vista despiezada
  explodeFactor?: number // 0 = armado, 1 = despiezado total
  thickness: number // grosor del material (para Z de cada pieza)
  material: MaterialInfo
}

// Convierte un TemplatePart en un Placement 3D
// Asignación de roles → posición 3D (convención: Y up, Z hacia el observador)
function roleToPlacement(
  part: TemplatePart,
  w: number, // ancho total del objeto (X)
  h: number, // alto total del objeto (Y)
  d: number, // profundidad total del objeto (Z)
  thickness: number,
  options: AssemblyOptions,
): Placement {
  const explode = options.exploded ? (options.explodeFactor ?? 1) : 0
  const ex = explode * 30 // offset de explosión en mm

  // Centro el objeto en el origen
  const cx = 0
  const cy = 0
  const cz = 0

  // Cada pieza es una caja plana (width × height) con profundidad = thickness
  switch (part.role) {
    case 'front':
      return {
        id: part.id,
        label: part.label,
        role: 'front',
        position: [cx, cy, cz + d / 2 + ex],
        rotation: [0, 0, 0],
        width: w,
        height: h,
        depth: thickness,
        color: options.material.color,
      }
    case 'back':
      return {
        id: part.id,
        label: part.label,
        role: 'back',
        position: [cx, cy, cz - d / 2 - ex],
        rotation: [0, Math.PI, 0],
        width: w,
        height: h,
        depth: thickness,
        color: options.material.color,
      }
    case 'left':
      return {
        id: part.id,
        label: part.label,
        role: 'left',
        position: [cx - w / 2 - ex, cy, cz],
        rotation: [0, -Math.PI / 2, 0],
        width: d,
        height: h,
        depth: thickness,
        color: options.material.color,
      }
    case 'right':
      return {
        id: part.id,
        label: part.label,
        role: 'right',
        position: [cx + w / 2 + ex, cy, cz],
        rotation: [0, Math.PI / 2, 0],
        width: d,
        height: h,
        depth: thickness,
        color: options.material.color,
      }
    case 'top':
    case 'lid':
      return {
        id: part.id,
        label: part.label,
        role: part.role,
        position: [cx, cy + h / 2 + ex, cz],
        rotation: [-Math.PI / 2, 0, 0],
        width: w,
        height: d,
        depth: thickness,
        color: options.material.color,
      }
    case 'bottom':
    case 'base':
      return {
        id: part.id,
        label: part.label,
        role: part.role,
        position: [cx, cy - h / 2 - ex, cz],
        rotation: [Math.PI / 2, 0, 0],
        width: w,
        height: d,
        depth: thickness,
        color: options.material.color,
      }
    case 'shelf': {
      // Repisas distribuidas a lo largo del alto
      // Se posiciona después en batch (la posición Y se ajusta en buildPlacements)
      return {
        id: part.id,
        label: part.label,
        role: 'shelf',
        position: [cx, cy, cz],
        rotation: [-Math.PI / 2, 0, 0],
        width: w,
        height: d,
        depth: thickness,
        color: options.material.color,
      }
    }
    case 'handle':
      return {
        id: part.id,
        label: part.label,
        role: 'handle',
        position: [cx, cy + h / 2 + thickness + ex, cz + thickness / 2],
        rotation: [Math.PI / 2, 0, 0],
        width: part.width,
        height: part.height,
        depth: thickness,
        color: options.material.color,
      }
    case 'body':
    case 'plate':
    default: {
      // Pieza plana genérica (llavero, placa, letrero)
      return {
        id: part.id,
        label: part.label,
        role: part.role,
        position: [cx, cy, cz],
        rotation: [0, 0, 0],
        width: part.width,
        height: part.height,
        depth: thickness,
        color: options.material.color,
      }
    }
  }
}

export function buildPlacements(
  result: GenerationResult,
  options: AssemblyOptions,
): Placement[] {
  const { width: w, height: h, depth: d } = result.dimensions
  const placements: Placement[] = []

  // Distribuir repisas equidistantes en Y
  const shelves = result.parts.filter((p) => p.role === 'shelf')
  const nonShelves = result.parts.filter((p) => p.role !== 'shelf')

  for (const part of nonShelves) {
    placements.push(roleToPlacement(part, w, h, d, options.thickness, options))
  }

  if (shelves.length > 0) {
    const n = shelves.length
    const usableH = h - 2 * options.thickness
    const step = usableH / (n + 1)
    shelves.forEach((shelf, i) => {
      const placement = roleToPlacement(shelf, w, h, d, options.thickness, options)
      // Posición Y: de abajo hacia arriba
      const y = -h / 2 + (i + 1) * step
      placement.position = [placement.position[0], y, placement.position[2]]
      placements.push(placement)
    })
  }

  return placements
}

// Genera una textura SVG como data URL para aplicar a las piezas 3D
export function svgToTextureDataUrl(svg: string, color: string): string {
  // Simplificamos: devolvemos un color sólido como textura
  // (Para textura real, serializaríamos el SVG de la pieza como fondo)
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svgStr).toString('base64')}`
}
