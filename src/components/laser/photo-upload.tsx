'use client'

import * as React from 'react'
import { Image as ImageIcon, X, Upload, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useLaserStore } from '@/store/laser-store'
import { getLLMConfigHeader } from './settings-modal'
import { toast } from 'sonner'

interface VisionResult {
  success: boolean
  detected?: string
  templateId?: string | null
  params?: Record<string, number | string>
  confidence?: number
  description?: string
  error?: string
  suggestion?: string
}

export function PhotoUpload() {
  const [open, setOpen] = React.useState(false)
  const [image, setImage] = React.useState<string | null>(null)
  const [prompt, setPrompt] = React.useState('')
  const [analyzing, setAnalyzing] = React.useState(false)
  const [result, setResult] = React.useState<VisionResult | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { setSvg, setLastGeneration, settings } = useLaserStore()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('La imagen debe ser menor a 4MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImage(ev.target?.result as string)
      setResult(null)
    }
    reader.readAsDataURL(file)
  }

  const handleAnalyze = async () => {
    if (!image) return
    setAnalyzing(true)
    setResult(null)
    try {
      const llmHeader = getLLMConfigHeader()
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(llmHeader ? { 'x-llm-config': llmHeader } : {}),
        },
        body: JSON.stringify({ image, prompt: prompt || undefined }),
      })
      const data: VisionResult = await res.json()
      setResult(data)
      if (data.success && data.templateId) {
        toast.success(`Detectado: ${data.detected} (${(data.confidence || 0) * 100}% confianza)`)
      } else if (data.error) {
        toast.error(data.error)
      }
    } catch (err) {
      console.error('Vision error:', err)
      toast.error('Error al analizar la imagen')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerateFromResult = async () => {
    if (!result?.templateId) return
    try {
      const llmHeader = getLLMConfigHeader()
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(llmHeader ? { 'x-llm-config': llmHeader } : {}),
        },
        body: JSON.stringify({
          templateId: result.templateId,
          params: result.params || {},
          material: settings.material,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSvg(data.svg, data.dimensions, data.partCount)
        setLastGeneration(result.templateId!, data.params || {})
        toast.success(`Plantilla generada: ${data.partCount} partes`)
        setOpen(false)
        setImage(null)
        setResult(null)
      } else {
        toast.error('Error al generar la plantilla')
      }
    } catch {
      toast.error('Error de red')
    }
  }

  const handleClose = () => {
    setOpen(false)
    setImage(null)
    setResult(null)
    setPrompt('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" title="Subir foto para analizar">
          <ImageIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Foto</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-amber-500" />
            <DialogTitle>Analizar foto con IA</DialogTitle>
          </div>
          <DialogDescription>
            Sube una foto de un objeto y la IA identificará qué plantilla necesitas.
            Requiere API key de Groq configurada en Settings ⚙.
          </DialogDescription>
        </DialogHeader>

        {/* Upload area */}
        {!image && (
          <div
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-amber-500 transition"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Click para subir imagen</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG hasta 4MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Preview + prompt */}
        {image && (
          <div className="space-y-3">
            <div className="relative">
              <img
                src={image}
                alt="Preview"
                className="w-full max-h-64 object-contain rounded-lg border"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={() => { setImage(null); setResult(null) }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Prompt opcional: ej. '¿Qué dimensiones tiene esta caja?'"
              className="min-h-[60px] text-xs"
              rows={2}
            />

            <Button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full gap-2"
              size="sm"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analizando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analizar con IA
                </>
              )}
            </Button>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            {result.success ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Detectado:</span>
                  <span className="text-xs font-bold text-amber-600">{result.detected}</span>
                  {result.confidence !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      ({(result.confidence * 100).toFixed(0)}% confianza)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{result.description}</p>
                {result.templateId && (
                  <div className="space-y-1.5">
                    <div className="text-[11px]">
                      <strong>Plantilla:</strong> {result.templateId}
                    </div>
                    {result.params && Object.keys(result.params).length > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        <strong>Parámetros:</strong> {JSON.stringify(result.params)}
                      </div>
                    )}
                    <Button
                      onClick={handleGenerateFromResult}
                      size="sm"
                      className="w-full gap-1.5 mt-2"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generar plantilla
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-red-600 space-y-1">
                <p>⚠️ {result.error}</p>
                {result.suggestion && (
                  <p className="text-muted-foreground">{result.suggestion}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="rounded-md border bg-blue-50/30 dark:bg-blue-950/10 p-2 text-[10px] text-muted-foreground">
          💡 Para usar esta función necesitas una API key gratuita de Groq:
          <ol className="list-decimal list-inside mt-1 space-y-0.5">
            <li>Regístrate en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">console.groq.com</a> (gratis)</li>
            <li>Crea una API key</li>
            <li>Pégala en Settings ⚙ → opción Groq</li>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  )
}
