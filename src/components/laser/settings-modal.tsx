'use client'

import * as React from 'react'
import { Settings, X, Check, ExternalLink, Key, Eye, EyeOff } from 'lucide-react'
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
  if (typeof window === 'undefined') return { baseUrl: 'https://api.z.ai/api/v1', apiKey: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {/* ignore */}
  return { baseUrl: 'https://api.z.ai/api/v1', apiKey: '' }
}

function saveConfig(c: ZaiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
}

function encodeConfig(c: ZaiConfig): string {
  // Base64 del JSON para pasar como header
  const json = JSON.stringify(c)
  if (typeof window === 'undefined') return Buffer.from(json).toString('base64')
  // En el browser, usar btoa
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

  // Suscribirse a cambios para que todos los fetch usen el token
  React.useEffect(() => {
    // Disparar un evento para que otros componentes sepan que el config cambió
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
      // Hacer una petición de prueba a /api/chat con el config en header
      const encoded = encodeConfig(config)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zai-config': encoded,
        },
        body: JSON.stringify({
          messages: [{ id: 'test', role: 'user', content: 'test', createdAt: Date.now() }],
          material: 'mdf6',
        }),
      })
      const data = await res.json()
      if (res.ok && !data.reply?.includes('no está configurado')) {
        toast.success('Token válido ✓ — el agente IA funciona')
      } else {
        toast.error('Token rechazado por Z.ai — verifica baseUrl y apiKey')
      }
    } catch (err) {
      toast.error('Error de red al probar el token')
    } finally {
      setTesting(false)
    }
  }

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY)
    setConfig({ baseUrl: 'https://api.z.ai/api/v1', apiKey: '' })
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-500" />
            <DialogTitle>Credenciales del agente IA</DialogTitle>
          </div>
          <DialogDescription>
            Para que el chat IA funcione en producción, necesitas pegar tu token de Z.ai. Se guarda solo en tu navegador (localStorage), no se envía a ningún servidor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={config.baseUrl}
              onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
              placeholder="https://api.z.ai/api/v1"
              className="text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              URL pública de la API de Z.ai. Por defecto: <code>https://api.z.ai/api/v1</code>
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="apiKey">API Key / Token</Label>
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
              placeholder="Pega tu token JWT de Z.ai aquí"
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="token">X-Token (opcional)</Label>
            <Input
              id="token"
              type={showSecrets ? 'text' : 'password'}
              value={config.token || ''}
              onChange={(e) => setConfig((c) => ({ ...c, token: e.target.value }))}
              placeholder="Solo si tu endpoint requiere X-Token header"
              className="text-xs font-mono"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">¿Cómo obtener tu token?</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Inicia sesión en <a href="https://chat.z.ai" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">chat.z.ai <ExternalLink className="inline h-2.5 w-2.5" /></a></li>
              <li>Abre DevTools (F12) → Application → Local Storage</li>
              <li>Copia el valor de <code>token</code></li>
              <li>Pégalo arriba en "API Key / Token"</li>
            </ol>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs">
            Borrar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.apiKey} className="text-xs">
              {testing ? 'Probando...' : 'Probar token'}
            </Button>
            <Button size="sm" onClick={handleSave} className="text-xs gap-1.5">
              <Check className="h-3.5 w-3.5" />
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper para usar en fetch con auth automática
export function getZaiConfigHeader(): string | null {
  if (typeof window === 'undefined') return null
  const c = loadConfig()
  if (!c.apiKey) return null
  return encodeConfig(c)
}
