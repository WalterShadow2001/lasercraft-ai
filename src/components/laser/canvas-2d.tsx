'use client'

import * as React from 'react'
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Play, Pause, Scissors, Clock, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLaserStore } from '@/store/laser-store'

// Dimensiones estándar de camas de láser comunes (mm)
const LASER_BEDS = [
  { id: 'glowforge', label: 'Glowforge Pro', w: 495, h: 690 },
  { id: 'xtool', label: 'xTool P2', w: 600, h: 308 },
  { id: 'universal', label: 'Universal', w: 600, h: 400 },
  { id: 'trotec', label: 'Trotec Speedy 400', w: 600, h: 400 },
  { id: 'custom', label: 'Personalizado', w: 600, h: 400 },
]

export function Canvas2D() {
  const { svg, partCount, dimensions } = useLaserStore()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(1)
  const [showGrid, setShowGrid] = React.useState(true)
  const [bedIndex, setBedIndex] = React.useState(2) // Universal por defecto
  const [isSimulating, setIsSimulating] = React.useState(false)
  const [simProgress, setSimProgress] = React.useState(0)
  const simRef = React.useRef<number | null>(null)

  const bed = LASER_BEDS[bedIndex]

  // Calcular longitud total de paths para estimar tiempo de corte
  const cutInfo = React.useMemo(() => {
    if (!svg) return { totalLength: 0, estTime: 0, partCount: 0 }
    // Aproximación: contar segmentos L y A en el SVG
    const lineMatches = svg.match(/L\s+[\d.-]+/gi) || []
    const arcMatches = svg.match(/A\s+[\d.-]+/gi) || []
    const segments = lineMatches.length + arcMatches.length
    // Estimación: cada segmento promedio 20mm
    const totalLength = segments * 20
    // Velocidad típica de corte: 200mm/s para MDF 6mm
    const speed = 200 // mm/s
    const estTime = totalLength / speed // segundos
    return { totalLength, estTime, partCount: segments }
  }, [svg])

  // Simulación del láser
  React.useEffect(() => {
    if (!isSimulating) {
      if (simRef.current) {
        cancelAnimationFrame(simRef.current)
        simRef.current = null
      }
      return
    }
    let last = performance.now()
    const animate = (now: number) => {
      const delta = (now - last) / 1000
      last = now
      setSimProgress((p) => {
        const next = p + delta * 0.15 // 15% por segundo
        if (next >= 1) {
          setIsSimulating(false)
          return 0
        }
        return next
      })
      simRef.current = requestAnimationFrame(animate)
    }
    simRef.current = requestAnimationFrame(animate)
    return () => {
      if (simRef.current) cancelAnimationFrame(simRef.current)
    }
  }, [isSimulating])

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 5))
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.2))
  const handleFit = () => setZoom(1)

  const toggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false)
    } else {
      setSimProgress(0)
      setIsSimulating(true)
    }
  }

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Toolbar */}
      <div className="flex h-10 items-center justify-between border-b bg-background px-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Scissors className="h-3.5 w-3.5 text-red-500" />
          <span className="font-medium">Cama láser</span>
          <select
            value={bed.id}
            onChange={(e) => {
              const idx = LASER_BEDS.findIndex((b) => b.id === e.target.value)
              if (idx >= 0) setBedIndex(idx)
            }}
            className="h-6 rounded border bg-background px-1 text-[11px]"
          >
            {LASER_BEDS.map((b) => (
              <option key={b.id} value={b.id}>{b.label} ({b.w}×{b.h}mm)</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          {svg && (
            <>
              <Button
                variant={isSimulating ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={toggleSimulation}
                title="Simular corte láser"
              >
                {isSimulating ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span className="hidden sm:inline">{isSimulating ? 'Pausa' : 'Simular'}</span>
              </Button>
              <div className="mx-1 h-4 w-px bg-border" />
            </>
          )}
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
          <span className="text-[10px] text-muted-foreground w-10 text-center">
            {(zoom * 100).toFixed(0)}%
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFit}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {svg && (
        <div className="flex h-8 items-center gap-3 border-b bg-muted/50 px-3 text-[11px]">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-blue-500" />
            <span className="text-muted-foreground">Tiempo est.:</span>
            <strong className="font-mono">
              {cutInfo.estTime < 60
                ? `${cutInfo.estTime.toFixed(1)}s`
                : `${Math.floor(cutInfo.estTime / 60)}:${String(Math.floor(cutInfo.estTime % 60)).padStart(2, '0')}`}
            </strong>
          </div>
          <div className="flex items-center gap-1">
            <Scissors className="h-3 w-3 text-red-500" />
            <span className="text-muted-foreground">Long. corte:</span>
            <strong className="font-mono">{cutInfo.totalLength}mm</strong>
          </div>
          <div className="flex items-center gap-1">
            <Ruler className="h-3 w-3 text-emerald-500" />
            <span className="text-muted-foreground">Partes:</span>
            <strong className="font-mono">{partCount}</strong>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground">Cama:</span>
            <Badge variant="outline" className="text-[10px]">
              {bed.w}×{bed.h}mm
            </Badge>
            {dimensions && (
              <span className="text-[10px] text-muted-foreground">
                Pieza: {dimensions.width}×{dimensions.height}×{dimensions.depth}mm
              </span>
            )}
          </div>
        </div>
      )}

      {/* Canvas con cama de láser */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-900"
        style={{
          backgroundImage: showGrid
            ? `linear-gradient(to right, hsl(var(--border) / 0.5) 1px, transparent 1px),
               linear-gradient(to bottom, hsl(var(--border) / 0.5) 1px, transparent 1px)`
            : undefined,
          backgroundSize: showGrid ? '20px 20px' : undefined,
        }}
      >
        {svg ? (
          <div className="m-auto p-8 inline-block relative" style={{ minHeight: '100%' }}>
            {/* Cama de láser (rectángulo de referencia) */}
            <div
              className="absolute border-2 border-dashed border-blue-500/60 bg-white/5 dark:bg-black/20 pointer-events-none"
              style={{
                width: bed.w * zoom,
                height: bed.h * zoom,
                left: 8,
                top: 8,
              }}
            >
              <span className="absolute -top-4 left-0 text-[10px] text-blue-500 font-mono">
                {bed.w}mm
              </span>
              <span className="absolute -left-8 top-1 text-[10px] text-blue-500 font-mono rotate-[-90deg] origin-top-right">
                {bed.h}mm
              </span>
            </div>

            {/* Regla horizontal (mm) */}
            <div
              className="absolute left-0 right-0 -top-1 h-1 flex pointer-events-none"
              style={{ paddingLeft: 8 }}
            >
              {Array.from({ length: Math.floor(bed.w / 50) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-2 border-l border-muted-foreground/50"
                  style={{ left: 8 + i * 50 * zoom }}
                >
                  <span className="absolute -top-3 -translate-x-1/2 text-[8px] text-muted-foreground">
                    {i * 50}
                  </span>
                </div>
              ))}
            </div>

            {/* SVG del plano de corte */}
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                marginLeft: 8,
                marginTop: 8,
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            {/* Indicador del láser en simulación */}
            {isSimulating && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: 8 + simProgress * (bed.w * zoom - 20),
                  top: 8 + (simProgress * bed.h * zoom) % (bed.h * zoom),
                }}
              >
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-red-500/30 animate-ping" />
                  <div className="absolute -inset-1 rounded-full bg-red-500" />
                  <div className="absolute -inset-0.5 rounded-full bg-white" />
                </div>
              </div>
            )}

            {/* Progress bar de simulación */}
            {isSimulating && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${simProgress * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Scissors className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No hay plano de corte todavía</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Describe lo que quieres crear en el chat y aquí verás el plano listo para imprimir en láser, con cama, reglas y tiempo estimado.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Convención de colores */}
      <div className="flex h-6 items-center justify-between border-t bg-background px-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> corte
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-black" /> grabado relleno
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> grabado línea
          </span>
        </div>
        <span>Coordenadas en mm · escala 1:{(1 / zoom).toFixed(2)}</span>
      </div>
    </div>
  )
}
