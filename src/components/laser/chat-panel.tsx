'use client'

import * as React from 'react'
import { Send, Sparkles, AlertCircle, CheckCircle2, Loader2, Eraser, Search, Brain, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useLaserStore } from '@/store/laser-store'
import { CustomizePanel } from './customize-panel'
import type { ChatMessage, ChatApiResponse } from '@/types/laser'
import { toast } from 'sonner'

const DEFAULT_SUGGESTIONS = [
  'Caja 100×80×60mm con finger joints',
  'Cajón 120×50×100mm con tirador',
  'Llavero con texto "LaserCraft"',
  'Estante 200×250×80mm con 3 repisas',
  'Placa "Premio Excelencia 2025"',
  'Letrero "BIENVENIDO" 200×80mm',
  'Exhibidor escalonado 3 niveles',
]

interface LearnState {
  recentInteractions: { userMessage: string; templateId: string | null }[]
  detectedPreferences: Record<string, string>
  smartSuggestions: string[]
  learningEnabled: boolean
}

export function ChatPanel() {
  const { messages, isAiThinking, addMessage, setThinking, setSvg, setLastGeneration, setLoopHistory, settings, clearChat } =
    useLaserStore()
  const [input, setInput] = React.useState('')
  const [isResearching, setIsResearching] = React.useState(false)
  const [learn, setLearn] = React.useState<LearnState | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Cargar estado de aprendizaje al montar
  React.useEffect(() => {
    fetch('/api/learn')
      .then((r) => r.json())
      .then((data) => setLearn(data))
      .catch(() => {/* sin BD local, no es crítico */})
  }, [messages.length])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isAiThinking])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isAiThinking) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      createdAt: Date.now(),
    }
    addMessage(userMsg)
    setInput('')
    setThinking(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          material: settings.material,
        }),
      })
      const data: ChatApiResponse = await res.json()

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        createdAt: Date.now(),
        templateId: data.templateId,
        params: data.params,
        loopHistory: data.loopHistory,
      }
      addMessage(aiMsg)

      if (data.action === 'template' && data.svg) {
        setSvg(data.svg, data.dimensions, data.partCount)
        if (data.templateId && data.params) {
          setLastGeneration(data.templateId, data.params)
        }
        if (data.loopHistory) setLoopHistory(data.loopHistory)
        toast.success(`Plantilla generada: ${data.partCount} partes`)
      }
    } catch (err) {
      console.error('Chat error:', err)
      addMessage({
        id: `a-err-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ Ocurrió un error de red. Intenta de nuevo.',
        createdAt: Date.now(),
      })
      toast.error('Error al contactar al agente IA')
    } finally {
      setThinking(false)
    }
  }

  // ===== Investigación manual =====
  const research = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || isResearching) return

    setIsResearching(true)
    addMessage({
      id: `r-start-${Date.now()}`,
      role: 'assistant',
      content: `🔍 Investigando en la web: "${lastUser.content}"...`,
      createdAt: Date.now(),
    })

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lastUser.content }),
      })
      const data = await res.json()

      let researchText = `🔍 Investigación completada.\n\n`
      researchText += `📊 Resumen: ${data.summary}\n\n`
      if (data.sources && data.sources.length > 0) {
        researchText += `🔗 Fuentes encontradas:\n`
        for (const s of data.sources.slice(0, 3)) {
          researchText += `• ${s.title || s.url}\n`
        }
      }
      if (data.templateFound && data.proposedTemplate) {
        researchText += `\n💡 Propuesta de plantilla: "${data.proposedTemplate.name}"\n${data.proposedTemplate.description}\nParámetros: ${data.proposedTemplate.paramsHint}`
      } else {
        researchText += `\n⚠️ No encontré una plantilla similar. Prueba con una variación.`
      }

      addMessage({
        id: `r-${Date.now()}`,
        role: 'assistant',
        content: researchText,
        createdAt: Date.now(),
      })
      toast.success('Investigación completada')
    } catch (err) {
      console.error('Research error:', err)
      toast.error('Error en la investigación')
    } finally {
      setIsResearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // Sugerencias dinámicas: usar las del sistema de aprendizaje si hay, si no, las default
  const suggestions = learn?.smartSuggestions?.length ? learn.smartSuggestions : DEFAULT_SUGGESTIONS
  const showSmart = learn && learn.learningEnabled && Object.keys(learn.detectedPreferences).length > 0

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header del chat */}
      <div className="flex h-9 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium">Asistente IA</span>
          {learn?.learningEnabled && (
            <Badge variant="outline" className="ml-1 h-4 gap-0.5 text-[9px]">
              <Brain className="h-2.5 w-2.5" /> aprendiendo
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={clearChat}>
          <Eraser className="h-3 w-3" />
          Limpiar
        </Button>
      </div>

      {/* Mensajes */}
      <ScrollArea className="flex-1" ref={scrollRef as any}>
        <div className="space-y-3 p-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isAiThinking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>El agente está pensando…</span>
            </div>
          )}
          {isResearching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5 animate-pulse" />
              <span>Investigando en la web…</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Panel de preferencias detectadas */}
      {showSmart && (
        <div className="border-t bg-amber-50/50 dark:bg-amber-950/20 p-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <TrendingUp className="h-3 w-3" />
            Preferencias detectadas
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(learn!.detectedPreferences).slice(0, 5).map(([k, v]) => (
              <span key={k} className="rounded border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 text-[10px]">
                {k}: <strong>{v}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sugerencias */}
      {messages.length <= 1 && (
        <div className="border-t p-2">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {learn?.smartSuggestions?.length ? 'Sugerencias inteligentes' : 'Sugerencias'}
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={isAiThinking}
                className="rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] transition hover:bg-muted disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input + botón investigar */}
      <div className="border-t p-2">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe tu proyecto… (Enter para enviar)"
            disabled={isAiThinking}
            className="min-h-[44px] resize-none text-sm"
            rows={2}
          />
          <div className="flex flex-col gap-1">
            <Button
              onClick={() => send()}
              disabled={!input.trim() || isAiThinking}
              size="icon"
              className="h-auto self-stretch"
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button
              onClick={research}
              disabled={isResearching || isAiThinking || messages.length === 0}
              variant="outline"
              size="icon"
              className="h-auto self-stretch"
              title="Investigar en la web"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Customize panel */}
      <CustomizePanel />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isResearch = message.content.startsWith('🔍')
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-xs ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : isResearch
            ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
            : 'bg-muted'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.loopHistory && message.loopHistory.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-border/30 pt-1.5">
            <p className="text-[10px] uppercase tracking-wide opacity-70">Loop de validación</p>
            {message.loopHistory.map((l) => (
              <div key={l.attempt} className="flex items-center gap-1.5 text-[10px]">
                {l.valid ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                )}
                <span>
                  Intento {l.attempt}: {l.valid ? 'válido' : l.errors.join(', ') || 'inválido'}
                </span>
              </div>
            ))}
          </div>
        )}
        {message.templateId && (
          <Badge variant="secondary" className="mt-1.5 text-[10px]">
            {message.templateId}
          </Badge>
        )}
      </div>
    </div>
  )
}
