// Verify and fix schema on Turso
const TURSO_URL = 'https://lasercraft-ai-shadowwolfsubs.aws-us-east-1.turso.io'
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODU2MzEzNjMsImlkIjoiMDE5ZmJmZWMtM2QwMS03NmQyLTg0NDUtOTdmMjhmODVjYmUzIiwia2lkIjoib1dYdVlpenZibExJNDlzNU5kVkJIN1d4Qi1TTnVOb1FhY0VhU0pLOGxoYyIsInJpZCI6ImMzMDliNGM3LTA3ODYtNDNhZS05Y2JkLWViNzg2YzAwODc0YiJ9.x8GUDXoxtRWCamr9MGk46KEnXtiWoydbj_h1oBWyj9rSQ7YRouO3q9L_kI7ZqSkGRXp9I2lliVOVW0SVZF3QCA'

// Crear tablas una por una
const creates = [
  `CREATE TABLE IF NOT EXISTS "LearningEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userMessage" TEXT NOT NULL,
    "templateId" TEXT,
    "params" TEXT,
    "success" BOOLEAN NOT NULL,
    "validSvg" BOOLEAN NOT NULL,
    "loopAttempts" INTEGER NOT NULL,
    "errors" TEXT,
    "replyText" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "DynamicTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceQuery" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "testedWith" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ResearchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "sourcesFound" INTEGER NOT NULL,
    "sourcesUsed" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "templateCreated" BOOLEAN NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
]

for (const stmt of creates) {
  console.log('→ Creando tabla:', stmt.match(/"(\w+)"/)?.[1])
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: stmt } }] }),
  })
  const data = await res.json()
  for (const r of data.results) {
    if (r.type === 'ok') console.log('  ✓ OK')
    else console.log('  ✗', r.error.message)
  }
}

// Índices
const indexes = [
  `CREATE INDEX IF NOT EXISTS "LearningEntry_success_idx" ON "LearningEntry"("success")`,
  `CREATE INDEX IF NOT EXISTS "LearningEntry_templateId_idx" ON "LearningEntry"("templateId")`,
  `CREATE INDEX IF NOT EXISTS "LearningEntry_createdAt_idx" ON "LearningEntry"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "UserPreference_key_idx" ON "UserPreference"("key")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserPreference_userId_key_idx" ON "UserPreference"("userId", "key")`,
  `CREATE INDEX IF NOT EXISTS "DynamicTemplate_verified_idx" ON "DynamicTemplate"("verified")`,
  `CREATE INDEX IF NOT EXISTS "DynamicTemplate_name_idx" ON "DynamicTemplate"("name")`,
  `CREATE INDEX IF NOT EXISTS "ResearchLog_query_idx" ON "ResearchLog"("query")`,
]

for (const stmt of indexes) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: stmt } }] }),
  })
  const data = await res.json()
  for (const r of data.results) {
    if (r.type !== 'ok') console.log('Index error:', r.error.message)
  }
}

// Verificar
const verifyRes = await fetch(`${TURSO_URL}/v2/pipeline`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TURSO_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: "SELECT name FROM sqlite_master WHERE type='table'" } }] }),
})
const verifyData = await verifyRes.json()
console.log('\nTablas en Turso:')
for (const r of verifyData.results) {
  if (r.type === 'ok') {
    for (const row of r.response.result.rows) {
      console.log('  -', row[0].value)
    }
  }
}
