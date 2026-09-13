// POST /api/research — Investigar plantillas nuevas en la web

import { NextRequest, NextResponse } from 'next/server'
import { researchTemplate } from '@/lib/laser/learning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query: string }
    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query vacío' }, { status: 400 })
    }
    const result = await researchTemplate(query.trim())
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/research] error:', err)
    return NextResponse.json(
      {
        query: '',
        sources: [],
        summary: 'Error en la investigación',
        templateFound: false,
      },
      { status: 500 },
    )
  }
}

// GET /api/research — Listar investigaciones anteriores
export async function GET() {
  try {
    const { db } = await import('@/lib/db')
    const logs = await db.researchLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        sourcesUsed: JSON.parse(l.sourcesUsed),
      })),
    })
  } catch (err) {
    console.error('[/api/research GET] error:', err)
    return NextResponse.json({ logs: [] })
  }
}
