// POST /api/vision — Analizar imagen subida por el usuario
// Usa el LLM configurado (Groq con Llama 3.2 90B Vision) para identificar
// qué objeto es y sugerir la plantilla correcta

import { NextRequest, NextResponse } from 'next/server'
import { getLLM } from '@/lib/zai-wrapper'
import { detectTemplateByKeywords } from '@/lib/laser/template-detector'
import { TEMPLATES } from '@/lib/laser/templates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

interface VisionRequest {
  image: string // data URL base64
  prompt?: string
}

export async function POST(req: NextRequest) {
  try {
    const { image, prompt } = (await req.json()) as VisionRequest
    if (!image) {
      return NextResponse.json({ error: 'Falta imagen' }, { status: 400 })
    }

    const llm = await getLLM(req)

    if (!llm) {
      // Sin LLM: devolver mensaje claro
      return NextResponse.json({
        success: false,
        error: 'Necesitas configurar un LLM con capacidades de visión (Groq) en Settings ⚙ para analizar imágenes.',
        suggestion: 'Regístrate gratis en https://console.groq.com, obtén tu API key y pégala en Settings.',
      })
    }

    // Prompt del sistema para visión
    const systemPrompt = `Eres LaserCraft AI Vision. Analizas imágenes de objetos y determines qué plantilla de corte láser se necesita.

BIBLIOTECA DE PLANTILLAS:
1. box — Caja ensamblable con 6 caras
2. drawer — Cajón con tirador
3. shelf — Estante con repisas
4. display — Exhibidor escalonado
5. keychain — Llavero con texto
6. plaque — Placa conmemorativa
7. sign — Letrero decorativo
8. frame — Portaretrato

Responde SOLO en JSON:
{
  "detected": "nombre del objeto en español",
  "templateId": "box|drawer|shelf|display|keychain|plaque|sign|frame|null",
  "params": { ... parámetros estimados ... },
  "confidence": 0.0-1.0,
  "description": "descripción breve de lo que viste"
}

Si no reconoces el objeto, devuelve templateId: null y confidence: 0.`

    const userPrompt = prompt || '¿Qué objeto es este? ¿Qué plantilla de corte láser necesito para fabricarlo? Estima dimensiones razonables en mm.'

    try {
      const response = await llm.visionCompletion([
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ])

      // Extraer JSON de la respuesta
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0])
          return NextResponse.json({
            success: true,
            ...result,
            rawResponse: response,
          })
        } catch {
          // JSON inválido
        }
      }

      return NextResponse.json({
        success: true,
        detected: 'desconocido',
        templateId: null,
        confidence: 0,
        description: response.slice(0, 500),
      })
    } catch (err) {
      console.error('[/api/vision] LLM error:', err)
      return NextResponse.json({
        success: false,
        error: 'Error al analizar la imagen. Verifica que tu API key de Groq sea válida.',
        details: err instanceof Error ? err.message : 'unknown',
      }, { status: 500 })
    }
  } catch (err) {
    console.error('[/api/vision] error:', err)
    return NextResponse.json(
      { success: false, error: 'Error procesando la imagen' },
      { status: 500 },
    )
  }
}
