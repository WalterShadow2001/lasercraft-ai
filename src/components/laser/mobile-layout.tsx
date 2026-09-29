'use client'

import * as React from 'react'
import { MessageSquare, Scissors, Box, SlidersHorizontal } from 'lucide-react'
import { ChatPanel } from './chat-panel'
import { Canvas2D } from './canvas-2d'
import { Preview3D } from './preview-3d'
import { CustomizePanel } from './customize-panel'
import { useLaserStore } from '@/store/laser-store'
import { cn } from '@/lib/utils'

type MobileTab = 'chat' | 'canvas' | 'preview' | 'customize'

const TABS: { id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'canvas', label: 'Plano', icon: Scissors },
  { id: 'preview', label: '3D', icon: Box },
  { id: 'customize', label: 'Ajustes', icon: SlidersHorizontal },
]

export function MobileLayout() {
  const [activeTab, setActiveTab] = React.useState<MobileTab>('chat')
  const { showCustomize, lastTemplateId } = useLaserStore()

  // Si hay plantilla generada, mostrar badge en Customize
  const showCustomizeBadge = !!lastTemplateId

  // Si se abre el customize panel (desde el chat), saltar a esa tab
  React.useEffect(() => {
    if (showCustomize && activeTab === 'chat') {
      // Solo cambiar si el customize panel está visible en chat
    }
  }, [showCustomize, activeTab])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Contenido principal - tabs full-screen */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'canvas' && <Canvas2D />}
        {activeTab === 'preview' && <Preview3D />}
        {activeTab === 'customize' && (
          <div className="flex h-full flex-col bg-background">
            <div className="flex h-9 items-center justify-between border-b px-3">
              <span className="text-xs font-medium">Personalizar</span>
            </div>
            <div className="flex-1 overflow-auto">
              <CustomizePanel forceOpen />
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <nav className="flex h-14 items-stretch border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const showBadge = tab.id === 'customize' && showCustomizeBadge
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition',
                isActive ? 'text-amber-500' : 'text-muted-foreground',
              )}
              aria-label={tab.label}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-amber-500')} />
              <span className={cn('text-[10px] font-medium', isActive && 'text-amber-500')}>
                {tab.label}
              </span>
              {showBadge && (
                <span className="absolute right-[28%] top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
              {isActive && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-500" />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
