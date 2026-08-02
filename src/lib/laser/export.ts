// Exportadores: SVG, DXF, LightBurn
// Convención de colores:
//   stroke="red"   = corte
//   fill="black"   = grabado relleno
//   stroke="blue"  = grabado línea

import type { GenerationResult } from '@/types/laser'

// ---- SVG (output idéntico al generado, con header completo) ----

export function exportSvg(result: GenerationResult): string {
  // El SVG ya viene completo desde el generador
  return result.svg
}

// ---- DXF (AutoCAD R12) ----
// Conversión: Y se invierte (DXF Y-arriba vs SVG Y-abajo)
// Soporta: LINE, CIRCLE, POLYLINE

export function exportDxf(result: GenerationResult): string {
  const { svg, dimensions } = result
  const height = dimensions.height
  const lines: string[] = []

  lines.push('0', 'SECTION', '2', 'ENTITIES')

  // Parsear paths del SVG
  const pathMatches = [...svg.matchAll(/<path[^>]*d=["']([^"']+)["']/g)]
  for (const m of pathMatches) {
    const d = m[1]
    dxfFromPath(d, height, lines)
  }

  // Parsear círculos
  const circleMatches = [...svg.matchAll(/<circle[^>]*cx=["']([\d.-]+)["'][^>]*cy=["']([\d.-]+)["'][^>]*r=["']([\d.-]+)["']/g)]
  for (const m of circleMatches) {
    const cx = parseFloat(m[1])
    const cy = height - parseFloat(m[2])
    const r = parseFloat(m[3])
    lines.push('0', 'CIRCLE', '8', '0', '10', cx.toFixed(3), '20', cy.toFixed(3), '40', r.toFixed(3))
  }

  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\n')
}

function dxfFromPath(d: string, height: number, lines: string[]): void {
  // Tokenizar path
  const tokens = d.match(/[MLA][^MLA]*/gi) || []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  const polyPoints: [number, number][] = []

  for (const tok of tokens) {
    const cmd = tok[0].toUpperCase()
    const nums = tok.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number)

    if (cmd === 'M') {
      if (polyPoints.length > 1) {
        emitPolyline(polyPoints, lines)
      }
      polyPoints.length = 0
      cx = nums[0]
      cy = height - nums[1]
      startX = cx
      startY = cy
      polyPoints.push([cx, cy])
    } else if (cmd === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        cx = nums[i]
        cy = height - nums[i + 1]
        polyPoints.push([cx, cy])
      }
    } else if (cmd === 'A') {
      // Arc: rx ry x-axis-rotation large-arc sweep x y
      // Simplificamos: dibujar como línea recta al punto final
      if (nums.length >= 6) {
        cx = nums[5]
        cy = height - nums[6]
        polyPoints.push([cx, cy])
      }
    }
  }
  if (polyPoints.length > 1) {
    emitPolyline(polyPoints, lines)
  }
}

function emitPolyline(points: [number, number][], lines: string[]): void {
  lines.push('0', 'POLYLINE', '8', '0', '66', '1', '70', '0')
  for (const [x, y] of points) {
    lines.push('0', 'VERTEX', '8', '0', '10', x.toFixed(3), '20', y.toFixed(3))
  }
  lines.push('0', 'SEQEND')
}

// ---- LightBurn (.lbrn2) — XML nativo simplificado ----

export function exportLightBurn(result: GenerationResult): string {
  const { svg } = result
  const shapes: string[] = []

  // Paths
  const pathMatches = [...svg.matchAll(/<path[^>]*d=["']([^"']+)["']/g)]
  for (const m of pathMatches) {
    shapes.push(
      `    <Shape Type="Path" CutIndex="0">
      <SubType>0</SubType>
      <D>${escapeXml(m[1])}</D>
    </Shape>`,
    )
  }

  // Circles
  const circleMatches = [...svg.matchAll(/<circle[^>]*cx=["']([\d.-]+)["'][^>]*cy=["']([\d.-]+)["'][^>]*r=["']([\d.-]+)["']/g)]
  for (const m of circleMatches) {
    const cx = parseFloat(m[1])
    const cy = parseFloat(m[2])
    const r = parseFloat(m[3])
    shapes.push(
      `    <Shape Type="Ellipse" CutIndex="0">
      <X>${cx.toFixed(3)}</X>
      <Y>${cy.toFixed(3)}</Y>
      <Rx>${r.toFixed(3)}</Rx>
      <Ry>${r.toFixed(3)}</Ry>
    </Shape>`,
    )
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.4.00" FormatVersion="1" MaterialHeight="0">
  <UIPrefs>
    <Style>0</Style>
  </UIPrefs>
  <LayerElement>
    <Name>Cut</Name>
    <Color>#FF0000</Color>
    <MinPower>50</MinPower>
    <MaxPower>80</MaxPower>
    <Speed>200</Speed>
  </LayerElement>
  <LayerElement>
    <Name>Engrave</Name>
    <Color>#0000FF</Color>
    <MinPower>30</MinPower>
    <MaxPower>60</MaxPower>
    <Speed>500</Speed>
  </LayerElement>
${shapes.join('\n')}
</LightBurnProject>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---- Descarga en el cliente ----

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
