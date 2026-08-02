// Aplicar schema a Turso statement por statement
import fs from 'fs'

const TURSO_URL = 'https://lasercraft-ai-shadowwolfsubs.aws-us-east-1.turso.io'
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODU2MzEzNjMsImlkIjoiMDE5ZmJmZWMtM2QwMS03NmQyLTg0NDUtOTdmMjhmODVjYmUzIiwia2lkIjoib1dYdVlpenZibExJNDlzNU5kVkJIN1d4Qi1TTnVOb1FhY0VhU0pLOGxoYyIsInJpZCI6ImMzMDliNGM3LTA3ODYtNDNhZS05Y2JkLWViNzg2YzAwODc0YiJ9.x8GUDXoxtRWCamr9MGk46KEnXtiWoydbj_h1oBWyj9rSQ7YRouO3q9L_kI7ZqSkGRXp9I2lliVOVW0SVZF3QCA'

const sql = fs.readFileSync('/home/z/my-project/scripts/turso-schema.sql', 'utf-8')

const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith('--'))

for (const stmt of statements) {
  console.log('\n→ Ejecutando:', stmt.slice(0, 80).replace(/\s+/g, ' '))
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql: stmt } }],
    }),
  })
  const data = await res.json()
  for (const r of data.results) {
    if (r.type === 'ok') {
      console.log('  ✓ OK')
    } else {
      console.log('  ✗ Error:', r.error.message)
    }
  }
}
