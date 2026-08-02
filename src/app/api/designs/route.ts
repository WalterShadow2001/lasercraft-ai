// GET/POST /api/designs — Guardar y listar diseños

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const designs = await db.savedDesign.findMany({
      take: limit,
      skip: offset,
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({
      designs: designs.map((d) => ({
        ...d,
        params: JSON.parse(d.params),
        dimensions: JSON.parse(d.dimensions),
      })),
    })
  } catch (err) {
    console.error('[/api/designs GET] error:', err)
    // Si la BD no está disponible, devolver lista vacía
    return NextResponse.json({ designs: [], error: 'database_unavailable' })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, templateId, params, svg, dimensions, partCount, material } = body

    if (!name || !templateId || !svg) {
      return NextResponse.json({ error: 'Faltan campos requeridos: name, templateId, svg' }, { status: 400 })
    }

    const design = await db.savedDesign.create({
      data: {
        name,
        templateId,
        params: JSON.stringify(params || {}),
        svg,
        dimensions: JSON.stringify(dimensions || {}),
        partCount: partCount || 0,
        material: material || 'mdf6',
      },
    })

    return NextResponse.json({ design, success: true })
  } catch (err) {
    console.error('[/api/designs POST] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown_error' },
      { status: 500 },
    )
  }
}
