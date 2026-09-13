// GET /api/learn — Recuperar estadísticas de aprendizaje + sugerencias

import { NextRequest, NextResponse } from 'next/server'
import { getRecentInteractions, detectUserPreferences, getSmartSuggestions } from '@/lib/laser/learning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  try {
    const [recent, prefs, suggestions] = await Promise.all([
      getRecentInteractions(10),
      detectUserPreferences(),
      getSmartSuggestions(),
    ])

    return NextResponse.json({
      recentInteractions: recent,
      detectedPreferences: prefs,
      smartSuggestions: suggestions,
      learningEnabled: true,
    })
  } catch (err) {
    console.error('[/api/learn] error:', err)
    return NextResponse.json({
      recentInteractions: [],
      detectedPreferences: {},
      smartSuggestions: ['Caja 100×80×60mm con finger joints'],
      learningEnabled: false,
    })
  }
}
