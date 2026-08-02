'use client'

import * as React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment, Html } from '@react-three/drei'
import { Box, Eye, EyeOff, RotateCw, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLaserStore } from '@/store/laser-store'
import { buildPlacements } from '@/lib/laser/assembly'
import type { Placement } from '@/types/laser'
import { MATERIALS } from '@/types/laser'

// Convierte mm a unidades de three.js (1 unidad = 10mm para mejor escala visual)
const MM = 0.1

function Piece({ placement }: { placement: Placement }) {
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
          color={hovered ? '#fbbf24' : placement.color}
          roughness={0.6}
          metalness={0.15}
        />
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

function AssemblyGroup({ placements }: { placements: Placement[] }) {
  return (
    <group>
      {placements.map((p) => (
        <Piece key={p.id} placement={p} />
      ))}
    </group>
  )
}

export function Preview3D() {
  const { svg, dimensions, settings, show3D, exploded, autoRotate, toggle3D, toggleExploded, toggleAutoRotate } =
    useLaserStore()
  const [placements, setPlacements] = React.useState<Placement[]>([])

  React.useEffect(() => {
    if (!svg || !dimensions) {
      setPlacements([])
      return
    }
    // Construir placements desde el SVG parseando los data-role
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(svg, 'image/svg+xml')
      const groups = Array.from(doc.querySelectorAll('g[data-role]'))
      const parts = groups.map((g, i) => {
        const role = (g.getAttribute('data-role') || 'plate') as Placement['role']
        const label = g.getAttribute('data-label') || role
        const w = parseFloat(g.getAttribute('data-w') || '0')
        const h = parseFloat(g.getAttribute('data-h') || '0')
        return {
          id: `${role}-${i}`,
          label,
          role,
          svg: '',
          x: 0,
          y: 0,
          width: w || 50,
          height: h || 50,
        }
      })
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
      <div className="flex h-10 items-center justify-between border-b bg-background/80 backdrop-blur px-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Box className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium">Vista 3D</span>
          {dimensions && (
            <span className="text-muted-foreground">
              · {dimensions.width}×{dimensions.height}×{dimensions.depth}mm
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={toggleExploded}
            title="Vista despiezada"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{exploded ? 'Armado' : 'Despiezado'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
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
            <ambientLight intensity={0.8} />
            <directionalLight position={[10, 15, 10]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-8, -5, -8]} intensity={0.5} />
            <AssemblyGroup placements={placements} />
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
                Genera una plantilla y verás aquí el ensamblaje 3D con todas las piezas posicionadas.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
