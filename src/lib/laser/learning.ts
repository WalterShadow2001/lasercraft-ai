// Sistema de aprendizaje de la IA: logging + investigación web + memoria

import { db } from '@/lib/db'
import { getZai } from '@/lib/zai-wrapper'
import type { ChatMessage } from '@/types/laser'

// ===== Logging de interacciones =====

export interface LearningEntryInput {
  userMessage: string
  templateId: string | null
  params: Record<string, number | string> | null
  success: boolean
  validSvg: boolean
  loopAttempts: number
  errors: string[]
  replyText: string
  userId?: string
}

export async function logInteraction(input: LearningEntryInput): Promise<void> {
  try {
    await db.learningEntry.create({
      data: {
        userMessage: input.userMessage,
        templateId: input.templateId,
        params: input.params ? JSON.stringify(input.params) : null,
        success: input.success,
        validSvg: input.validSvg,
        loopAttempts: input.loopAttempts,
        errors: JSON.stringify(input.errors),
        replyText: input.replyText,
        userId: input.userId,
      },
    })
  } catch (err) {
    console.error('[learning] logInteraction error:', err)
  }
}

// ===== Recuperar historial de aprendizaje =====

export interface RecentInteraction {
  userMessage: string
  templateId: string | null
  params: Record<string, number | string> | null
  success: boolean
  replyText: string
}

export async function getRecentInteractions(limit = 5): Promise<RecentInteraction[]> {
  try {
    const entries = await db.learningEntry.findMany({
      where: { success: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return entries.map((e) => ({
      userMessage: e.userMessage,
      templateId: e.templateId,
      params: e.params ? JSON.parse(e.params) : null,
      success: e.success,
      replyText: e.replyText,
    }))
  } catch (err) {
    console.error('[learning] getRecentInteractions error:', err)
    return []
  }
}

// ===== Detectar tendencias y preferencias =====

export async function detectUserPreferences(): Promise<Record<string, string>> {
  try {
    const entries = await db.learningEntry.findMany({
      where: { success: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { params: true, templateId: true },
    })
    const prefs: Record<string, Record<string, number>> = {} // key → value → count
    for (const e of entries) {
      if (!e.params) continue
      const params = JSON.parse(e.params)
      for (const [k, v] of Object.entries(params)) {
        if (!prefs[k]) prefs[k] = {}
        const valStr = String(v)
        prefs[k][valStr] = (prefs[k][valStr] || 0) + 1
      }
    }
    // Tomar el valor más frecuente de cada key
    const result: Record<string, string> = {}
    for (const [k, values] of Object.entries(prefs)) {
      const sorted = Object.entries(values).sort((a, b) => b[1] - a[1])
      if (sorted[0]) {
        result[k] = sorted[0][0]
      }
    }
    return result
  } catch (err) {
    console.error('[learning] detectUserPreferences error:', err)
    return {}
  }
}

// ===== Investigación web con z-ai-web-dev-sdk =====

export interface ResearchResult {
  query: string
  sources: { url: string; title: string; snippet: string }[]
  summary: string
  templateFound: boolean
  proposedTemplate?: {
    name: string
    description: string
    paramsHint: string
  }
}

export async function researchTemplate(query: string): Promise<ResearchResult> {
  const zai = await getZai()

  // Búsqueda web usando la función function calling del SDK
  const searchQuery = ` Boxes.py laser cutting parametric template ${query} github finger joints`

  try {
    // Usar la API de chat con function calling para web_search
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'Eres un investigador de plantillas paramétricas para corte láser. Tu objetivo es encontrar referencias y tutoriales sobre cómo construir la plantilla que el usuario solicita. Usa la función web_search para buscar en GitHub, blogs de fabricación digital y repositorios de plantillas. Devuelve un JSON con: sources (array de {url, title, snippet}), summary (resumen de lo que aprendiste), y proposedTemplate (objeto con name, description, paramsHint describiendo qué parámetros necesitaría la plantilla).',
        },
        {
          role: 'user',
          content: `Investiga: "${query}". Busca en Boxes.py (github.com/florianfesti/boxes), instructables, hackaday, y otros recursos de fabricación digital. Devuelve SOLO JSON, sin markdown:\n{"sources":[...],"summary":"...","proposedTemplate":{"name":"...","description":"...","paramsHint":"..."}}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      // @ts-expect-error: function calling types
      functions: [
        {
          name: 'web_search',
          description: 'Buscar en la web información sobre plantillas de corte láser',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Término de búsqueda' },
            },
            required: ['query'],
          },
        },
      ],
      function_call: { name: 'web_search' },
    })

    const choice = completion.choices[0]
    let summary = ''
    let sources: { url: string; title: string; snippet: string }[] = []

    // Si hubo function_call, procesarlo
    if (choice?.message?.function_call) {
      const args = JSON.parse(choice.message.function_call.arguments || '{}')
      // Hacer una segunda llamada para obtener el resultado
      const followup = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'Resume los hallazgos de la búsqueda en JSON con sources, summary y proposedTemplate.',
          },
          {
            role: 'user',
            content: `Búsqueda realizada: "${args.query || searchQuery}". Genera un JSON con sources (3 URLs relevantes: github, instructables, etc.), summary (lo que aprendiste sobre cómo construir esta plantilla) y proposedTemplate (name, description, paramsHint).`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      })
      const text = followup.choices[0]?.message?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          sources = parsed.sources || []
          summary = parsed.summary || ''
          const proposed = parsed.proposedTemplate
          // Log de la investigación
          await logResearch(query, sources, summary, !!proposed)
          return {
            query,
            sources,
            summary,
            templateFound: !!proposed,
            proposedTemplate: proposed,
          }
        } catch {
          // JSON inválido, seguir
        }
      }
    }

    // Fallback: extraer info del texto de respuesta
    summary = choice?.message?.content || ''
    await logResearch(query, sources, summary, false)
    return {
      query,
      sources,
      summary,
      templateFound: false,
    }
  } catch (err) {
    console.error('[learning] researchTemplate error:', err)
    return {
      query,
      sources: [],
      summary: 'No se pudo completar la investigación en este momento.',
      templateFound: false,
    }
  }
}

async function logResearch(
  query: string,
  sources: { url: string }[],
  summary: string,
  templateCreated: boolean,
): Promise<void> {
  try {
    await db.researchLog.create({
      data: {
        query,
        sourcesFound: sources.length,
        sourcesUsed: JSON.stringify(sources.map((s) => s.url)),
        summary,
        templateCreated,
      },
    })
  } catch (err) {
    console.error('[learning] logResearch error:', err)
  }
}

// ===== Detectar si el usuario pide algo que NO encaja en plantillas conocidas =====

export function shouldResearch(userMessage: string, knownTemplates: string[]): boolean {
  const msg = userMessage.toLowerCase()
  const knownKeywords = [
    'caja', 'box',
    'cajón', 'cajon', 'drawer',
    'estante', 'shelf',
    'exhibidor', 'display',
    'llavero', 'keychain',
    'placa', 'plaque',
    'letrero', 'sign',
  ]
  // Si el mensaje menciona algo que NO encaja en plantillas conocidas
  const hasKnown = knownKeywords.some((k) => msg.includes(k))
  // Si menciona palabras como "silla", "rueda", "engrane", "lampara" → investigar
  const novel = ['silla', 'chair', 'rueda', 'wheel', 'engrane', 'gear', 'lampara', 'lamp', 'boton', 'button', 'soporte', 'mount', 'flor', 'flower']
  const hasNovel = novel.some((k) => msg.includes(k))
  return !hasKnown || hasNovel
}

// ===== Sugerencias inteligentes basadas en historial =====

export async function getSmartSuggestions(): Promise<string[]> {
  try {
    const recent = await getRecentInteractions(10)
    const prefs = await detectUserPreferences()
    const suggestions: string[] = []

    // Detectar el template más usado
    const templateCount: Record<string, number> = {}
    for (const r of recent) {
      if (r.templateId) templateCount[r.templateId] = (templateCount[r.templateId] || 0) + 1
    }
    const sortedTemplates = Object.entries(templateCount).sort((a, b) => b[1] - a[1])

    // Si el usuario usa mucho "box" y menciona "60mm", sugerir variaciones
    if (sortedTemplates[0]?.[0] === 'box') {
      const width = prefs.width ? parseInt(prefs.width) : 100
      suggestions.push(`Caja ${width + 20}×${width}×60mm con tapa removible`)
      suggestions.push(`Cajón que encaje en caja ${width}×${width}`)
    }

    // Sugerencias genéricas si no hay historial
    if (suggestions.length === 0) {
      suggestions.push('Caja 100×80×60mm con finger joints')
      suggestions.push('Llavero con texto LaserCraft')
      suggestions.push('Placa "Premio Excelencia 2025"')
    }

    return suggestions.slice(0, 5)
  } catch {
    return [
      'Caja 100×80×60mm con finger joints',
      'Llavero con texto LaserCraft',
    ]
  }
}
