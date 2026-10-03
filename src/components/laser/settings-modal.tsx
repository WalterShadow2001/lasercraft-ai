'use client'

import * as React from 'react'
import { Settings, X, Check, ExternalLink, Key, Eye, EyeOff, Info, Sparkles, Brain, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface LLMConfig {
  provider: 'groq' | 'zai' | 'none'
  apiKey: string
  baseUrl?: string
  token?: string
}

const STORAGE_KEY = 'lasercraft_llm_config'

function loadConfig(): LLMConfig {
  if (typeof window === 'undefined') return { provider: 'none', apiKey: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    // Migrar de key antigua
    const oldRaw = localStorage.getItem('lasercraft_zai_config')
    if (oldRaw) {
      const old = JSON.parse(oldRaw)
      return { provider: 'zai', apiKey: old.apiKey, baseUrl: old.baseUrl, token: old.token }
    }
  } catch {/* ignore */}
  return { provider: 'none', apiKey: '' }
}

function saveConfig(c: LLMConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
}

function encodeConfig(c: LLMConfig): string {
  const json = JSON.stringify(c)
  if (typeof window === 'undefined') return Buffer.from(json).toString('base64')
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function SettingsModal() {
  const [open, setOpen] = React.useState(false)
  const [config, setConfig] = React.useState<LLMConfig>(loadConfig)
  const [showSecrets, setShowSecrets] = React.useState(false)
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('llm-config-changed'))
  }, [config])

  const handleSave = () => {
    if (config.provider !== 'none' && !config.apiKey) {
      toast.error('Completa el API key')
      return
    }
    saveConfig(config)
    window.dispatchEvent(new CustomEvent('llm-config-changed'))
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
          'x-llm-config': encoded,
        },
        body: JSON.stringify({
          messages: [{ id: 'test', role: 'user', content: 'test', createdAt: Date.now() }],
          material: 'mdf6',
        }),
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        toast.success('API key válido ✓ — el LLM funciona')
      } else {
        toast.error('API key rechazado — verifica el valor')
      }
    } catch {
      toast.error('Error de red al probar')
    } finally {
      setTesting(false)
    }
  }

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('lasercraft_zai_config')
    setConfig({ provider: 'none', apiKey: '' })
    window.dispatchEvent(new CustomEvent('llm-config-changed'))
    toast.info('Configuración eliminada — usando detección por keywords')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Configurar agente IA">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-500" />
            <DialogTitle>Agente IA — Configuración</DialogTitle>
          </div>
          <DialogDescription>
            Elige cómo funciona la IA. Todas las opciones son gratuitas.
          </DialogDescription>
        </DialogHeader>

        {/* Opción 1: Detección por keywords (gratis, siempre activa) */}
        <div className="rounded-md border bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            Opción 1: Detección inteligente (GRATIS, SIN LÍMITE)
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong>Siempre activa.</strong> Detecta lo que pides por palabras clave y genera la plantilla al instante.
            Responde en menos de 100ms. Funciona sin configuración.
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            ✓ Gratis · ✓ Sin límite · ✓ Aprende · ✓ Instantáneo · ✓ Funciona offline
          </p>
        </div>

        {/* Opción 2: Groq (RECOMENDADO para producción) */}
        <div className="rounded-md border bg-purple-50/50 dark:bg-purple-950/20 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400">
            <Zap className="h-3.5 w-3.5" />
            Opción 2: Groq API (RECOMENDADO — gratis, rápido, con visión)
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Groq es una API pública gratuita que funciona desde Vercel. Usa Llama 3.3 70B (texto) y Llama 3.2 90B Vision (imágenes).
            Te permite subir fotos y tener respuestas conversacionales reales.
          </p>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Groq API Key</Label>
            <div className="flex gap-1">
              <Input
                type={showSecrets ? 'text' : 'password'}
                value={config.provider === 'groq' ? config.apiKey : ''}
                onChange={(e) => setConfig((c) => ({ ...c, provider: 'groq', apiKey: e.target.value }))}
                placeholder="gsk_..."
                className="text-xs font-mono h-7 flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowSecrets((v) => !v)}
              >
                {showSecrets ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <div className="rounded bg-muted/50 p-2 text-[10px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">¿Cómo obtener tu API key de Groq?</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Ve a <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-purple-500 hover:underline inline-flex items-center gap-0.5">console.groq.com <ExternalLink className="inline h-2.5 w-2.5" /></a></li>
              <li>Regístrate con Google o GitHub (gratis, sin tarjeta de crédito)</li>
              <li>Ve a "API Keys" → "Create API Key"</li>
              <li>Copia la key (empieza con <code>gsk_</code>)</li>
              <li>Pégala arriba</li>
            </ol>
          </div>

          <p className="text-[11px] text-purple-700 dark:text-purple-400">
            ✓ Gratis (tier generoso) · ✓ Funciona en Vercel · ✓ Soporta fotos · ✓ Llama 3.3 70B · ✓ Muy rápido
          </p>
        </div>

        {/* Opción 3: Z.ai (solo desarrollo local) */}
        <details className="rounded-md border bg-blue-50/30 dark:bg-blue-950/10 p-3">
          <summary className="text-xs font-medium text-blue-700 dark:text-blue-400 cursor-pointer flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Opción 3: Z.ai token (solo desarrollo local)
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Z.ai solo funciona en el sandbox de desarrollo. NO funciona en Vercel (IPs privadas).
              Úsalo solo si estás desarrollando localmente.
            </p>
            <div className="space-y-1.5">
              <Label className="text-[11px]">Base URL</Label>
              <Input
                value={config.provider === 'zai' ? (config.baseUrl || '') : ''}
                onChange={(e) => setConfig((c) => ({ ...c, provider: 'zai', baseUrl: e.target.value }))}
                placeholder="https://internal-api.z.ai/v1"
                className="text-xs font-mono h-7"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">API Key</Label>
              <Input
                type={showSecrets ? 'text' : 'password'}
                value={config.provider === 'zai' ? config.apiKey : ''}
                onChange={(e) => setConfig((c) => ({ ...c, provider: 'zai', apiKey: e.target.value }))}
                placeholder="Z.ai"
                className="text-xs font-mono h-7"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">X-Token (JWT)</Label>
              <Input
                type={showSecrets ? 'text' : 'password'}
                value={config.provider === 'zai' ? (config.token || '') : ''}
                onChange={(e) => setConfig((c) => ({ ...c, provider: 'zai', token: e.target.value }))}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="text-xs font-mono h-7"
              />
            </div>
          </div>
        </details>

        {/* Botones */}
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.apiKey} className="text-xs h-7">
            {testing ? 'Probando...' : 'Probar API key'}
          </Button>
          <Button size="sm" onClick={handleSave} className="text-xs h-7 gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs h-7 ml-auto">
            Borrar
          </Button>
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
          <p>Cuanto más uses la app, más inteligente se vuelve.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper para usar en fetch con auth automática
export function getLLMConfigHeader(): string | null {
  if (typeof window === 'undefined') return null
  const c = loadConfig()
  if (c.provider === 'none' || !c.apiKey) return null
  return encodeConfig(c)
}

// Compat alias
export function getZaiConfigHeader(): string | null {
  return getLLMConfigHeader()
}
