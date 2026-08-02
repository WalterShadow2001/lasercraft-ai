// Prisma client con soporte para Turso (libSQL)
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:./dev.db'
  const authToken = process.env.TURSO_AUTH_TOKEN

  // Si es una URL remota (turso), usar el adapter libSQL
  if (url.startsWith('libsql://') || url.startsWith('https://')) {
    const libsql = createClient({ url, authToken })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter })
  }

  // SQLite local
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
