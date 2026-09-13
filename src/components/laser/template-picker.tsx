'use client'

import * as React from 'react'
import { LayoutGrid, Box, Archive, Library, Columns, Key, Award, Signpost, Image, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useLaserStore } from '@/store/laser-store'
import { TEMPLATES } from '@/lib/laser/templates'
import { MATERIALS } from '@/types/laser'
import { toast } from 'sonner'

// Mapeo de nombres de iconos a componentes
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Box,
  Archive,
  Library,
  Columns,
  Key,
  Award,
  Signpost,
  Image,
}

export function TemplatePicker() {
  const [open, setOpen] = React.useState(false)
  const { setSvg, setLastGeneration, settings } = useLaserStore()
  const [loading, setLoading] = React.useState<string | null>(null)

  const handlePick = async (templateId: string) => {
    setLoading(templateId)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          params: {}, // usa defaults
          material: settings.material,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSvg(data.svg, data.dimensions, data.partCount)
        setLastGeneration(templateId, data.params || {})
        toast.success(`Plantilla generada: ${data.partCount} partes`)
        setOpen(false)
      } else {
        toast.error('Error: ' + (data.error || 'desconocido'))
      }
    } catch (err) {
      toast.error('Error de red al generar la plantilla')
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" title="Elegir plantilla">
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Plantillas</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Biblioteca de plantillas</DialogTitle>
          <DialogDescription>
            Elige una plantilla para generarla directamente sin pasar por el chat IA.
            Después podrás personalizar los parámetros en el panel inferior.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2 max-h-[400px] overflow-y-auto">
          {TEMPLATES.map((t) => {
            const Icon = ICONS[t.icon] || Box
            const isLoading = loading === t.id
            return (
              <button
                key={t.id}
                onClick={() => handlePick(t.id)}
                disabled={!!loading}
                className="group flex flex-col items-start gap-1 rounded-md border bg-card p-3 text-left transition hover:border-amber-500 hover:bg-amber-50/50 disabled:opacity-50 dark:hover:bg-amber-950/20"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-amber-500/10 to-red-500/10 text-amber-600 group-hover:from-amber-500 group-hover:to-red-600 group-hover:text-white transition">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs font-medium">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                    {t.description}
                  </p>
                </div>
                <Badge variant="outline" className="mt-1 text-[9px]">
                  {t.params.length} parámetros
                </Badge>
                {isLoading && (
                  <span className="absolute right-2 top-2 text-[10px] text-amber-500">
                    generando…
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
          💡 <strong>Consejo:</strong> Si el chat IA no responde, puedes generar cualquier plantilla desde aquí y después personalizar parámetros en el panel de personalización (esquina inferior izquierda).
        </div>
      </DialogContent>
    </Dialog>
  )
}
