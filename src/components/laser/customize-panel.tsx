'use client'

import * as React from 'react'
import { SlidersHorizontal, RotateCcw, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useLaserStore } from '@/store/laser-store'
import { TEMPLATES, getTemplate } from '@/lib/laser/templates'
import { toast } from 'sonner'
import type { TemplateParam } from '@/types/laser'

export function CustomizePanel() {
  const { lastTemplateId, lastParams, showCustomize, settings } = useLaserStore()
  const [localParams, setLocalParams] = React.useState<Record<string, number | string>>({})

  React.useEffect(() => {
    if (lastParams) setLocalParams(lastParams)
  }, [lastParams])

  const template = lastTemplateId ? getTemplate(lastTemplateId) : null

  if (!showCustomize || !template) return null

  const updateParam = (id: string, value: number | string) => {
    setLocalParams((p) => ({ ...p, [id]: value }))
  }

  const regenerate = async () => {
    if (!lastTemplateId) return
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: lastTemplateId,
          params: localParams,
          material: settings.material,
        }),
      })
      const data = await res.json()
      if (data.success) {
        useLaserStore.getState().setSvg(data.svg, data.dimensions, data.partCount)
        useLaserStore.getState().setLastGeneration(lastTemplateId, localParams)
        toast.success('Plantilla regenerada ✓')
      } else {
        toast.error('Error al regenerar: ' + (data.error || 'desconocido'))
      }
    } catch {
      toast.error('Error de red')
    }
  }

  const reset = () => {
    const defaults: Record<string, number | string> = {}
    for (const p of template.params) defaults[p.id] = p.default
    setLocalParams(defaults)
    toast.info('Parámetros restaurados a defaults')
  }

  return (
    <div className="border-t bg-background">
      <div className="flex h-9 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="font-medium">Personalizar</span>
          <span className="text-muted-foreground">· {template.name}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={reset}>
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      <ScrollArea className="max-h-[260px]">
        <div className="space-y-3 p-3">
          {template.params.map((param) => (
            <ParamControl
              key={param.id}
              param={param}
              value={localParams[param.id] ?? param.default}
              onChange={(v) => updateParam(param.id, v)}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-2">
        <Button size="sm" className="w-full gap-1.5" onClick={regenerate}>
          <Wand2 className="h-3.5 w-3.5" />
          Regenerar plantilla
        </Button>
      </div>
    </div>
  )
}

function ParamControl({
  param,
  value,
  onChange,
}: {
  param: TemplateParam
  value: number | string
  onChange: (v: number | string) => void
}) {
  if (param.type === 'select') {
    return (
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{param.label}</Label>
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {param.options?.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (param.type === 'text') {
    return (
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{param.label}</Label>
        <Textarea
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[40px] text-xs"
          placeholder={param.label}
        />
      </div>
    )
  }

  // number → slider + input
  const num = typeof value === 'number' ? value : parseFloat(value) || param.default
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">
          {param.label}
          {param.unit && <span className="ml-1 text-[10px] opacity-70">({param.unit})</span>}
        </Label>
        <Input
          type="number"
          value={num}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-6 w-16 text-xs"
        />
      </div>
      {param.min !== undefined && param.max !== undefined && (
        <Slider
          value={[num]}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onValueChange={(v) => onChange(v[0])}
          className="mt-1"
        />
      )}
    </div>
  )
}
