'use client'

import * as React from 'react'
import { Box, Download, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from './theme-toggle'
import { useLaserStore } from '@/store/laser-store'
import { MATERIALS } from '@/types/laser'
import { exportSvg, exportDxf, exportLightBurn, downloadFile } from '@/lib/laser/export'
import type { GenerationResult } from '@/types/laser'
import { toast } from 'sonner'

export function Header() {
  const { svg, dimensions, partCount, settings, updateSettings, lastTemplateId, lastParams } = useLaserStore()

  const handleExport = (format: 'svg' | 'dxf' | 'lbrn2') => {
    if (!svg) {
      toast.error('No hay SVG para exportar. Genera una plantilla primero.')
      return
    }
    const fakeResult: GenerationResult = {
      svg,
      parts: [],
      dimensions: dimensions || { width: 0, height: 0, depth: 0 },
      partCount: partCount || 0,
      materialUsage: { sheetW: 0, sheetH: 0, used: 0 },
    }
    let content = ''
    let mime = ''
    let filename = `lasercraft-${lastTemplateId || 'design'}.${format}`
    if (format === 'svg') {
      content = exportSvg(fakeResult)
      mime = 'image/svg+xml'
    } else if (format === 'dxf') {
      content = exportDxf(fakeResult)
      mime = 'application/dxf'
    } else {
      content = exportLightBurn(fakeResult)
      mime = 'application/xml'
    }
    downloadFile(content, filename, mime)
    toast.success(`Exportado como ${format.toUpperCase()}`)
  }

  const handleSave = async () => {
    if (!svg || !lastTemplateId) {
      toast.error('Nada que guardar todavía.')
      return
    }
    try {
      const res = await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${lastTemplateId}-${new Date().toISOString().slice(0, 10)}`,
          templateId: lastTemplateId,
          params: lastParams || {},
          svg,
          dimensions: dimensions || { width: 0, height: 0, depth: 0 },
          partCount: partCount || 0,
          material: settings.material,
        }),
      })
      if (res.ok) {
        toast.success('Diseño guardado en Turso ✓')
      } else {
        toast.error('No se pudo guardar (¿DB no configurada?)')
      }
    } catch {
      toast.error('Error de red al guardar')
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-red-600">
          <Box className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-none">LaserCraft AI</span>
          <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
            Plantillas paramétricas para láser
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Selector de material */}
        <Select
          value={settings.material}
          onValueChange={(v) => updateSettings({ material: v as keyof typeof MATERIALS })}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Material" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(MATERIALS).map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {dimensions && (
          <div className="hidden md:flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span className="font-mono">
              {dimensions.width}×{dimensions.height}×{dimensions.depth}mm
            </span>
            <span className="text-muted-foreground">·</span>
            <span>{partCount} partes</span>
          </div>
        )}

        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={!svg}>
          <Save className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Guardar</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" className="h-8 gap-1.5" disabled={!svg}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('svg')}>SVG (vectorial)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('dxf')}>DXF (AutoCAD)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('lbrn2')}>LightBurn (.lbrn2)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
      </div>
    </header>
  )
}
