// Prisma client con soporte para Turso (libSQL) — lazy initialization
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Import dinámico para evitar evaluar el adapter durante el build
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:./dev.db'
  const authToken = process.env.TURSO_AUTH_TOKEN

  // Si es una URL remota (turso), usar el adapter libSQL
  if (url.startsWith('libsql://') || url.startsWith('https://')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@libsql/client')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibsql } = require('@prisma/adapter-libsql')
    const libsql = createClient({ url, authToken })
    const adapter = new PrismaLibsql(libsql)
    return new PrismaClient({ adapter })
  }

  // SQLite local
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

// Lazy getter: solo crea el cliente cuando se accede por primera vez
function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    try {
      globalForPrisma.prisma = createPrismaClient()
    } catch (err) {
      console.error('[db] Failed to create PrismaClient:', err)
      // Devolver un cliente stub que falle gracefully
      throw err
    }
  }
  return globalForPrisma.prisma
}

// Proxy que difiere la creación del cliente hasta el primer uso
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb()
    const value = (client as any)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
