// Wrapper para z-ai-web-dev-sdk que soporta:
// 1. Variables de entorno (ZAI_BASE_URL, ZAI_API_KEY)
// 2. Config per-request (header x-zai-config del cliente)
// 3. Archivo .z-ai-config local (sandbox/dev)

import fs from 'fs'
import path from 'path'
import os from 'os'
import ZAIClass from 'z-ai-web-dev-sdk'

export interface ZaiConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

const cache = new Map<string, ZAIClass>()

async function loadConfigFromEnv(): Promise<ZaiConfig | null> {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    chatId: process.env.ZAI_CHAT_ID,
    userId: process.env.ZAI_USER_ID,
    token: process.env.ZAI_TOKEN,
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
  // Header x-zai-config: JSON codificado en base64
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
  // 1. Config per-request (del cliente UI)
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
  throw new Error('Z.ai SDK no configurado. Configure las variables ZAI_BASE_URL y ZAI_API_KEY, o pegue su token en Settings.')
}

export async function getZai(req?: Request): Promise<ZAIClass> {
  const config = await resolveConfig(req)
  // Cache por baseUrl+apiKey para evitar recrear instancias
  const cacheKey = `${config.baseUrl}:${config.apiKey}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!
  // El SDK acepta config en el constructor
  const instance = new ZAIClass(config)
  cache.set(cacheKey, instance)
  return instance
}

export default ZAIClass
