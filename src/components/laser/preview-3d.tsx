'use client'

import * as React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment, Html, Edges, useTexture } from '@react-three/drei'
import { Box, Eye, EyeOff, RotateCw, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLaserStore } from '@/store/laser-store'
import { buildPlacements } from '@/lib/laser/assembly'
import type { Placement, TemplatePart } from '@/types/laser'
import { MATERIALS } from '@/types/laser'

const MM = 0.1

// ===== Genera una textura SVG por pieza con su path real =====
// Esto permite ver los finger joints REALES en el 3D, no solo cajas abstractas.

function svgPartToTextureSvg(part: TemplatePart, material: typeof MATERIALS[keyof typeof MATERIALS]): string {
  // Render del SVG de la pieza escalado a su bounding box
  const w = part.width
  const h = part.height
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${material.color}" stroke="${material.cutColor}" stroke-width="0.3" />
    ${part.svg}
  </svg>`
}

function svgToDataUrl(svg: string): string {
  // unicode-safe base64
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

// ===== Pieza con textura SVG real =====

function Piece({ placement, partSvg, material }: { placement: Placement; partSvg?: string; material: typeof MATERIALS[keyof typeof MATERIALS] }) {
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

  // Generar textura SVG si hay paths de la pieza
  const textureUrl = React.useMemo(() => {
    if (!partSvg) return null
    try {
      // Construir un SVG válido con los paths de la pieza
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${placement.width} ${placement.height}" width="${placement.width}" height="${placement.height}">
        <rect x="0" y="0" width="${placement.width}" height="${placement.height}" fill="${material.color}" opacity="0.9"/>
        ${partSvg}
      </svg>`
      return svgToDataUrl(svgStr)
    } catch {
      return null
    }
  }, [partSvg, placement.width, placement.height, material.color])

  const texture = useTexture(textureUrl || '/logo.svg')

  // Propiedades de material realistas por tipo
  const matProps = React.useMemo(() => {
    const isAcrylic = material.id.includes('acrylic')
    return {
      roughness: isAcrylic ? 0.15 : 0.75,
      metalness: isAcrylic ? 0 : 0.1,
      transparent: isAcrylic,
      opacity: isAcrylic ? 0.85 : 1,
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
        <Edges threshold={15} color="#000000" />
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
    <group>
      {placements.map((p) => (
        <Piece
          key={p.id}
          placement={p}
          partSvg={partsByRole.get(p.role)?.svg}
          material={material}
        />
      ))}
    </group>
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
        // Extraer el SVG interno (los paths) de este grupo
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
      // Mapa role → part (primer match)
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
        {placements.length > 0 ? (
          <Canvas shadows camera={{ position: [12, 9, 15], fov: 45 }} dpr={[1, 2]}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 15, 10]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-8, -5, -8]} intensity={0.5} />
            <AssemblyGroup placements={placements} partsByRole={partsByRole} material={material} />
            <OrbitControls enablePan={false} autoRotate={autoRotate} autoRotateSpeed={1.5} minDistance={5} maxDistance={40} />
            <ContactShadows position={[0, -((dimensions?.height ?? 80) * MM) / 2 - 0.05, 0]} opacity={0.4} blur={2.5} far={8} />
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
