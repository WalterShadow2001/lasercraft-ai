// Persistencia del chat y aprendizaje en localStorage
// El chat se guarda entre sesiones para que la IA "recuerde" conversaciones

import type { ChatMessage } from '@/types/laser'

const CHAT_KEY = 'lasercraft_chat_history'
const LEARN_KEY = 'lasercraft_learn_stats'

export interface LearnStats {
  totalInteractions: number
  successfulGenerations: number
  templatesUsed: Record<string, number>
  lastUsed: string | null
  topDimensions: { width: number; height: number; depth: number } | null
}

// ===== Chat history =====
export function saveChat(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return
  try {
    // Limitar a últimos 50 mensajes para no llenar localStorage
    const trimmed = messages.slice(-50)
    localStorage.setItem(CHAT_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('saveChat error:', e)
  }
}

export function loadChat(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CHAT_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function clearChat(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CHAT_KEY)
}

// ===== Learn stats =====
export function loadLearnStats(): LearnStats {
  if (typeof window === 'undefined') {
    return {
      totalInteractions: 0,
      successfulGenerations: 0,
      templatesUsed: {},
      lastUsed: null,
      topDimensions: null,
    }
  }
  try {
    const raw = localStorage.getItem(LEARN_KEY)
    if (!raw) {
      return {
        totalInteractions: 0,
        successfulGenerations: 0,
        templatesUsed: {},
        lastUsed: null,
        topDimensions: null,
      }
    }
    return JSON.parse(raw)
  } catch {
    return {
      totalInteractions: 0,
      successfulGenerations: 0,
      templatesUsed: {},
      lastUsed: null,
      topDimensions: null,
    }
  }
}

export function recordInteraction(
  templateId: string | null,
  success: boolean,
  dimensions?: { width: number; height: number; depth: number },
): void {
  if (typeof window === 'undefined') return
  try {
    const stats = loadLearnStats()
    stats.totalInteractions++
    if (success) stats.successfulGenerations++
    if (templateId) {
      stats.templatesUsed[templateId] = (stats.templatesUsed[templateId] || 0) + 1
    }
    stats.lastUsed = new Date().toISOString()
    if (dimensions && success) {
      stats.topDimensions = dimensions
    }
    localStorage.setItem(LEARN_KEY, JSON.stringify(stats))
  } catch (e) {
    console.error('recordInteraction error:', e)
  }
}

// Detectar la plantilla más usada (preferencia del usuario)
export function getMostUsedTemplate(): string | null {
  const stats = loadLearnStats()
  const entries = Object.entries(stats.templatesUsed)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

// Generar sugerencias inteligentes basadas en el historial
export function getSmartSuggestions(): string[] {
  const stats = loadLearnStats()
  const suggestions: string[] = []

  // Si hay template favorito, sugerir variaciones
  const favTemplate = getMostUsedTemplate()
  if (favTemplate && stats.topDimensions) {
    const { width, height, depth } = stats.topDimensions
    switch (favTemplate) {
      case 'box':
        suggestions.push(`Caja ${width + 20}×${height}×${depth}mm con bisagra`)
        suggestions.push(`Cajón ${width}×${height}×${depth}mm`)
        break
      case 'frame':
        suggestions.push(`Portaretrato ${width + 50}×${height + 50}mm`)
        break
      case 'drawer':
        suggestions.push(`Caja para guardar el cajón ${width + 20}×${height}×${depth}mm`)
        break
    }
  }

  // Sugerencias default si no hay historial
  if (suggestions.length === 0) {
    suggestions.push('Caja 100×80×60mm con finger joints')
    suggestions.push('Caja con bisagra 120×80×60mm')
    suggestions.push('Portaretrato 20×15cm')
    suggestions.push('Llavero con texto "LaserCraft"')
    suggestions.push('Estante 200×250×80mm con 3 repisas')
  }

  return suggestions.slice(0, 5)
}
