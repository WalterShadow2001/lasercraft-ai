// Wrapper multi-provider: soporta Pollinations.ai (gratis, sin API key),
// Google Gemini, Groq, y Z.ai
//
// Pollinations.ai es la opción por DEFECTO — funciona sin configuración
// y es una IA real (no solo keywords).

import fs from 'fs'
import path from 'path'
import os from 'os'

export interface LLMConfig {
  provider: 'pollinations' | 'groq' | 'gemini' | 'zai' | 'none'
  apiKey: string
  baseUrl?: string
  token?: string
  userId?: string
  chatId?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ===== Resolver config desde múltiples fuentes =====

async function loadConfigFromEnv(): Promise<LLMConfig | null> {
  if (process.env.GROQ_API_KEY) {
    return { provider: 'groq', apiKey: process.env.GROQ_API_KEY }
  }
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY }
  }
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
      if (config.provider === 'groq' || (config.baseUrl && config.baseUrl.includes('groq'))) {
        return { provider: 'groq', apiKey: config.apiKey }
      }
      if (config.provider === 'gemini' || (config.baseUrl && config.baseUrl.includes('google'))) {
        return { provider: 'gemini', apiKey: config.apiKey }
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

async function resolveConfig(req?: Request): Promise<LLMConfig> {
  // 1. Header del cliente (config manual del usuario)
  if (req) {
    const fromHeaders = loadConfigFromHeaders(req)
    if (fromHeaders) return fromHeaders
  }
  // 2. Variables de entorno (Vercel)
  const fromEnv = await loadConfigFromEnv()
  if (fromEnv) return fromEnv
  // 3. Archivo .z-ai-config (sandbox/local dev)
  const fromFile = await loadConfigFromFile()
  if (fromFile) return fromFile
  // 4. DEFAULT: Pollinations.ai (gratis, sin API key)
  return { provider: 'pollinations', apiKey: 'none' }
}

// ===== Cliente LLM con fetch directo =====
class LLMClient {
  constructor(private config: LLMConfig) {}

  async chatCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number } = {}): Promise<string> {
    if (this.config.provider === 'pollinations') {
      return this.pollinationsCompletion(messages, options)
    }
    if (this.config.provider === 'groq') {
      return this.groqCompletion(messages, options)
    }
    if (this.config.provider === 'gemini') {
      return this.geminiCompletion(messages, options)
    }
    return this.zaiCompletion(messages, options)
  }

  // ===== Pollinations.ai — gratis, sin API key =====
  private async pollinationsCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number }): Promise<string> {
    // Método 1: POST (OpenAI-compatible)
    try {
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages,
          temperature: options.temperature ?? 0.4,
          max_tokens: options.max_tokens ?? 800,
        }),
        signal: AbortSignal.timeout(15000), // 15s timeout
      })
      if (res.ok) {
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content
        if (content) return content
      }
    } catch {
      // Continuar al método 2
    }

    // Método 2: GET (más simple, más confiable)
    const systemMsg = messages.find((m) => m.role === 'system')?.content || ''
    const userMsgs = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n')
    const prompt = `${systemMsg}\n\nUsuario: ${userMsgs}\n\nResponde SOLO en JSON:`
    const encoded = encodeURIComponent(prompt)
    const getRes = await fetch(`https://text.pollinations.ai/${encoded}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    })
    if (!getRes.ok) {
      throw new Error(`Pollinations GET ${getRes.status}`)
    }
    return await getRes.text()
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

  private async geminiCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number }): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.config.apiKey}`
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))
    const systemMsg = messages.find((m) => m.role === 'system')
    if (systemMsg && contents.length > 0) {
      contents[0].parts[0].text = systemMsg.content + '\n\n' + contents[0].parts[0].text
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.4,
          maxOutputTokens: options.max_tokens ?? 800,
        },
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
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
    if (this.config.provider === 'pollinations') {
      // Pollinations no soporta visión directamente
      throw new Error('Vision no soportado con Pollinations. Configura Groq o Gemini en Settings.')
    }
    if (this.config.provider === 'groq') {
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
    if (this.config.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.config.apiKey}`
      const systemMsg = messages.find((m) => m.role === 'system')
      const userMsg = messages.find((m) => m.role === 'user')
      let textContent = ''
      let imageContent: string | null = null
      if (userMsg) {
        if (typeof userMsg.content === 'string') {
          textContent = userMsg.content
        } else if (Array.isArray(userMsg.content)) {
          for (const part of userMsg.content) {
            if (part.type === 'text' && part.text) textContent += part.text
            if (part.type === 'image_url' && part.image_url) {
              const match = part.image_url.url.match(/^data:(.+?);base64,(.+)$/)
              if (match) {
                imageContent = match[2]
              }
            }
          }
        }
      }
      const parts: Array<Record<string, unknown>> = [{ text: (systemMsg?.content || '') + '\n\n' + textContent }]
      if (imageContent) {
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageContent } })
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Gemini Vision ${res.status}: ${text.slice(0, 200)}`)
      }
      const data = await res.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }
    throw new Error('Vision no soportado con Z.ai en producción')
  }
}

let cachedClient: LLMClient | null = null
let cachedKey = ''

export async function getLLM(req?: Request): Promise<LLMClient> {
  const config = await resolveConfig(req)
  const cacheKey = `${config.provider}:${config.apiKey}:${config.token || ''}`
  if (cachedClient && cachedKey === cacheKey) return cachedClient
  cachedClient = new LLMClient(config)
  cachedKey = cacheKey
  return cachedClient
}

export async function getZai(req?: Request): Promise<LLMClient> {
  return getLLM(req)
}

export default LLMClient
