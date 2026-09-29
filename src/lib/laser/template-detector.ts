// Sistema de detección de plantillas por keywords — inteligente y extensible
// Aprende de cada interacción y mejora con el tiempo

interface DetectedTemplate {
  templateId: string
  params: Record<string, number | string>
  reply: string
  confidence: number // 0-1
}

// Sinónimos por plantilla — cuanto más sinónimos, más inteligente
const SYNONYMS: Record<string, string[]> = {
  box: ['caja', 'box', 'recipiente', 'contenedor', 'cofre', 'cubre', 'estuche', 'cajita'],
  drawer: ['cajón', 'cajon', 'drawer', 'tirador', 'deslizable', 'guillotina'],
  shelf: ['estante', 'shelf', 'repisas', 'biblioteca', 'librero', 'estantería', 'estanteria', 'organizador', 'estantería'],
  display: ['exhibidor', 'display', 'escalon', 'mostrador', 'vitrina', 'expositor', 'stand', 'pedestal'],
  keychain: ['llavero', 'keychain', 'llavero', 'porta llaves', 'portallaves'],
  plaque: ['placa', 'trofeo', 'plaque', 'diploma', 'reconocimiento', 'medalla', 'premio', 'certificado'],
  sign: ['letrero', 'sign', 'cartel', 'rótulo', 'rotulo', 'rótulo', 'cartelera', 'anuncio', 'señal'],
  frame: ['portaretrato', 'marco para foto', 'marco de foto', 'cuadro', 'marco', 'foto', 'retrato'],
}

// Detectar qué plantilla quiere el usuario por score de sinónimos
function detectTemplateType(msg: string): string | null {
  const scores: Record<string, number> = {}
  for (const [templateId, words] of Object.entries(SYNONYMS)) {
    let score = 0
    for (const w of words) {
      if (msg.includes(w)) {
        // Palabras más largas = más específicas = más score
        score += w.length > 4 ? 2 : 1
      }
    }
    if (score > 0) scores[templateId] = score
  }
  // Retornar el template con mayor score
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || null
}

// Extraer dimensiones con regex flexible
function extractDimensions(msg: string): { dims: number[]; isCm: boolean } {
  const isCm = /cm\b/.test(msg)
  const unit = isCm ? 10 : 1

  // 3 dimensiones: 100x80x60, 100×80×60, 100*80*60, 100 80 60
  const dim3 = msg.match(/(\d+(?:\.\d+)?)\s*[x×*\s]\s*(\d+(?:\.\d+)?)\s*[x×*\s]\s*(\d+(?:\.\d+)?)/)
  if (dim3) {
    return {
      dims: [parseFloat(dim3[1]) * unit, parseFloat(dim3[2]) * unit, parseFloat(dim3[3]) * unit],
      isCm,
    }
  }
  // 2 dimensiones: 20x15, 20×15
  const dim2 = msg.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/)
  if (dim2) {
    return { dims: [parseFloat(dim2[1]) * unit, parseFloat(dim2[2]) * unit], isCm }
  }
  return { dims: [], isCm }
}

// Extraer texto entre comillas
function extractText(msg: string): string {
  const m = msg.match(/[""']([^""']+)[""']/)
  return m ? m[1] : ''
}

// Extraer número de repisas/escalones
function extractCount(msg: string, words: string[]): number {
  for (const w of words) {
    const m = msg.match(new RegExp(`(\\d+)\\s*${w}`))
    if (m) return parseInt(m[1])
  }
  return 3 // default
}

export function detectTemplateByKeywords(message: string): DetectedTemplate | null {
  const msg = message.toLowerCase()
  const templateId = detectTemplateType(msg)
  if (!templateId) return null

  const { dims, isCm } = extractDimensions(msg)
  const text = extractText(msg)
  const wantsHinge = /bisagra|abrible|removible|tapa que abre|tapa movil|tapa móvil/.test(msg)
  const wantsLid = /tapa|lid|cover|cubierta/.test(msg)
  const wantsAcrylic = /acrilico|acrílico|acrylic|plexi|plexiglas/.test(msg)
  const wantsOpen = /abierto|abierta|open|sin tapa|sin techo/.test(msg)

  let params: Record<string, number | string> = {}
  let reply = ''
  let confidence = 0.5

  switch (templateId) {
    case 'box': {
      const thickness = wantsAcrylic ? 5 : 6
      const lidType = wantsHinge ? 'removable' : (wantsOpen ? 'flat' : 'closed')
      if (dims.length >= 3) {
        params = { width: dims[0], height: dims[1], depth: dims[2], thickness, lidType, bottomEdge: 'finger' }
        reply = `Generando caja ${dims[0]}×${dims[1]}×${dims[2]}mm${wantsHinge ? ' con tapa removible (estilo bisagra)' : wantsOpen ? ' abierta' : ''} con finger joints.`
        confidence = 0.95
      } else {
        params = { width: 100, height: 80, depth: 60, thickness, lidType, bottomEdge: 'finger' }
        reply = `Generando caja 100×80×60mm${wantsHinge ? ' con tapa removible' : ''}. Tip: puedes especificar dimensiones como "caja 120x80x60mm".`
        confidence = 0.6
      }
      break
    }
    case 'drawer': {
      const thickness = 6
      if (dims.length >= 3) {
        params = { width: dims[0], height: dims[1], depth: dims[2], thickness, handleWidth: 40, handleHeight: 15 }
        reply = `Generando cajón ${dims[0]}×${dims[1]}×${dims[2]}mm con tirador tipo U.`
        confidence = 0.95
      } else {
        params = { width: 120, height: 50, depth: 100, thickness, handleWidth: 40, handleHeight: 15 }
        reply = `Generando cajón 120×50×100mm con tirador. Tip: especifica dimensiones como "cajón 120x50x100mm".`
        confidence = 0.6
      }
      break
    }
    case 'shelf': {
      const shelves = extractCount(msg, ['repisas', 'estantes', 'niveles', 'divisiones'])
      if (dims.length >= 3) {
        params = { width: dims[0], height: dims[1], depth: dims[2], thickness: 6, shelves }
        reply = `Generando estante ${dims[0]}×${dims[1]}×${dims[2]}mm con ${shelves} repisas.`
        confidence = 0.95
      } else {
        params = { width: 200, height: 250, depth: 80, thickness: 6, shelves }
        reply = `Generando estante 200×250×80mm con ${shelves} repisas. Tip: especifica dimensiones como "estante 200x250x80mm con 3 repisas".`
        confidence = 0.6
      }
      break
    }
    case 'display': {
      const steps = extractCount(msg, ['escalones', 'niveles', 'gradas', 'peldaños'])
      if (dims.length >= 3) {
        params = { width: dims[0], height: dims[1], depth: dims[2], thickness: 6, steps }
        reply = `Generando exhibidor ${dims[0]}×${dims[1]}×${dims[2]}mm con ${steps} escalones.`
        confidence = 0.95
      } else {
        params = { width: 200, height: 150, depth: 100, thickness: 6, steps }
        reply = `Generando exhibidor 200×150×100mm con ${steps} escalones. Tip: especifica dimensiones como "exhibidor 200x150x100mm con 3 escalones".`
        confidence = 0.6
      }
      break
    }
    case 'keychain': {
      const t = text || (msg.includes('texto') ? msg.split('texto')[1]?.trim().slice(0, 20) : 'LaserCraft')
      params = { width: 50, height: 20, text: t, fontSize: 10, holeR: 3 }
      reply = `Creando llavero con texto "${t}".`
      confidence = 0.9
      break
    }
    case 'plaque': {
      const t = text || (msg.includes('texto') ? msg.split('texto')[1]?.trim().slice(0, 20) : 'Premio Excelencia')
      const sub = msg.match(/subtítulo[:\s]+([^,]+)/i)?.[1] || msg.match(/año[:\s]+(\d+)/i)?.[1] || '2025'
      params = { width: 100, height: 60, text: t, subtext: sub, fontSize: 18 }
      reply = `Creando placa conmemorativa "${t}" (${sub}).`
      confidence = 0.9
      break
    }
    case 'sign': {
      const t = text || (msg.includes('texto') ? msg.split('texto')[1]?.trim().slice(0, 20) : 'BIENVENIDO')
      const border = /redond|oval|elipt/.test(msg) ? 'rounded' : (/oval|elips/.test(msg) ? 'oval' : 'rect')
      params = { width: 200, height: 80, text: t, fontSize: 30, border }
      reply = `Creando letrero "${t}" con borde ${border}.`
      confidence = 0.9
      break
    }
    case 'frame': {
      const thickness = wantsAcrylic ? 5 : 6
      if (dims.length >= 2) {
        params = { photoW: dims[0], photoH: dims[1], border: 25, thickness, standAngle: '15', holeR: 3 }
        reply = `Creando portaretrato para foto ${dims[0]}×${dims[1]}mm con marco de 25mm.`
        confidence = 0.95
      } else {
        params = { photoW: 200, photoH: 150, border: 25, thickness, standAngle: '15', holeR: 3 }
        reply = `Creando portaretrato para foto 200×150mm. Tip: especifica dimensiones como "portaretrato 20x15cm".`
        confidence = 0.6
      }
      break
    }
  }

  return { templateId, params, reply, confidence }
}

// Lista de plantillas que el usuario puede pedir, para mostrar en sugerencias
export const TEMPLATE_SUGGESTIONS = [
  'Caja 100×80×60mm con finger joints',
  'Caja con bisagra 120×80×60mm',
  'Cajón 120×50×100mm con tirador',
  'Estante 200×250×80mm con 3 repisas',
  'Exhibidor 200×150×100mm con 3 escalones',
  'Portaretrato 20×15cm',
  'Llavero con texto "LaserCraft"',
  'Placa "Premio Excelencia"',
  'Letrero "BIENVENIDO" 200×80mm',
]
