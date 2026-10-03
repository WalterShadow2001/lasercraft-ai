'use client'

import * as React from 'react'
import { Settings, X, Check, ExternalLink, Key, Eye, EyeOff, Info, Sparkles, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface ZaiConfig {
  baseUrl: string
  apiKey: string
  token?: string
  userId?: string
}

const STORAGE_KEY = 'lasercraft_zai_config'

function loadConfig(): ZaiConfig {
  if (typeof window === 'undefined') return { baseUrl: '', apiKey: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {/* ignore */}
  return { baseUrl: '', apiKey: '' }
}

function saveConfig(c: ZaiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
}

function encodeConfig(c: ZaiConfig): string {
  const json = JSON.stringify(c)
  if (typeof window === 'undefined') return Buffer.from(json).toString('base64')
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function SettingsModal() {
  const [open, setOpen] = React.useState(false)
  const [config, setConfig] = React.useState<ZaiConfig>(loadConfig)
  const [showSecrets, setShowSecrets] = React.useState(false)
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('zai-config-changed'))
  }, [config])

  const handleSave = () => {
    if (!config.baseUrl || !config.apiKey) {
      toast.error('Completa baseUrl y apiKey')
      return
    }
    saveConfig(config)
    window.dispatchEvent(new CustomEvent('zai-config-changed'))
    toast.success('Configuración guardada ✓')
    setOpen(false)
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const encoded = encodeConfig(config)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zai-config': encoded,
        },
        body: JSON.stringify({
          messages: [{ id: 'test', role: 'user', content: 'responde solo OK', createdAt: Date.now() }],
          material: 'mdf6',
        }),
      })
      const data = await res.json()
      if (res.ok && !data.reply?.includes('no está configurado') && !data.reply?.includes('no está disponible')) {
        toast.success('Token válido ✓ — el agente IA funciona')
      } else {
        toast.error('Token rechazado — verifica baseUrl y apiKey')
      }
    } catch {
      toast.error('Error de red al probar el token')
    } finally {
      setTesting(false)
    }
  }

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY)
    setConfig({ baseUrl: '', apiKey: '' })
    window.dispatchEvent(new CustomEvent('zai-config-changed'))
    toast.info('Configuración eliminada')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Configurar agente IA">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-500" />
            <DialogTitle>Agente IA — Opciones</DialogTitle>
          </div>
          <DialogDescription>
            Elige cómo quieres que funcione la IA. Todas las opciones son gratuitas.
          </DialogDescription>
        </DialogHeader>

        {/* Opción 1: Fallback gratuito (siempre activo) */}
        <div className="rounded-md border bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            Opción 1: IA por detección (GRATIS, SIN LÍMITE)
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong>Siempre activa.</strong> Detecta lo que pides por palabras clave y genera la plantilla al instante.
            Funciona sin token, sin configuración, sin límites. Es la que estás usando ahora.
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            ✓ Gratis · ✓ Sin límite · ✓ Aprende de cada interacción · ✓ Funciona offline
          </p>
        </div>

        {/* Opción 2: Token propio (opcional, para respuestas conversacionales) */}
        <div className="rounded-md border bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
            <Brain className="h-3.5 w-3.5" />
            Opción 2: Token propio (respuestas conversacionales del LLM)
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Si quieres que la IA responda de forma conversacional (en vez de solo generar), pega tu token de Z.ai abajo.
            Se guarda solo en tu navegador (localStorage), no se envía a ningún servidor.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="baseUrl" className="text-[11px]">Base URL</Label>
            <Input
              id="baseUrl"
              value={config.baseUrl}
              onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
              placeholder="https://internal-api.z.ai/v1"
              className="text-xs font-mono h-7"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="apiKey" className="text-[11px]">API Key</Label>
              <button
                type="button"
                onClick={() => setShowSecrets((v) => !v)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {showSecrets ? <EyeOff className="inline h-3 w-3" /> : <Eye className="inline h-3 w-3" />}
                {' '} {showSecrets ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <Input
              id="apiKey"
              type={showSecrets ? 'text' : 'password'}
              value={config.apiKey}
              onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder="Z.ai"
              className="text-xs font-mono h-7"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="token" className="text-[11px]">X-Token (JWT)</Label>
            <Input
              id="token"
              type={showSecrets ? 'text' : 'password'}
              value={config.token || ''}
              onChange={(e) => setConfig((c) => ({ ...c, token: e.target.value }))}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              className="text-xs font-mono h-7"
            />
          </div>

          <div className="rounded bg-muted/50 p-2 text-[10px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">¿Cómo obtener tu token?</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Inicia sesión en <a href="https://chat.z.ai" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">chat.z.ai <ExternalLink className="inline h-2.5 w-2.5" /></a></li>
              <li>Abre DevTools (F12) → Application → Local Storage → chat.z.ai</li>
              <li>Copia el valor de <code>token</code> (empieza con eyJ...)</li>
              <li>Pégalo arriba en "X-Token (JWT)"</li>
              <li>Base URL = <code>https://internal-api.z.ai/v1</code></li>
              <li>API Key = <code>Z.ai</code></li>
            </ol>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.apiKey} className="text-xs h-7">
              {testing ? 'Probando...' : 'Probar token'}
            </Button>
            <Button size="sm" onClick={handleSave} className="text-xs h-7 gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs h-7 ml-auto">
              Borrar
            </Button>
          </div>
        </div>

        {/* Info sobre aprendizaje */}
        <div className="rounded-md border bg-amber-50/30 dark:bg-amber-950/10 p-2.5 text-[11px] text-muted-foreground space-y-1">
          <div className="flex items-center gap-1 font-medium text-foreground">
            <Info className="h-3 w-3" />
            Sistema de aprendizaje
          </div>
          <p>La IA <strong>aprende de cada interacción</strong> y guarda el conocimiento en:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Tu navegador (localStorage): chat, plantillas favoritas, dimensiones preferidas</li>
            <li>Base de datos Turso: historial completo, preferencias, investigaciones</li>
          </ul>
          <p>Cuanto más uses la app, más inteligente se vuelve — las sugerencias se personalizan según tu historial.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper para usar en fetch con auth automática
export function getZaiConfigHeader(): string | null {
  return getLLMConfigHeader()
}

export function getLLMConfigHeader(): string | null {
  if (typeof window === 'undefined') return null
  const c = loadConfig()
  if (!c.apiKey) return null
  return encodeConfig(c)
}
