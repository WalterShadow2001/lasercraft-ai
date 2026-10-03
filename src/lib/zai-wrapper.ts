// Wrapper multi-provider: soporta Groq (gratis, público) y Z.ai
// Groq es la opción recomendada para producción (funciona desde Vercel)
// Z.ai solo funciona en desarrollo local (sandbox)

import fs from 'fs'
import path from 'path'
import os from 'os'

export interface LLMConfig {
  provider: 'groq' | 'zai' | 'none'
  apiKey: string
  baseUrl?: string
  token?: string // X-Token para Z.ai
  userId?: string
  chatId?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ===== Resolver config desde múltiples fuentes =====

async function loadConfigFromEnv(): Promise<LLMConfig | null> {
  // Groq por defecto si hay GROQ_API_KEY
  if (process.env.GROQ_API_KEY) {
    return { provider: 'groq', apiKey: process.env.GROQ_API_KEY }
  }
  // Z.ai si hay ZAI_API_KEY
  if (process.env.ZAI_API_KEY && process.env.ZAI_BASE_URL) {
    return {
      provider: 'zai',
      apiKey: process.env.ZAI_API_KEY,
      baseUrl: process.env.ZAI_BASE_URL,
      token: process.env.ZAI_TOKEN,
      userId: process.env.ZAI_USER_ID,
      chatId: process.env.ZAI_CHAT_ID,
    }
  }
  return null
}

async function loadConfigFromFile(): Promise<LLMConfig | null> {
  const paths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const p of paths) {
    try {
      const configStr = await fs.promises.readFile(p, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) {
        return {
          provider: 'zai',
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          token: config.token,
          userId: config.userId,
          chatId: config.chatId,
        }
      }
    } catch {
      // continue
    }
  }
  return null
}

function loadConfigFromHeaders(req: Request): LLMConfig | null {
  const headerVal = req.headers.get('x-llm-config') || req.headers.get('x-zai-config')
  if (!headerVal) return null
  try {
    const decoded = Buffer.from(headerVal, 'base64').toString('utf-8')
    const config = JSON.parse(decoded)
    if (config.apiKey) {
      // Detectar provider por baseUrl o explícito
      if (config.provider === 'groq' || (config.baseUrl && config.baseUrl.includes('groq'))) {
        return { provider: 'groq', apiKey: config.apiKey }
      }
      return {
        provider: 'zai',
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        token: config.token,
        userId: config.userId,
        chatId: config.chatId,
      }
    }
    return null
  } catch {
    return null
  }
}

async function resolveConfig(req?: Request): Promise<LLMConfig | null> {
  if (req) {
    const fromHeaders = loadConfigFromHeaders(req)
    if (fromHeaders) return fromHeaders
  }
  const fromEnv = await loadConfigFromEnv()
  if (fromEnv) return fromEnv
  const fromFile = await loadConfigFromFile()
  if (fromFile) return fromFile
  return null // No hay config — usar fallback por keywords
}

// ===== Cliente LLM con fetch directo =====
class LLMClient {
  constructor(private config: LLMConfig) {}

  async chatCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number } = {}): Promise<string> {
    if (this.config.provider === 'groq') {
      return this.groqCompletion(messages, options)
    }
    return this.zaiCompletion(messages, options)
  }

  private async groqCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number }): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.max_tokens ?? 800,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Groq API ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices[0]?.message?.content ?? ''
  }

  private async zaiCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number }): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Z-AI-From': 'Z',
    }
    if (this.config.token) {
      headers['X-Token'] = this.config.token
    }
    const body: Record<string, unknown> = {
      model: 'glm-4.6',
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.max_tokens ?? 800,
    }
    if (this.config.chatId) body.chat_id = this.config.chatId
    if (this.config.userId) body.user_id = this.config.userId

    const url = `${(this.config.baseUrl || '').replace(/\/$/, '')}/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ZAI API ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices[0]?.message?.content ?? ''
  }

  // ===== Visión: analizar imagen =====
  async visionCompletion(messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): Promise<string> {
    if (this.config.provider === 'groq') {
      // Groq soporta llama-3.2-90b-vision-preview
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.2-90b-vision-preview',
          messages,
          temperature: 0.4,
          max_tokens: 800,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Groq Vision ${res.status}: ${text.slice(0, 200)}`)
      }
      const data = await res.json()
      return data.choices[0]?.message?.content ?? ''
    }
    // Z.ai: usar createVision del SDK (solo en sandbox)
    throw new Error('Vision no soportado con Z.ai en producción')
  }
}

let cachedClient: LLMClient | null = null
let cachedKey = ''

export async function getLLM(req?: Request): Promise<LLMClient | null> {
  const config = await resolveConfig(req)
  if (!config) return null
  const cacheKey = `${config.provider}:${config.apiKey}:${config.token || ''}`
  if (cachedClient && cachedKey === cacheKey) return cachedClient
  cachedClient = new LLMClient(config)
  cachedKey = cacheKey
  return cachedClient
}

// Alias para compatibilidad con código existente
export async function getZai(req?: Request): Promise<LLMClient | null> {
  return getLLM(req)
}

export default LLMClient
