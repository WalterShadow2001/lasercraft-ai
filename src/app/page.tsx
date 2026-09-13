'use client'

import { Header } from '@/components/laser/header'
import { ChatPanel } from '@/components/laser/chat-panel'
import { Canvas2D } from '@/components/laser/canvas-2d'
import { Preview3D } from '@/components/laser/preview-3d'
import { MobileLayout } from '@/components/laser/mobile-layout'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

export default function Home() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        <Header />
        <MobileLayout />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Panel izquierdo: chat + customize */}
        <ResizablePanel defaultSize={28} minSize={22} maxSize={40}>
          <ChatPanel />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Panel central: canvas 2D */}
        <ResizablePanel defaultSize={42} minSize={30}>
          <Canvas2D />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Panel derecho: vista 3D */}
        <ResizablePanel defaultSize={30} minSize={22} maxSize={45}>
          <Preview3D />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
