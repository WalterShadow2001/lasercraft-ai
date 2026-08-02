// LaserCraft AI — Tipos centrales del dominio

export type MaterialType =
  | 'mdf3'
  | 'mdf6'
  | 'plywood3'
  | 'plywood6'
  | 'acrylic3'
  | 'acrylic5'
  | 'cardboard3'

export interface MaterialInfo {
  id: MaterialType
  label: string
  thickness: number // mm
  color: string // hex usado para la vista 3D
  cutColor: string // stroke para SVG (corte)
  engraveColor: string // fill/stroke para grabado
}

export const MATERIALS: Record<MaterialType, MaterialInfo> = {
  mdf3:        { id: 'mdf3',        label: 'MDF 3mm',          thickness: 3,  color: '#b58863', cutColor: '#dc2626', engraveColor: '#1f2937' },
  mdf6:        { id: 'mdf6',        label: 'MDF 6mm',          thickness: 6,  color: '#9c6b3f', cutColor: '#dc2626', engraveColor: '#1f2937' },
  plywood3:    { id: 'plywood3',    label: 'Triplay 3mm',      thickness: 3,  color: '#d4a373', cutColor: '#dc2626', engraveColor: '#1f2937' },
  plywood6:    { id: 'plywood6',    label: 'Triplay 6mm',      thickness: 6,  color: '#c08552', cutColor: '#dc2626', engraveColor: '#1f2937' },
  acrylic3:    { id: 'acrylic3',    label: 'Acrílico 3mm',     thickness: 3,  color: '#7dd3fc', cutColor: '#dc2626', engraveColor: '#1f2937' },
  acrylic5:    { id: 'acrylic5',    label: 'Acrílico 5mm',     thickness: 5,  color: '#38bdf8', cutColor: '#dc2626', engraveColor: '#1f2937' },
  cardboard3:  { id: 'cardboard3',  label: 'Cartón 3mm',       thickness: 3,  color: '#cda274', cutColor: '#dc2626', engraveColor: '#1f2937' },
}

export interface ProjectSettings {
  material: MaterialType
  width: number
  height: number
  depth: number
  kerf: number // compensación del láser (mm)
}

export type EdgeCode = 'e' | 'f' | 'F' | 'h' | 'E' | 's' | 'S'

export interface FingerJointSettings {
  thickness: number
  space: number
  finger: number
  surroundingspaces: number
  play: number
  style: 'rectangular' | 'springs' | 'barbs' | 'snap'
}

export interface TemplateParam {
  id: string
  label: string
  type: 'number' | 'select' | 'text'
  default: number | string
  min?: number
  max?: number
  step?: number
  options?: string[]
  unit?: string
}

export interface TemplatePart {
  id: string
  label: string
  role: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'shelf' | 'lid' | 'drawer' | 'handle' | 'base' | 'body' | 'plate'
  svg: string // paths svg (sin <svg> wrapper)
  x: number // posición en el layout 2D
  y: number
  width: number
  height: number
}

export interface GenerationResult {
  svg: string
  parts: TemplatePart[]
  dimensions: { width: number; height: number; depth: number }
  partCount: number
  materialUsage: { sheetW: number; sheetH: number; used: number }
}

export interface Template {
  id: string
  name: string
  description: string
  icon: string // lucide icon name
  params: TemplateParam[]
  generate: (params: Record<string, number | string>, material: MaterialInfo) => GenerationResult
}

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  templateId?: string
  params?: Record<string, number | string>
  loopHistory?: LoopEntry[]
}

export interface LoopEntry {
  attempt: number
  valid: boolean
  errors: string[]
}

export type ChatAction = 'ask' | 'template'

export interface ChatApiResponse {
  reply: string
  action: ChatAction
  svg?: string
  templateId?: string
  params?: Record<string, number | string>
  dimensions?: { width: number; height: number; depth: number }
  partCount?: number
  loopHistory?: LoopEntry[]
  questions?: string[]
}

// ----- Ensamblaje 3D -----

export type PlacementRole =
  | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
  | 'shelf' | 'lid' | 'drawer' | 'handle' | 'base' | 'body' | 'plate'

export interface Placement {
  id: string
  label: string
  role: PlacementRole
  position: [number, number, number]
  rotation: [number, number, number] // radianes
  width: number // ancho X
  height: number // alto Y
  depth: number // profundidad Z (grosor de la pieza)
  color: string
  svgTexture?: string // data URL opcional
}

// ----- Validador -----

export type ValidationCode =
  | 'EMPTY_SVG' | 'NO_VIEWBOX' | 'INVALID_VIEWBOX'
  | 'NO_PARTS' | 'MISSING_ROLE' | 'ZERO_DIMENSIONS'
  | 'NO_FRONT_BACK' | 'NO_SIDES'
  | 'DIMENSION_MISMATCH_FB' | 'DIMENSION_MISMATCH_LR'
  | 'PARTS_OUTSIDE_VIEWBOX' | 'UNCLOSED_SVG' | 'UNCLOSED_GROUP'

export interface ValidationIssue {
  code: ValidationCode
  message: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  feedback: string
}
