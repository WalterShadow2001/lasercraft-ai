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
Tu trabajo es identificar la plantilla correcta de la biblioteca y llenar sus parámetros.

BIBLIOTECA DE PLANTILLAS (8 disponibles):
1. box — Caja ensamblable con 6 caras y finger joints
2. drawer — Cajón con tirador tipo U
3. shelf — Estante con repisas
4. display — Exhibidor escalonado tipo mostrador
5. keychain — Llavero con texto personalizado
6. plaque — Placa conmemorativa con nombre
7. sign — Letrero decorativo con texto grande
8. frame — Portaretrato con marco, respaldo y pie

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin texto adicional):
{
  "reply": "Respuesta conversacional breve en español (máx 2 frases)",
  "action": "ask" | "template" | "research",
  "templateId": "box" | "drawer" | "shelf" | "display" | "keychain" | "plaque" | "sign" | "frame" | null,
  "params": { "width": 100, "height": 80, ... } | null,
  "questions": ["pregunta?"] | null
}

REGLAS CRÍTICAS:
- SESGO HACIA GENERAR: Si el usuario menciona dimensiones (ej: "100x80x60mm", "caja 50mm") o un tipo claro de objeto (caja, cajón, llavero, placa, letrero, estante, exhibidor, portaretrato, marco), responde INMEDIATAMENTE action="template" con todos los parámetros. NO pidas más información.
- Si NO especifica el grosor, USA 6 por defecto (parámetro "thickness": 6).
- Si pide algo que NO encaja en ninguna plantilla (ej: "silla", "rueda", "engrane", "lampara"), responde action="research" para que el sistema investigue en la web.
- Los parámetros numéricos deben ser números (no strings).
- Usa medidas realistas (mm). Rangos: width 30-500, height 20-300, depth 30-400, thickness 3-12.
- Responde SIEMPRE en español, en tono profesional pero cercano.

PARÁMETROS POR PLANTILLA:
- box: width, height, depth, thickness, lidType ("closed"|"removable"|"flat"), bottomEdge ("finger"|"straight"|"holes"), engravingText (opcional)
- drawer: width, height, depth, thickness, handleWidth, handleHeight
- shelf: width, height, depth, thickness, shelves (número de repisas)
- display: width, height, depth, thickness, steps (número de escalones)
- keychain: width, height, text, fontSize, holeR
- plaque: width, height, text, subtext, fontSize
- sign: width, height, text, fontSize, border ("rect"|"rounded"|"oval")
- frame: photoW, photoH, border, thickness, standAngle ("10"|"15"|"20"|"25"), holeR, text (opcional)

EJEMPLOS:
Usuario: "caja 100x80x60mm con finger joints"
Respuesta: {"reply":"Generando caja 100×80×60mm con finger joints.","action":"template","templateId":"box","params":{"width":100,"height":80,"depth":60,"thickness":6,"lidType":"closed","bottomEdge":"finger"},"questions":null}

Usuario: "portaretrato 20x15x5cm"
Respuesta: {"reply":"Creando portaretrato para foto 200×150mm.","action":"template","templateId":"frame","params":{"photoW":200,"photoH":150,"border":25,"thickness":6,"standAngle":"15","holeR":3},"questions":null}

Usuario: "llavero con texto LaserCraft"
Respuesta: {"reply":"Creando llavero con tu texto.","action":"template","templateId":"keychain","params":{"width":50,"height":20,"text":"LaserCraft","fontSize":10,"holeR":3},"questions":null}

Usuario: "estante 200x250x80 con 3 repisas"
Respuesta: {"reply":"Generando estante con 3 repisas.","action":"template","templateId":"shelf","params":{"width":200,"height":250,"depth":80,"thickness":6,"shelves":3},"questions":null}`

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

// ===== Fallback por keywords: si el LLM no devuelve JSON, detectar plantilla manualmente =====
interface DetectedTemplate {
  templateId: string
  params: Record<string, number | string>
  reply: string
}

function detectTemplateByKeywords(message: string): DetectedTemplate | null {
  const msg = message.toLowerCase()
  // Extraer dimensiones: 100x80x60, 100×80×60, 100*80*60, 20cm, etc
  const dim3Matches = msg.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/)
  const dim2Matches = msg.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/)
  // Detectar unidad (cm vs mm)
  const isCm = msg.includes('cm')
  const unit = isCm ? 10 : 1 // convertir cm a mm
  // Texto entre comillas
  const textMatch = msg.match(/[""']([^""']+)[""']/)
  const text = textMatch ? textMatch[1] : ''
  // Detectar si pide bisagra / tapa removible / tapa abrible
  const wantsHinge = msg.includes('bisagra') || msg.includes('abrible') || msg.includes('removible') || msg.includes('tapa que abre')
  const wantsLid = msg.includes('tapa')
  // Detectar material
  const wantsAcrylic = msg.includes('acrilico') || msg.includes('acrílico') || msg.includes('acrylic')

  // Detectar plantilla
  if (msg.includes('portaretrato') || msg.includes('marco para foto') || msg.includes('marco de foto') || msg.includes('cuadro')) {
    if (dim2Matches) {
      const [w, h] = [parseFloat(dim2Matches[1]) * unit, parseFloat(dim2Matches[2]) * unit]
      return {
        templateId: 'frame',
        params: { photoW: w, photoH: h, border: 25, thickness: 6, standAngle: '15', holeR: 3 },
        reply: `Creando portaretrato para foto ${w}×${h}mm con marco de 25mm.`,
      }
    }
  }
  if (msg.includes('cajón') || msg.includes('cajon') || msg.includes('drawer')) {
    if (dim3Matches) {
      const [w, h, d] = [parseFloat(dim3Matches[1]) * unit, parseFloat(dim3Matches[2]) * unit, parseFloat(dim3Matches[3]) * unit]
      return {
        templateId: 'drawer',
        params: { width: w, height: h, depth: d, thickness: 6, handleWidth: 40, handleHeight: 15 },
        reply: `Generando cajón ${w}×${h}×${d}mm con tirador.`,
      }
    }
  }
  if (msg.includes('estante') || msg.includes('shelf') || msg.includes('repisas') || msg.includes('biblioteca')) {
    const shelvesMatch = msg.match(/(\d+)\s*(?:repisas|estantes|niveles)/)
    const shelves = shelvesMatch ? parseInt(shelvesMatch[1]) : 3
    if (dim3Matches) {
      const [w, h, d] = [parseFloat(dim3Matches[1]) * unit, parseFloat(dim3Matches[2]) * unit, parseFloat(dim3Matches[3]) * unit]
      return {
        templateId: 'shelf',
        params: { width: w, height: h, depth: d, thickness: 6, shelves },
        reply: `Generando estante ${w}×${h}×${d}mm con ${shelves} repisas.`,
      }
    }
  }
  if (msg.includes('exhibidor') || msg.includes('display') || msg.includes('escalon') || msg.includes('mostrador')) {
    const stepsMatch = msg.match(/(\d+)\s*(?:escalones|niveles)/)
    const steps = stepsMatch ? parseInt(stepsMatch[1]) : 3
    if (dim3Matches) {
      const [w, h, d] = [parseFloat(dim3Matches[1]) * unit, parseFloat(dim3Matches[2]) * unit, parseFloat(dim3Matches[3]) * unit]
      return {
        templateId: 'display',
        params: { width: w, height: h, depth: d, thickness: 6, steps },
        reply: `Generando exhibidor ${w}×${h}×${d}mm con ${steps} escalones.`,
      }
    }
  }
  if (msg.includes('llavero') || msg.includes('keychain')) {
    const t = text || (msg.includes('texto') ? msg.split('texto')[1]?.trim().slice(0, 20) : 'LaserCraft')
    return {
      templateId: 'keychain',
      params: { width: 50, height: 20, text: t, fontSize: 10, holeR: 3 },
      reply: `Creando llavero con texto "${t}".`,
    }
  }
  if (msg.includes('placa') || msg.includes('trofeo') || msg.includes('plaque') || msg.includes('diploma')) {
    const t = text || (msg.includes('texto') ? msg.split('texto')[1]?.trim().slice(0, 20) : 'Premio Excelencia')
    return {
      templateId: 'plaque',
      params: { width: 100, height: 60, text: t, subtext: '2025', fontSize: 18 },
      reply: `Creando placa conmemorativa "${t}".`,
    }
  }
  if (msg.includes('letrero') || msg.includes('sign') || msg.includes('cartel') || msg.includes('rótulo')) {
    const t = text || (msg.includes('texto') ? msg.split('texto')[1]?.trim().slice(0, 20) : 'BIENVENIDO')
    return {
      templateId: 'sign',
      params: { width: 200, height: 80, text: t, fontSize: 30, border: 'rect' },
      reply: `Creando letrero "${t}".`,
    }
  }
  if (msg.includes('caja') || msg.includes('box') || msg.includes('recipiente') || msg.includes('contenedor')) {
    if (dim3Matches) {
      const [w, h, d] = [parseFloat(dim3Matches[1]) * unit, parseFloat(dim3Matches[2]) * unit, parseFloat(dim3Matches[3]) * unit]
      // Si pide bisagra o tapa removible, usar lidType removable
      const lidType = wantsHinge ? 'removable' : (wantsLid ? 'closed' : 'closed')
      return {
        templateId: 'box',
        params: { width: w, height: h, depth: d, thickness: 6, lidType, bottomEdge: 'finger' },
        reply: `Generando caja ${w}×${h}×${d}mm${wantsHinge ? ' con tapa removible (estilo bisagra)' : ''} con finger joints.`,
      }
    }
    // Caja sin dimensiones explícitas: usar defaults razonables
    return {
      templateId: 'box',
      params: { width: 100, height: 80, depth: 60, thickness: 6, lidType: wantsHinge ? 'removable' : 'closed', bottomEdge: 'finger' },
      reply: `Generando caja 100×80×60mm${wantsHinge ? ' con tapa removible' : ''}. Tip: puedes especificar dimensiones como "caja 120x80x60mm".`,
    }
  }
  return null
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
    let parsed: LlmResponse
    try {
      const zai = await getZai(req)
      const rawReply = await zai.chatCompletion(
        llmMessages.map((m) => ({ role: m.role, content: m.content })),
        { temperature: 0.4, max_tokens: 800 },
      )
      parsed = parseLlmResponse(rawReply)
    } catch (err) {
      console.error('[/api/chat] LLM error, usando fallback:', err)
      // Fallback: detectar plantilla por keywords
      const detected = lastUserMessage ? detectTemplateByKeywords(lastUserMessage.content) : null
      if (detected) {
        parsed = {
          reply: detected.reply,
          action: 'template',
          templateId: detected.templateId,
          params: detected.params,
          questions: null,
        }
      } else {
        return NextResponse.json<ChatApiResponse>({
          reply: '⚠️ El agente IA no está disponible. Configura tu token en Settings (icono ⚙) o usa el botón "Plantillas" del header para generar directamente.',
          action: 'ask',
          questions: ['¿Quieres usar el botón "Plantillas" del header?'],
        })
      }
    }

    // Fallback adicional: si el LLM respondió pero no con JSON válido, intentar detección por keywords
    if (parsed.action === 'ask' && lastUserMessage) {
      const detected = detectTemplateByKeywords(lastUserMessage.content)
      if (detected) {
        parsed = {
          reply: detected.reply,
          action: 'template',
          templateId: detected.templateId,
          params: detected.params,
          questions: null,
        }
      }
    }

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
