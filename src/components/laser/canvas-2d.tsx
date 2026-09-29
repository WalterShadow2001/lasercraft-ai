'use client'

import * as React from 'react'
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Play, Pause, Scissors, Clock, Ruler, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useLaserStore } from '@/store/laser-store'

// Dimensiones de camas de láser comunes (mm)
const LASER_BEDS = [
  { id: 'glowforge', label: 'Glowforge Pro', w: 495, h: 690 },
  { id: 'xtool', label: 'xTool P2', w: 600, h: 308 },
  { id: 'universal', label: 'Universal', w: 600, h: 400 },
  { id: 'trotec', label: 'Trotec Speedy 400', w: 600, h: 400 },
  { id: 'custom', label: 'Personalizado', w: 600, h: 400 },
]

// ===== Parser de paths SVG a puntos =====
// Convierte un path "M 0 0 L 100 0 L 100 50 Z" en segments de puntos
interface PathSegment {
  points: { x: number; y: number }[]
}

function parseSvgPath(d: string): PathSegment[] {
  const segments: PathSegment[] = []
  let current: { x: number; y: number }[] = []
  let pos = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }

  const tokens = d.match(/[MLAZCSQHVmlazcsqhv][^MLAZCSQHVmlazcsqhv]*/gi) || []
  for (const tok of tokens) {
    const cmd = tok[0].toUpperCase()
    const nums = tok.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number)
    const isRelative = tok[0] !== cmd

    if (cmd === 'M') {
      if (current.length > 0) segments.push({ points: current })
      current = []
      pos = { x: nums[0], y: nums[1] }
      start = { ...pos }
      current.push({ ...pos })
      // M puede tener múltiples coords (polyline)
      for (let i = 2; i < nums.length; i += 2) {
        pos = { x: nums[i], y: nums[i + 1] }
        current.push({ ...pos })
      }
    } else if (cmd === 'L') {
      for (let i = 0; i < nums.length; i += 2) {
        pos = isRelative
          ? { x: pos.x + nums[i], y: pos.y + nums[i + 1] }
          : { x: nums[i], y: nums[i + 1] }
        current.push({ ...pos })
      }
    } else if (cmd === 'H') {
      for (const n of nums) {
        pos = { x: isRelative ? pos.x + n : n, y: pos.y }
        current.push({ ...pos })
      }
    } else if (cmd === 'V') {
      for (const n of nums) {
        pos = { x: pos.x, y: isRelative ? pos.y + n : n }
        current.push({ ...pos })
      }
    } else if (cmd === 'Z' || cmd === 'A' || cmd === 'C' || cmd === 'S' || cmd === 'Q') {
      // Para arcos y curvas, simplificar como línea al punto final
      if (cmd === 'Z') {
        current.push({ ...start })
        pos = { ...start }
      } else if (cmd === 'A') {
        // A rx ry x-rot large-arc sweep x y
        if (nums.length >= 6) {
          pos = isRelative
            ? { x: pos.x + nums[5], y: pos.y + nums[6] }
            : { x: nums[5], y: nums[6] }
          current.push({ ...pos })
        }
      } else if (cmd === 'C' && nums.length >= 6) {
        pos = isRelative
          ? { x: pos.x + nums[4], y: pos.y + nums[5] }
          : { x: nums[4], y: nums[5] }
        current.push({ ...pos })
      } else if (cmd === 'Q' && nums.length >= 4) {
        pos = isRelative
          ? { x: pos.x + nums[2], y: pos.y + nums[3] }
          : { x: nums[2], y: nums[3] }
        current.push({ ...pos })
      }
    }
  }
  if (current.length > 0) segments.push({ points: current })
  return segments
}

// Extraer todos los paths del SVG con sus offsets (transform translate)
interface SvgPath {
  d: string
  offsetX: number
  offsetY: number
}

function extractSvgPaths(svg: string): SvgPath[] {
  const paths: SvgPath[] = []
  // Buscar todos los <path d="..."> dentro de <g transform="translate(x y)">
  const groupMatches = [...svg.matchAll(/<g[^>]*transform="translate\(([\d.-]+)[\s,]+([\d.-]+)\)"[^>]*>([\s\S]*?)<\/g>/g)]
  for (const g of groupMatches) {
    const offX = parseFloat(g[1])
    const offY = parseFloat(g[2])
    const inner = g[3]
    const pathMatch = [...inner.matchAll(/<path[^>]*d="([^"]+)"/g)]
    for (const p of pathMatch) {
      paths.push({ d: p[1], offsetX: offX, offsetY: offY })
    }
  }
  // También paths sueltos sin grupo
  const loosePaths = [...svg.matchAll(/<path[^>]*d="([^"]+)"/g)]
  if (paths.length === 0) {
    for (const p of loosePaths) {
      paths.push({ d: p[1], offsetX: 0, offsetY: 0 })
    }
  }
  return paths
}

// Calcular longitud total de todos los segments
function totalPathLength(segments: PathSegment[]): number {
  let total = 0
  for (const seg of segments) {
    for (let i = 1; i < seg.points.length; i++) {
      const dx = seg.points[i].x - seg.points[i - 1].x
      const dy = seg.points[i].y - seg.points[i - 1].y
      total += Math.sqrt(dx * dx + dy * dy)
    }
  }
  return total
}

// Dado un progreso 0-1, encontrar la posición del láser en el path
function getLaserPosition(segments: PathSegment[], progress: number): { x: number; y: number } | null {
  const total = totalPathLength(segments)
  if (total === 0) return null
  let target = progress * total
  for (const seg of segments) {
    for (let i = 1; i < seg.points.length; i++) {
      const dx = seg.points[i].x - seg.points[i - 1].x
      const dy = seg.points[i].y - seg.points[i - 1].y
      const segLen = Math.sqrt(dx * dx + dy * dy)
      if (target <= segLen) {
        const t = segLen === 0 ? 0 : target / segLen
        return {
          x: seg.points[i - 1].x + dx * t,
          y: seg.points[i - 1].y + dy * t,
        }
      }
      target -= segLen
    }
  }
  // Si se pasa, devolver último punto
  const lastSeg = segments[segments.length - 1]
  return lastSeg?.points[lastSeg.points.length - 1] || null
}

export function Canvas2D() {
  const { svg, partCount, dimensions } = useLaserStore()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(1)
  const [showGrid, setShowGrid] = React.useState(true)
  const [bedIndex, setBedIndex] = React.useState(2)
  const [isSimulating, setIsSimulating] = React.useState(false)
  const [simProgress, setSimProgress] = React.useState(0)
  const [laserPos, setLaserPos] = React.useState<{ x: number; y: number } | null>(null)
  const [tracedPaths, setTracedPaths] = React.useState<number>(0)
  const simRef = React.useRef<number | null>(null)

  const bed = LASER_BEDS[bedIndex]

  // Parsear paths del SVG cuando cambia
  const parsedPaths = React.useMemo(() => {
    if (!svg) return { paths: [], segments: [], totalLength: 0 }
    const rawPaths = extractSvgPaths(svg)
    const allSegments: PathSegment[] = []
    for (const p of rawPaths) {
      const segs = parseSvgPath(p.d)
      // Aplicar offset del grupo
      for (const seg of segs) {
        seg.points = seg.points.map((pt) => ({ x: pt.x + p.offsetX, y: pt.y + p.offsetY }))
        allSegments.push(seg)
      }
    }
    const total = totalPathLength(allSegments)
    return { paths: rawPaths, segments: allSegments, totalLength: total }
  }, [svg])

  // Calcular info de corte
  const cutInfo = React.useMemo(() => {
    const totalLength = Math.round(parsedPaths.totalLength)
    const speed = 200 // mm/s para MDF 6mm
    const estTime = totalLength / speed
    return { totalLength, estTime, partCount: parsedPaths.segments.length }
  }, [parsedPaths])

  // Animación del láser
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
        const next = p + delta * 0.05 // 5% por segundo
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

  // Actualizar posición del láser según progreso
  React.useEffect(() => {
    if (!isSimulating && simProgress === 0) {
      setLaserPos(null)
      setTracedPaths(0)
      return
    }
    if (parsedPaths.segments.length === 0) return
    const pos = getLaserPosition(parsedPaths.segments, simProgress)
    setLaserPos(pos)
    setTracedPaths(Math.ceil(simProgress * parsedPaths.segments.length))
  }, [simProgress, isSimulating, parsedPaths])

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

  const skipToEnd = () => {
    setSimProgress(0.99)
    setIsSimulating(false)
  }

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Toolbar */}
      <div className="flex h-10 items-center justify-between border-b bg-background px-2 sm:px-3 overflow-x-auto">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          <Scissors className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          <select
            value={bed.id}
            onChange={(e) => {
              const idx = LASER_BEDS.findIndex((b) => b.id === e.target.value)
              if (idx >= 0) setBedIndex(idx)
            }}
            className="h-6 rounded border bg-background px-1 text-[11px] max-w-[140px]"
          >
            {LASER_BEDS.map((b) => (
              <option key={b.id} value={b.id}>{b.label} ({b.w}×{b.h}mm)</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {svg && (
            <>
              <Button
                variant={isSimulating ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1 text-xs px-2"
                onClick={toggleSimulation}
                title="Simular corte láser"
              >
                {isSimulating ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span className="hidden sm:inline">{isSimulating ? 'Pausa' : 'Simular'}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={skipToEnd}
                title="Avanzar al final"
              >
                <SkipForward className="h-3.5 w-3.5" />
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
          <span className="text-[10px] text-muted-foreground w-10 text-center hidden sm:inline">
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
        <div className="flex items-center gap-2 sm:gap-3 border-b bg-muted/50 px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] overflow-x-auto">
          <div className="flex items-center gap-1 flex-shrink-0">
            <Clock className="h-3 w-3 text-blue-500" />
            <span className="text-muted-foreground hidden sm:inline">Tiempo:</span>
            <strong className="font-mono">
              {cutInfo.estTime < 60
                ? `${cutInfo.estTime.toFixed(1)}s`
                : `${Math.floor(cutInfo.estTime / 60)}:${String(Math.floor(cutInfo.estTime % 60)).padStart(2, '0')}`}
            </strong>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Scissors className="h-3 w-3 text-red-500" />
            <strong className="font-mono">{cutInfo.totalLength}mm</strong>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Ruler className="h-3 w-3 text-emerald-500" />
            <strong className="font-mono">{partCount}</strong>
          </div>
          {isSimulating && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-amber-500">●</span>
              <strong className="font-mono text-amber-600">{(simProgress * 100).toFixed(0)}%</strong>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-[9px] sm:text-[10px]">
              {bed.w}×{bed.h}mm
            </Badge>
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
            {/* Cama de láser */}
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
            <div className="absolute left-0 right-0 -top-1 h-1 flex pointer-events-none" style={{ paddingLeft: 8 }}>
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

            {/* SVG del plano de corte con overlay del láser */}
            <div
              className="relative"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                marginLeft: 8,
                marginTop: 8,
              }}
            >
              {/* SVG original */}
              <div dangerouslySetInnerHTML={{ __html: svg }} />

              {/* Overlay: trail del láser (paths ya cortados) */}
              {isSimulating && simProgress > 0 && laserPos && (
                <svg
                  className="absolute top-0 left-0 pointer-events-none"
                  width="600"
                  height="1000"
                  style={{ overflow: 'visible' }}
                >
                  {/* Trail brillante de lo ya cortado */}
                  {parsedPaths.segments.slice(0, tracedPaths).map((seg, i) => (
                    <polyline
                      key={i}
                      points={seg.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="1"
                      opacity="0.8"
                    />
                  ))}
                </svg>
              )}

              {/* Punto del láser */}
              {isSimulating && laserPos && (
                <div
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: laserPos.x,
                    top: laserPos.y,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div className="relative">
                    <div className="absolute -inset-3 rounded-full bg-red-500/40 animate-ping" />
                    <div className="absolute -inset-1.5 rounded-full bg-red-500" />
                    <div className="absolute -inset-0.5 rounded-full bg-white" />
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar de simulación */}
            {isSimulating && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-amber-500 transition-all"
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
      <div className="flex h-6 items-center justify-between border-t bg-background px-2 sm:px-3 text-[9px] sm:text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
          <span className="flex items-center gap-1 flex-shrink-0">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> corte
          </span>
          <span className="flex items-center gap-1 flex-shrink-0 hidden sm:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-black" /> grabado
          </span>
          <span className="flex items-center gap-1 flex-shrink-0 hidden sm:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> línea
          </span>
        </div>
        <span className="flex-shrink-0 hidden sm:inline">1:{(1 / zoom).toFixed(2)}</span>
      </div>
    </div>
  )
}
