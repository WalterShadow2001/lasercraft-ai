// Wrapper para z-ai-web-dev-sdk que soporta variables de entorno
// Compatible con Vercel y entornos sin /etc/.z-ai-config

import fs from 'fs'
import path from 'path'
import os from 'os'
import ZAIClass from 'z-ai-web-dev-sdk'

let initialized = false
let instance: ZAIClass | null = null

async function ensureConfigFile(): Promise<void> {
  // Si ya existe .z-ai-config en cwd, no hacer nada
  const cwdConfig = path.join(process.cwd(), '.z-ai-config')
  try {
    await fs.promises.access(cwdConfig)
    return // ya existe
  } catch {
    // no existe, continuar
  }

  // Si hay variables de entorno, crear el archivo dinámicamente
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  const chatId = process.env.ZAI_CHAT_ID
  const userId = process.env.ZAI_USER_ID
  const token = process.env.ZAI_TOKEN

  if (baseUrl && apiKey) {
    const config: Record<string, string> = { baseUrl, apiKey }
    if (chatId) config.chatId = chatId
    if (userId) config.userId = userId
    if (token) config.token = token
    await fs.promises.writeFile(cwdConfig, JSON.stringify(config), { mode: 0o600 })
    return
  }

  // Verificar ~/.z-ai-config
  const homeConfig = path.join(os.homedir(), '.z-ai-config')
  try {
    await fs.promises.access(homeConfig)
    return
  } catch {
    // no existe
  }

  // Verificar /etc/.z-ai-config (solo en sandbox)
  try {
    await fs.promises.access('/etc/.z-ai-config')
    return
  } catch {
    // no existe
  }

  throw new Error(
    'Z.ai SDK no configurado. Crea .z-ai-config en el proyecto, o configura las variables de entorno: ZAI_BASE_URL, ZAI_API_KEY',
  )
}

export async function getZai(): Promise<ZAIClass> {
  if (instance && initialized) return instance
  await ensureConfigFile()
  instance = await ZAIClass.create()
  initialized = true
  return instance
}

export default ZAIClass
