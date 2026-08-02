'use client'

import * as React from 'react'
import { ZoomIn, ZoomOut, Maximize2, Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLaserStore } from '@/store/laser-store'

export function Canvas2D() {
  const { svg } = useLaserStore()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(1)
  const [showGrid, setShowGrid] = React.useState(true)

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 5))
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.2))
  const handleFit = () => setZoom(1)

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Toolbar */}
      <div className="flex h-10 items-center justify-between border-b bg-background px-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">Plano de corte</span>
          <span className="text-[10px]">·</span>
          <span>Zoom {(zoom * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowGrid((v) => !v)}
            title="Mostrar/ocultar cuadrícula"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFit}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto"
        style={{
          backgroundImage: showGrid
            ? `linear-gradient(to right, hsl(var(--border) / 0.4) 1px, transparent 1px),
               linear-gradient(to bottom, hsl(var(--border) / 0.4) 1px, transparent 1px)`
            : undefined,
          backgroundSize: showGrid ? '20px 20px' : undefined,
        }}
      >
        {svg ? (
          <div
            className="m-auto p-8"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', minHeight: '100%' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Grid3x3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No hay plano todavía</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Describe lo que quieres crear en el chat y aquí aparecerá el plano de corte con finger joints.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Regla inferior */}
      <div className="flex h-6 items-center justify-between border-t bg-background px-3 text-[10px] text-muted-foreground">
        <span>Coordenadas en milímetros</span>
        <span>Convención: rojo = corte · azul = grabado línea · negro = grabado relleno</span>
      </div>
    </div>
  )
}
