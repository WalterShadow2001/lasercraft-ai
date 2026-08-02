// Estado global con Zustand
'use client'

import { create } from 'zustand'
import type { ChatMessage, ProjectSettings, MaterialType, LoopEntry, Placement } from '@/types/laser'
import { MATERIALS } from '@/types/laser'

interface LaserState {
  // Chat
  messages: ChatMessage[]
  isAiThinking: boolean
  // Generación
  svg: string | null
  dimensions: { width: number; height: number; depth: number } | null
  partCount: number
  loopHistory: LoopEntry[]
  // Plantilla activa
  lastTemplateId: string | null
  lastParams: Record<string, number | string> | null
  // UI
  show3D: boolean
  showCustomize: boolean
  exploded: boolean
  autoRotate: boolean
  placements: Placement[]
  // Settings
  settings: ProjectSettings
  // Acciones
  addMessage: (msg: ChatMessage) => void
  setThinking: (v: boolean) => void
  setSvg: (svg: string, dimensions?: { width: number; height: number; depth: number }, partCount?: number) => void
  setLastGeneration: (templateId: string, params: Record<string, number | string>) => void
  setLoopHistory: (history: LoopEntry[]) => void
  toggle3D: () => void
  toggleCustomize: () => void
  toggleExploded: () => void
  toggleAutoRotate: () => void
  setPlacements: (p: Placement[]) => void
  updateSettings: (s: Partial<ProjectSettings>) => void
  setMaterial: (m: MaterialType) => void
  clearChat: () => void
}

const defaultSettings: ProjectSettings = {
  material: 'mdf6',
  width: 100,
  height: 80,
  depth: 60,
  kerf: 0.1,
}

export const useLaserStore = create<LaserState>((set) => ({
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy LaserCraft AI. Describe lo que quieres crear y generaré la plantilla lista para corte láser. Por ejemplo: "caja 100×80×60mm con finger joints" o "llavero con texto LaserCraft".',
      createdAt: Date.now(),
    },
  ],
  isAiThinking: false,
  svg: null,
  dimensions: null,
  partCount: 0,
  loopHistory: [],
  lastTemplateId: null,
  lastParams: null,
  show3D: true,
  showCustomize: false,
  exploded: false,
  autoRotate: true,
  placements: [],
  settings: defaultSettings,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setThinking: (v) => set({ isAiThinking: v }),
  setSvg: (svg, dimensions, partCount) =>
    set({ svg, dimensions: dimensions ?? null, partCount: partCount ?? 0 }),
  setLastGeneration: (templateId, params) =>
    set({ lastTemplateId: templateId, lastParams: params, showCustomize: true }),
  setLoopHistory: (history) => set({ loopHistory: history }),
  toggle3D: () => set((s) => ({ show3D: !s.show3D })),
  toggleCustomize: () => set((s) => ({ showCustomize: !s.showCustomize })),
  toggleExploded: () => set((s) => ({ exploded: !s.exploded })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  setPlacements: (p) => set({ placements: p }),
  updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
  setMaterial: (m) =>
    set((state) => ({
      settings: { ...state.settings, material: m, thickness: MATERIALS[m].thickness },
    })),
  clearChat: () =>
    set({
      messages: [
        {
          id: 'welcome-' + Date.now(),
          role: 'assistant',
          content: 'Conversación reiniciada. ¿Qué quieres diseñar ahora?',
          createdAt: Date.now(),
        },
      ],
      svg: null,
      dimensions: null,
      partCount: 0,
      loopHistory: [],
      lastTemplateId: null,
      lastParams: null,
      placements: [],
    }),
}))
