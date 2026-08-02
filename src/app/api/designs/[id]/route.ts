// GET/DELETE /api/designs/[id] — Operaciones sobre un diseño

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const design = await db.savedDesign.findUnique({ where: { id } })
    if (!design) {
      return NextResponse.json({ error: 'Diseño no encontrado' }, { status: 404 })
    }
    return NextResponse.json({
      ...design,
      params: JSON.parse(design.params),
      dimensions: JSON.parse(design.dimensions),
    })
  } catch (err) {
    console.error('[/api/designs/[id] GET] error:', err)
    return NextResponse.json({ error: 'database_unavailable' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.savedDesign.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/designs/[id] DELETE] error:', err)
    return NextResponse.json({ error: 'database_unavailable' }, { status: 500 })
  }
}
