// POST /api/chat — Agente IA conversacional
// Recibe mensajes y devuelve: reply + (opcional) svg generado desde plantilla

import { NextRequest, NextResponse } from 'next/server'
import { getZai } from '@/lib/zai-wrapper'
import type { ChatMessage, ChatApiResponse, MaterialInfo } from '@/types/laser'
import { MATERIALS } from '@/types/laser'
import { generateFromTemplate, TEMPLATES } from '@/lib/laser/templates'
import { validateSvg } from '@/lib/laser/validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SYSTEM_PROMPT = `Eres LaserCraft AI, un asistente experto en diseño de plantillas para corte láser.
Tu trabajo es conversar con el usuario, entender qué quiere crear, e indicarle
al sistema QUÉ plantilla usar y CON QUÉ parámetros.

NO generas SVG tú mismo — el sistema tiene una biblioteca de plantillas
paramétricas inspiradas en Boxes.py. Tu único trabajo es identificar la
plantilla correcta y llenar sus parámetros.

BIBLIOTECA DE PLANTILLAS:
1. box — Caja ensamblable con 6 caras y finger joints
2. drawer — Cajón con tirador tipo U
3. shelf — Estante con repisas
4. display — Exhibidor escalonado
5. keychain — Llavero con texto
6. plaque — Placa con nombre
7. sign — Letrero decorativo

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin texto adicional):
{
  "reply": "Respuesta conversacional breve en español (máx 2 frases)",
  "action": "ask" | "template",
  "templateId": "box" | "drawer" | "shelf" | "display" | "keychain" | "plaque" | "sign" | null,
  "params": { "width": 100, "height": 80, ... } | null,
  "questions": ["pregunta?"] | null
}

REGLAS CRÍTICAS:
- SESGO HACIA GENERAR: Si el usuario menciona dimensiones (ej: "100x80x60mm", "caja 50mm") o un tipo claro de objeto (caja, cajón, llavero, placa, letrero, estante, exhibidor), responde INMEDIATAMENTE action="template" con todos los parámetros. NO pidas más información.
- Si NO especifica el grosor, USA 6 por defecto (parámetro "thickness": 6).
- Si NO especifica algún parámetro opcional, usa el valor por defecto: lidType="closed", bottomEdge="finger".
- Si pide "llavero" o "placa" o "letrero" sin texto, usa un texto de ejemplo apropiado.
- Solo responde action="ask" si el usuario pide algo que NO encaja en ninguna plantilla (ej: "silla", "rueda").
- Los parámetros numéricos deben ser números (no strings).
- Para "caja", incluye SIEMPRE: width, height, depth, thickness, lidType, bottomEdge.
- Para "drawer" incluye: width, height, depth, thickness, handleWidth, handleHeight.
- Para "shelf" incluye: width, height, depth, thickness, shelves.
- Para "display" incluye: width, height, depth, thickness, steps.
- Para "keychain" incluye: width, height, text, fontSize, holeR.
- Para "plaque" incluye: width, height, text, subtext, fontSize.
- Para "sign" incluye: width, height, text, fontSize, border.
- Usa medidas realistas (mm). Rangos: width 30-500, height 20-300, depth 30-400, thickness 3-12.
- Responde SIEMPRE en español, en tono profesional pero cercano.

EJEMPLOS:
Usuario: "caja 100x80x60mm con finger joints"
Respuesta: {"reply":"Generando caja 100×80×60mm con finger joints rectangulares.","action":"template","templateId":"box","params":{"width":100,"height":80,"depth":60,"thickness":6,"lidType":"closed","bottomEdge":"finger"},"questions":null}

Usuario: "llavero con texto LaserCraft"
Respuesta: {"reply":"Creando llavero con tu texto personalizado.","action":"template","templateId":"keychain","params":{"width":50,"height":20,"text":"LaserCraft","fontSize":10,"holeR":3},"questions":null}

Usuario: "estante 200x250x80 con 3 repisas"
Respuesta: {"reply":"Generando estante con 3 repisas internas.","action":"template","templateId":"shelf","params":{"width":200,"height":250,"depth":80,"thickness":6,"shelves":3},"questions":null}`

interface LlmResponse {
  reply: string
  action: 'ask' | 'template'
  templateId?: string | null
  params?: Record<string, number | string> | null
  questions?: string[] | null
}

function parseLlmResponse(text: string): LlmResponse {
  // Extraer JSON del texto (puede venir con markdown fences)
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  // Intentar extraer el objeto JSON
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1)
    try {
      return JSON.parse(jsonStr)
    } catch {
      // Continuar al fallback
    }
  }

  return {
    reply: text.slice(0, 500),
    action: 'ask',
    questions: null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const messages: ChatMessage[] = body.messages || []
    const materialType: keyof typeof MATERIALS = body.material || 'mdf6'
    const material: MaterialInfo = MATERIALS[materialType]

    // Construir historial para el LLM
    const llmMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ]

    // Llamar al LLM
    const zai = await getZai()
    const completion = await zai.chat.completions.create({
      messages: llmMessages,
      temperature: 0.4,
      max_tokens: 800,
    })

    const rawReply = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLlmResponse(rawReply)

    // Si el LLM indicó una plantilla, generar el SVG
    if (parsed.action === 'template' && parsed.templateId) {
      const templateId = parsed.templateId
      // Verificar que existe la plantilla
      if (!TEMPLATES.find((t) => t.id === templateId)) {
        return NextResponse.json<ChatApiResponse>({
          reply: `No reconozco la plantilla "${templateId}". Plantillas disponibles: ${TEMPLATES.map((t) => t.id).join(', ')}.`,
          action: 'ask',
          questions: ['¿Qué tipo de objeto quieres crear?'],
        })
      }

      // Inyectar el grosor del material si no vino en params
      const params = { ...(parsed.params || {}) }
      if (!params.thickness) params.thickness = material.thickness

      // Loop de auto-corrección (hasta 3 intentos)
      const loopHistory: { attempt: number; valid: boolean; errors: string[] }[] = []
      let result = null
      let finalValid = false

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          result = generateFromTemplate(templateId, params, material)
          const validation = validateSvg(result.svg)
          loopHistory.push({
            attempt,
            valid: validation.valid,
            errors: validation.issues.filter((i) => i.severity === 'error').map((i) => i.code),
          })
          if (validation.valid) {
            finalValid = true
            break
          }
        } catch (err) {
          loopHistory.push({
            attempt,
            valid: false,
            errors: [err instanceof Error ? err.message : 'generation_error'],
          })
        }
      }

      if (!result) {
        return NextResponse.json<ChatApiResponse>({
          reply: parsed.reply + '\n\n⚠️ Hubo un error generando el SVG. Intenta con otros parámetros.',
          action: 'ask',
          questions: ['¿Puedes ser más específico con las dimensiones?'],
        })
      }

      return NextResponse.json<ChatApiResponse>({
        reply: parsed.reply + (finalValid ? '' : '\n\n⚠️ El SVG se generó pero con algunas advertencias.'),
        action: 'template',
        svg: result.svg,
        templateId,
        params,
        dimensions: result.dimensions,
        partCount: result.partCount,
        loopHistory,
        questions: null,
      })
    }

    // Respuesta conversacional (sin generación)
    return NextResponse.json<ChatApiResponse>({
      reply: parsed.reply,
      action: 'ask',
      questions: parsed.questions ?? undefined,
    })
  } catch (err) {
    console.error('[/api/chat] error:', err)
    const errMsg = err instanceof Error ? err.message : 'unknown_error'
    const isConfigError = errMsg.includes('config') || errMsg.includes('.z-ai-config')
    return NextResponse.json<ChatApiResponse>(
      {
        reply: isConfigError
          ? '⚠️ El agente IA no está configurado en este entorno. Para activarlo, configura las variables ZAI_BASE_URL y ZAI_API_KEY en Vercel, o crea un archivo .z-ai-config con tus credenciales de Z.ai.'
          : 'Ocurrió un error procesando tu mensaje. Intenta de nuevo en unos segundos.',
        action: 'ask',
        questions: isConfigError
          ? ['¿Quieres ver las plantillas disponibles mientras tanto?']
          : ['¿Puedes reformular tu petición?'],
      },
      { status: 500 },
    )
  }
}
