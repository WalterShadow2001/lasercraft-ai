// POST /api/generate — Generar SVG desde plantilla + params explícitos

import { NextRequest, NextResponse } from 'next/server'
import type { ChatApiResponse, MaterialInfo } from '@/types/laser'
import { MATERIALS } from '@/types/laser'
import { generateFromTemplate } from '@/lib/laser/templates'
import { validateSvg } from '@/lib/laser/validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { templateId, params, material: materialType } = body as {
      templateId: string
      params: Record<string, number | string>
      material?: keyof typeof MATERIALS
    }

    if (!templateId) {
      return NextResponse.json({ error: 'Falta templateId' }, { status: 400 })
    }

    const material: MaterialInfo = MATERIALS[materialType || 'mdf6']
    const merged = { ...params }
    if (!merged.thickness) merged.thickness = material.thickness

    const result = generateFromTemplate(templateId, merged, material)
    const validation = validateSvg(result.svg)

    return NextResponse.json({
      success: validation.valid,
      svg: result.svg,
      dimensions: result.dimensions,
      partCount: result.partCount,
      params: merged,
      issues: validation.issues,
    })
  } catch (err) {
    console.error('[/api/generate] error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'unknown_error' },
      { status: 500 },
    )
  }
}

export async function GET() {
  // Listar plantillas disponibles
  const { TEMPLATES } = await import('@/lib/laser/templates')
  return NextResponse.json({
    templates: TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      params: t.params,
    })),
  })
}
