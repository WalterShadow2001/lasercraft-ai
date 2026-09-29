'use client'

import * as React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment, Html, Edges, useTexture, Bounds, useBounds } from '@react-three/drei'
import { Box, Eye, EyeOff, RotateCw, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLaserStore } from '@/store/laser-store'
import { buildPlacements } from '@/lib/laser/assembly'
import type { Placement, TemplatePart } from '@/types/laser'
import { MATERIALS } from '@/types/laser'

const MM = 0.1

// ===== Genera una textura SVG por pieza con su path real =====
function svgToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

// ===== Pieza con textura SVG real =====
function Piece({ placement, partSvg, material }: {
  placement: Placement
  partSvg?: string
  material: typeof MATERIALS[keyof typeof MATERIALS]
}) {
  const [hovered, setHovered] = React.useState(false)
  const w = Math.max(placement.width * MM, 0.1)
  const h = Math.max(placement.height * MM, 0.1)
  const d = Math.max(placement.depth * MM, 0.1)
  const pos: [number, number, number] = [
    placement.position[0] * MM,
    placement.position[1] * MM,
    placement.position[2] * MM,
  ]
  const rot: [number, number, number] = placement.rotation

  const textureUrl = React.useMemo(() => {
    if (!partSvg) return null
    try {
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${placement.width} ${placement.height}" width="${placement.width}" height="${placement.height}">
        <rect x="0" y="0" width="${placement.width}" height="${placement.height}" fill="${material.color}" opacity="0.95"/>
        <g stroke="${material.cutColor}" stroke-width="0.8" fill="none">
          ${partSvg}
        </g>
      </svg>`
      return svgToDataUrl(svgStr)
    } catch {
      return null
    }
  }, [partSvg, placement.width, placement.height, material.color, material.cutColor])

  const texture = useTexture(textureUrl || '/logo.svg')

  const matProps = React.useMemo(() => {
    const isAcrylic = material.id.includes('acrylic')
    return {
      roughness: isAcrylic ? 0.1 : 0.65,
      metalness: isAcrylic ? 0 : 0.05,
      transparent: isAcrylic,
      opacity: isAcrylic ? 0.8 : 1,
      clearcoat: isAcrylic ? 1 : 0,
    }
  }, [material.id])

  return (
    <group position={pos} rotation={rot}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={hovered ? '#fbbf24' : '#ffffff'}
          roughness={matProps.roughness}
          metalness={matProps.metalness}
          transparent={matProps.transparent}
          opacity={matProps.opacity}
          map={textureUrl ? texture : undefined}
        />
        <Edges threshold={15} color="#1f2937" />
      </mesh>
      {hovered && (
        <Html distanceFactor={8} position={[0, h / 2 + 0.2, 0]} center>
          <div className="rounded-md bg-background/95 px-2 py-1 text-[10px] font-medium shadow-md border">
            {placement.label}
            <span className="ml-1 text-muted-foreground">
              {placement.width.toFixed(0)}×{placement.height.toFixed(0)}×{placement.depth.toFixed(0)}mm
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

function AssemblyGroup({
  placements,
  partsByRole,
  material,
}: {
  placements: Placement[]
  partsByRole: Map<string, TemplatePart>
  material: typeof MATERIALS[keyof typeof MATERIALS]
}) {
  return (
    <>
      {placements.map((p) => (
        <Piece
          key={p.id}
          placement={p}
          partSvg={partsByRole.get(p.role)?.svg}
          material={material}
        />
      ))}
    </>
  )
}

// Auto-fita el modelo al viewport
function AutoFit({ children }: { children: React.ReactNode }) {
  return (
    <Bounds fit clip observe margin={1.2}>
      {children}
    </Bounds>
  )
}

export function Preview3D() {
  const { svg, dimensions, settings, show3D, exploded, autoRotate, toggle3D, toggleExploded, toggleAutoRotate } =
    useLaserStore()
  const [placements, setPlacements] = React.useState<Placement[]>([])
  const [partsByRole, setPartsByRole] = React.useState<Map<string, TemplatePart>>(new Map())

  React.useEffect(() => {
    if (!svg || !dimensions) {
      setPlacements([])
      setPartsByRole(new Map())
      return
    }
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, 'image/svg+xml')
      const groups = Array.from(doc.querySelectorAll('g[data-role]'))
      const parts: TemplatePart[] = groups.map((g, i) => {
        const role = (g.getAttribute('data-role') || 'plate') as Placement['role']
        const label = g.getAttribute('data-label') || role
        const w = parseFloat(g.getAttribute('data-w') || '0')
        const h = parseFloat(g.getAttribute('data-h') || '0')
        const innerSvg = g.innerHTML
        return {
          id: `${role}-${i}`,
          label,
          role,
          svg: innerSvg,
          x: 0,
          y: 0,
          width: w || 50,
          height: h || 50,
        }
      })
      const byRole = new Map<string, TemplatePart>()
      for (const p of parts) {
        if (!byRole.has(p.role)) byRole.set(p.role, p)
      }
      setPartsByRole(byRole)

      const material = MATERIALS[settings.material]
      const gen = {
        svg,
        parts,
        dimensions,
        partCount: parts.length,
        materialUsage: { sheetW: 0, sheetH: 0, used: 0 },
      }
      const built = buildPlacements(gen, {
        exploded,
        explodeFactor: exploded ? 0.6 : 0,
        thickness: material.thickness,
        material,
      })
      setPlacements(built)
    } catch (e) {
      console.error('Preview3D parse error:', e)
    }
  }, [svg, dimensions, settings.material, exploded])

  const material = MATERIALS[settings.material]

  if (!show3D) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30">
        <Button variant="outline" size="sm" onClick={toggle3D} className="gap-2">
          <Eye className="h-4 w-4" />
          Mostrar vista 3D
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-background to-muted/40">
      {/* Toolbar */}
      <div className="flex h-10 items-center justify-between border-b bg-background/80 backdrop-blur px-2 sm:px-3">
        <div className="flex items-center gap-1.5 text-xs min-w-0 overflow-hidden">
          <Box className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          <span className="font-medium flex-shrink-0">Vista 3D</span>
          {dimensions && (
            <span className="text-muted-foreground truncate text-[10px] sm:text-xs">
              · {dimensions.width}×{dimensions.height}×{dimensions.depth}mm
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs px-2"
            onClick={toggleExploded}
            title="Vista despiezada"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{exploded ? 'Armado' : 'Despiezado'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs px-2"
            onClick={toggleAutoRotate}
            title="Auto-rotación"
          >
            <RotateCw className={`h-3.5 w-3.5 ${autoRotate ? 'animate-spin-slow' : ''}`} />
            <span className="hidden lg:inline">Auto</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggle3D}>
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Canvas 3D */}
      <div className="relative flex-1">
        {placements.length > 0 && dimensions ? (
          <Canvas
            shadows
            camera={{ position: [8, 6, 10], fov: 40 }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
          >
            {/* Iluminación de 3 puntos para aspecto profesional */}
            <ambientLight intensity={0.4} />
            <directionalLight
              position={[10, 15, 10]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-far={50}
              shadow-camera-left={-15}
              shadow-camera-right={15}
              shadow-camera-top={15}
              shadow-camera-bottom={-15}
            />
            <directionalLight position={[-10, 5, -5]} intensity={0.6} color="#ffffff" />
            <directionalLight position={[0, -10, 0]} intensity={0.3} color="#a0a0a0" />

            <AutoFit>
              <AssemblyGroup placements={placements} partsByRole={partsByRole} material={material} />
            </AutoFit>

            <OrbitControls
              enablePan={false}
              autoRotate={autoRotate}
              autoRotateSpeed={1.5}
              minDistance={3}
              maxDistance={40}
              target={[0, 0, 0]}
              enableDamping
              dampingFactor={0.1}
            />
            <ContactShadows
              position={[0, -((dimensions.height ?? 80) * MM) / 2 - 0.05, 0]}
              opacity={0.5}
              blur={2}
              far={10}
              resolution={1024}
            />
            <Environment preset="studio" />
          </Canvas>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Box className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Sin ensamblaje 3D</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Genera una plantilla y verás aquí el ensamblaje 3D literal con los finger joints reales de cada pieza.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer con info del material */}
      <div className="border-t bg-background/80 px-2 sm:px-3 py-1.5 text-[10px] text-muted-foreground truncate">
        Material: <strong className="text-foreground">{material.label}</strong> · grosor {material.thickness}mm
      </div>
    </div>
  )
}
