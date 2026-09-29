// Wrapper para Z.ai — fetch directo (no usa SDK) para máximo control
// Soporta:
// 1. Variables de entorno (ZAI_BASE_URL, ZAI_API_KEY, ZAI_TOKEN)
// 2. Config per-request (header x-zai-config del cliente)
// 3. Archivo .z-ai-config local (sandbox/dev)

import fs from 'fs'
import path from 'path'
import os from 'os'

export interface ZaiConfig {
  baseUrl: string
  apiKey: string
  token?: string
  userId?: string
  chatId?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionResponse {
  choices: Array<{
    finish_reason: string
    index: number
    message: { content: string; role: string }
  }>
  created: number
  id: string
  model: string
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

async function loadConfigFromEnv(): Promise<ZaiConfig | null> {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    token: process.env.ZAI_TOKEN,
    userId: process.env.ZAI_USER_ID,
    chatId: process.env.ZAI_CHAT_ID,
  }
}

async function loadConfigFromFile(): Promise<ZaiConfig | null> {
  const paths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const p of paths) {
    try {
      const configStr = await fs.promises.readFile(p, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) return config
    } catch {
      // continue
    }
  }
  return null
}

function loadConfigFromHeaders(req: Request): ZaiConfig | null {
  const headerVal = req.headers.get('x-zai-config')
  if (!headerVal) return null
  try {
    const decoded = Buffer.from(headerVal, 'base64').toString('utf-8')
    const config = JSON.parse(decoded)
    if (config.baseUrl && config.apiKey) return config
    return null
  } catch {
    return null
  }
}

async function resolveConfig(req?: Request): Promise<ZaiConfig> {
  if (req) {
    const fromHeaders = loadConfigFromHeaders(req)
    if (fromHeaders) return fromHeaders
  }
  const fromEnv = await loadConfigFromEnv()
  if (fromEnv) return fromEnv
  const fromFile = await loadConfigFromFile()
  if (fromFile) return fromFile
  throw new Error('Z.ai SDK no configurado. Configure ZAI_BASE_URL y ZAI_API_KEY, o pegue su token en Settings.')
}

// ===== Cliente ZAI con fetch directo =====
class ZAIClient {
  constructor(private config: ZaiConfig) {}

  async chatCompletion(messages: ChatMessage[], options: { temperature?: number; max_tokens?: number } = {}): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Z-AI-From': 'Z',
    }
    // X-Token requerido por internal-api.z.ai
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

    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ZAI API ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = (await res.json()) as ChatCompletionResponse
    return data.choices[0]?.message?.content ?? ''
  }
}

let cachedClient: ZAIClient | null = null
let cachedKey = ''

export async function getZai(req?: Request): Promise<ZAIClient> {
  const config = await resolveConfig(req)
  const cacheKey = `${config.baseUrl}:${config.apiKey}:${config.token || ''}`
  if (cachedClient && cachedKey === cacheKey) return cachedClient
  cachedClient = new ZAIClient(config)
  cachedKey = cacheKey
  return cachedClient
}

export default ZAIClient
