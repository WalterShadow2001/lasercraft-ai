// POST /api/chat — Agente IA conversacional con sistema de aprendizaje

import { NextRequest, NextResponse } from 'next/server'
import { getZai } from '@/lib/zai-wrapper'
import type { ChatMessage, ChatApiResponse, MaterialInfo } from '@/types/laser'
import { MATERIALS } from '@/types/laser'
import { generateFromTemplate, TEMPLATES } from '@/lib/laser/templates'
import { validateSvg } from '@/lib/laser/validator'
import {
  logInteraction,
  getRecentInteractions,
  detectUserPreferences,
  researchTemplate,
  shouldResearch,
} from '@/lib/laser/learning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SYSTEM_PROMPT = `Eres LaserCraft AI, un asistente experto en diseño de plantillas para corte láser.
Tu trabajo es conversar con el usuario, entender qué quiere crear, e indicarle
al sistema QUÉ plantilla usar y CON QUÉ parámetros. También aprendes de cada
interacción y puedes investigar plantillas nuevas en la web.

NO generas SVG tú mismo — el sistema tiene una biblioteca de plantillas
paramétricas inspiradas en Boxes.py. Tu único trabajo es identificar la
plantilla correcta y llenar sus parámetros, o pedir al sistema que investigue
si no existe la plantilla.

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
  "action": "ask" | "template" | "research",
  "templateId": "box" | "drawer" | "shelf" | "display" | "keychain" | "plaque" | "sign" | null,
  "params": { "width": 100, "height": 80, ... } | null,
  "questions": ["pregunta?"] | null
}

REGLAS CRÍTICAS:
- SESGO HACIA GENERAR: Si el usuario menciona dimensiones (ej: "100x80x60mm", "caja 50mm") o un tipo claro de objeto, responde INMEDIATAMENTE action="template" con todos los parámetros. NO pidas más información.
- Si NO especifica el grosor, USA 6 por defecto (parámetro "thickness": 6).
- Si pide algo que NO encaja en ninguna plantilla (ej: "silla", "rueda", "engrane", "lampara"), responde action="research" para que el sistema investigue en la web.
- Los parámetros numéricos deben ser números (no strings).
- Usa medidas realistas (mm). Rangos: width 30-500, height 20-300, depth 30-400, thickness 3-12.
- Responde SIEMPRE en español, en tono profesional pero cercano.`

interface LlmResponse {
  reply: string
  action: 'ask' | 'template' | 'research'
  templateId?: string | null
  params?: Record<string, number | string> | null
  questions?: string[] | null
}

function parseLlmResponse(text: string): LlmResponse {
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1)
    try {
      return JSON.parse(jsonStr)
    } catch {
      // fallback
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
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')

    // Recuperar historial de aprendizaje para few-shot
    const recentSuccesses = await getRecentInteractions(3)
    const userPrefs = await detectUserPreferences()

    // Inyectar preferencias detectadas en el system prompt
    let dynamicPrompt = SYSTEM_PROMPT
    if (Object.keys(userPrefs).length > 0) {
      dynamicPrompt += `\n\nPREFERENCIAS DETECTADAS DEL USUARIO (úsalas como defaults si no especifica):\n${JSON.stringify(userPrefs, null, 2)}`
    }
    if (recentSuccesses.length > 0) {
      dynamicPrompt += `\n\nEJEMPLOS DE GENERACIONES EXITOSAS RECIENTES:\n${recentSuccesses
        .map((r) => `"${r.userMessage}" → templateId="${r.templateId}" params=${JSON.stringify(r.params)}`)
        .join('\n')}`
    }

    const llmMessages = [
      { role: 'system' as const, content: dynamicPrompt },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ]

    // Llamar al LLM (pasar req para resolver config per-request)
    const zai = await getZai(req)
    const completion = await zai.chat.completions.create({
      messages: llmMessages,
      temperature: 0.4,
      max_tokens: 800,
    })

    const rawReply = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLlmResponse(rawReply)

    // ===== ACCIÓN: RESEARCH (investigar plantilla nueva) =====
    if (parsed.action === 'research' && lastUserMessage) {
      const researchResult = await researchTemplate(lastUserMessage.content)

      return NextResponse.json<ChatApiResponse>({
        reply:
          `🔍 He investigado "${lastUserMessage.content}". ${researchResult.summary}\n\n` +
          (researchResult.templateFound
            ? `Propuesta de plantilla encontrada: "${researchResult.proposedTemplate?.name}". ${researchResult.proposedTemplate?.description}\nParámetros sugeridos: ${researchResult.proposedTemplate?.paramsHint}`
            : 'No encontré una plantilla similar en mi investigación. Prueba con una variación más específica.'),
        action: 'ask',
        questions: ['¿Quieres que intente generar una variación con los parámetros sugeridos?'],
      })
    }

    // ===== ACCIÓN: TEMPLATE (generar SVG) =====
    if (parsed.action === 'template' && parsed.templateId) {
      const templateId = parsed.templateId
      if (!TEMPLATES.find((t) => t.id === templateId)) {
        return NextResponse.json<ChatApiResponse>({
          reply: `No reconozco la plantilla "${templateId}". Plantillas disponibles: ${TEMPLATES.map((t) => t.id).join(', ')}.`,
          action: 'ask',
          questions: ['¿Qué tipo de objeto quieres crear?'],
        })
      }

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

      // ===== LOGGING DE APRENDIZAJE =====
      await logInteraction({
        userMessage: lastUserMessage?.content || '',
        templateId,
        params,
        success: !!result,
        validSvg: finalValid,
        loopAttempts: loopHistory.length,
        errors: loopHistory.flatMap((l) => l.errors),
        replyText: parsed.reply,
      })

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

    // ===== ACCIÓN: ASK (respuesta conversacional) =====
    // Si la petición es novedosa y no encaja en plantillas, sugerir investigación
    if (
      parsed.action === 'ask' &&
      lastUserMessage &&
      shouldResearch(lastUserMessage.content, TEMPLATES.map((t) => t.id))
    ) {
      return NextResponse.json<ChatApiResponse>({
        reply:
          parsed.reply +
          '\n\n💡 ¿Quieres que investigue en la web (Boxes.py, GitHub, instructables) si existe una plantilla similar? Usa el botón "Investigar" abajo.',
        action: 'ask',
        questions: ['¿Investigo plantillas similares en la web?'],
      })
    }

    return NextResponse.json<ChatApiResponse>({
      reply: parsed.reply,
      action: 'ask',
      questions: parsed.questions ?? undefined,
    })
  } catch (err) {
    console.error('[/api/chat] error:', err)
    const errMsg = err instanceof Error ? err.message : 'unknown_error'
    const isConfigError =
      errMsg.includes('config') || errMsg.includes('.z-ai-config') || errMsg.includes('ZAI_')
    const isAuthError =
      errMsg.includes('Authentication Failed') ||
      errMsg.includes('401') ||
      errMsg.includes('token expired') ||
      errMsg.includes('incorrect')
    return NextResponse.json<ChatApiResponse>(
      {
        reply: isConfigError
          ? '⚠️ El agente IA no está configurado. Ve a "Settings" (icono ⚙ en el header) y pega tu token de Z.ai. Lo guardaremos solo en tu navegador (localStorage).'
          : isAuthError
          ? '⚠️ Tu token de Z.ai no es válido o está expirado. Ve a "Settings" (icono ⚙) y actualízalo. Mientras tanto puedes usar el botón "Plantillas" del header para generar plantillas sin IA.'
          : '⚠️ Ocurrió un error procesando tu mensaje. Puedes usar el botón "Plantillas" del header para generar directamente sin IA.',
        action: 'ask',
        questions: ['¿Quieres usar el botón "Plantillas" del header para generar directamente?'],
      },
      { status: 500 },
    )
  }
}
