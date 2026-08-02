// Validador SVG — 10+ reglas estructurales + loop de auto-corrección

import type { ValidationResult, ValidationIssue, ValidationCode, GenerationResult } from '@/types/laser'

// Validar un SVG completo (string)
export function validateSvg(svg: string): ValidationResult {
  const issues: ValidationIssue[] = []

  if (!svg || svg.trim().length === 0) {
    return {
      valid: false,
      issues: [{ code: 'EMPTY_SVG', message: 'SVG vacío o nulo', severity: 'error' }],
      feedback: 'El SVG generado está vacío. Revisa los parámetros de la plantilla.',
    }
  }

  // 1. ViewBox
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/)
  if (!viewBoxMatch) {
    issues.push({ code: 'NO_VIEWBOX', message: 'Falta el atributo viewBox', severity: 'error' })
  } else {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number)
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
      issues.push({ code: 'INVALID_VIEWBOX', message: `viewBox inválido: ${viewBoxMatch[1]}`, severity: 'error' })
    } else if (parts[2] === 0 || parts[3] === 0) {
      issues.push({ code: 'INVALID_VIEWBOX', message: 'viewBox con dimensiones cero', severity: 'error' })
    }
  }

  // 2. Grupos (partes)
  const groupMatches = svg.match(/<g\s+[^>]*data-role=/g) || []
  if (groupMatches.length === 0) {
    issues.push({ code: 'NO_PARTS', message: 'No se encontraron partes (grupos con data-role)', severity: 'error' })
  }

  // 3. Roles presentes
  const roles = new Set<string>()
  const roleMatches = svg.matchAll(/data-role=["']([^"']+)["']/g)
  for (const m of roleMatches) roles.add(m[1])

  if (roles.size === 0) {
    issues.push({ code: 'MISSING_ROLE', message: 'Ninguna parte tiene data-role asignado', severity: 'error' })
  }

  // 4. Dimensiones de partes
  const dimMatches = [...svg.matchAll(/data-w=["'](\d+(?:\.\d+)?)["']\s+data-h=["'](\d+(?:\.\d+)?)["']/g)]
  for (const m of dimMatches) {
    const w = parseFloat(m[1])
    const h = parseFloat(m[2])
    if (w === 0 || h === 0) {
      issues.push({ code: 'ZERO_DIMENSIONS', message: `Parte con dimensiones cero: ${w}×${h}`, severity: 'error' })
    }
  }

  // 5. Para cajas: frente/atrás y lados
  const isBox = roles.has('front') || roles.has('back')
  if (isBox) {
    if (!roles.has('front') || !roles.has('back')) {
      issues.push({ code: 'NO_FRONT_BACK', message: 'Falta frente o trasera', severity: 'error' })
    }
    if (!roles.has('left') && !roles.has('right')) {
      issues.push({ code: 'NO_SIDES', message: 'Faltan lados', severity: 'warning' })
    }
  }

  // 6. Tags cerrados
  const openSvg = (svg.match(/<svg/g) || []).length
  const closeSvg = (svg.match(/<\/svg>/g) || []).length
  if (openSvg !== closeSvg) {
    issues.push({ code: 'UNCLOSED_SVG', message: `Tags <svg> desbalanceados: ${openSvg} abiertos, ${closeSvg} cerrados`, severity: 'error' })
  }

  const openG = (svg.match(/<g[\s>]/g) || []).length
  const closeG = (svg.match(/<\/g>/g) || []).length
  if (openG !== closeG) {
    issues.push({ code: 'UNCLOSED_GROUP', message: `Tags <g> desbalanceados: ${openG} abiertos, ${closeG} cerrados`, severity: 'error' })
  }

  // 7. Partes fuera del viewBox (warning)
  const viewBoxParts = viewBoxMatch?.[1].split(/\s+/).map(Number) ?? [0, 0, 0, 0]
  const [vx, vy, vw, vh] = viewBoxParts
  if (vw > 0 && vh > 0) {
    const translateMatches = [...svg.matchAll(/transform=["']translate\(([\d.-]+)[\s,]+([\d.-]+)\)["']/g)]
    for (const m of translateMatches) {
      const tx = parseFloat(m[1])
      const ty = parseFloat(m[2])
      if (tx < vx - 1 || ty < vy - 1 || tx > vx + vw + 1 || ty > vy + vh + 1) {
        issues.push({
          code: 'PARTS_OUTSIDE_VIEWBOX',
          message: `Parte en (${tx}, ${ty}) fuera del viewBox`,
          severity: 'warning',
        })
        break // solo reportar el primero
      }
    }
  }

  // 8. Dimensiones consistentes (frente vs atrás, lados entre sí)
  const frontMatch = svg.match(/<g[^>]*data-role=["']front["'][^>]*data-w=["']([\d.]+)["']/)
  const backMatch = svg.match(/<g[^>]*data-role=["']back["'][^>]*data-w=["']([\d.]+)["']/)
  if (frontMatch && backMatch) {
    const fw = parseFloat(frontMatch[1])
    const bw = parseFloat(backMatch[1])
    if (Math.abs(fw - bw) > 0.5) {
      issues.push({
        code: 'DIMENSION_MISMATCH_FB',
        message: `Frente (${fw}) y trasera (${bw}) tienen anchos diferentes`,
        severity: 'error',
      })
    }
  }

  const leftMatch = svg.match(/<g[^>]*data-role=["']left["'][^>]*data-w=["']([\d.]+)["']/)
  const rightMatch = svg.match(/<g[^>]*data-role=["']right["'][^>]*data-w=["']([\d.]+)["']/)
  if (leftMatch && rightMatch) {
    const lw = parseFloat(leftMatch[1])
    const rw = parseFloat(rightMatch[1])
    if (Math.abs(lw - rw) > 0.5) {
      issues.push({
        code: 'DIMENSION_MISMATCH_LR',
        message: `Lados tienen anchos diferentes: ${lw} vs ${rw}`,
        severity: 'error',
      })
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  const valid = errors.length === 0

  const feedback = valid
    ? 'SVG válido: todas las verificaciones pasaron.'
    : `SVG inválido. Problemas: ${errors.map((e) => e.code).join(', ')}. ` +
      `Sugerencia: ajusta dimensiones o parámetros de finger joints.`

  return { valid, issues, feedback }
}

// Loop de auto-corrección: hasta 3 intentos
export interface LoopResult {
  result: GenerationResult
  history: { attempt: number; valid: boolean; errors: string[] }[]
  finalValid: boolean
}

export function validationLoop(
  generate: () => GenerationResult,
  maxAttempts = 3,
): LoopResult {
  const history: { attempt: number; valid: boolean; errors: string[] }[] = []
  let result: GenerationResult | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = generate()
    const validation = validateSvg(result.svg)
    history.push({
      attempt,
      valid: validation.valid,
      errors: validation.issues.filter((i) => i.severity === 'error').map((i) => i.code),
    })
    if (validation.valid) {
      return { result, history, finalValid: true }
    }
  }

  return { result: result!, history, finalValid: false }
}

// Lista de códigos para UI
export const VALIDATION_CODES: { code: ValidationCode; description: string }[] = [
  { code: 'EMPTY_SVG', description: 'SVG vacío' },
  { code: 'NO_VIEWBOX', description: 'Falta viewBox' },
  { code: 'INVALID_VIEWBOX', description: 'viewBox inválido' },
  { code: 'NO_PARTS', description: 'Sin partes' },
  { code: 'MISSING_ROLE', description: 'Sin data-role' },
  { code: 'ZERO_DIMENSIONS', description: 'Dimensión cero' },
  { code: 'NO_FRONT_BACK', description: 'Falta frente/atrás' },
  { code: 'NO_SIDES', description: 'Faltan lados' },
  { code: 'DIMENSION_MISMATCH_FB', description: 'Frente ≠ trasera' },
  { code: 'DIMENSION_MISMATCH_LR', description: 'Lados diferentes' },
  { code: 'PARTS_OUTSIDE_VIEWBOX', description: 'Parte fuera del lienzo' },
  { code: 'UNCLOSED_SVG', description: 'SVG sin cerrar' },
  { code: 'UNCLOSED_GROUP', description: 'Grupo sin cerrar' },
]
