// Verificar tablas en Turso
const TURSO_URL = 'https://lasercraft-ai-shadowwolfsubs.aws-us-east-1.turso.io'
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODU2MzEzNjMsImlkIjoiMDE5ZmJmZWMtM2QwMS03NmQyLTg0NDUtOTdmMjhmODVjYmUzIiwia2lkIjoib1dYdVlpenZibExJNDlzNU5kVkJIN1d4Qi1TTnVOb1FhY0VhU0pLOGxoYyIsInJpZCI6ImMzMDliNGM3LTA3ODYtNDNhZS05Y2JkLWViNzg2YzAwODc0YiJ9.x8GUDXoxtRWCamr9MGk46KEnXtiWoydbj_h1oBWyj9rSQ7YRouO3q9L_kI7ZqSkGRXp9I2lliVOVW0SVZF3QCA'

const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TURSO_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    requests: [
      { type: 'execute', stmt: { sql: "SELECT name FROM sqlite_master WHERE type='table'" } },
      { type: 'execute', stmt: { sql: "SELECT name FROM sqlite_master WHERE type='index'" } },
    ],
  }),
})

const data = await res.json()
console.log('Tablas en Turso:')
for (const r of data.results) {
  if (r.type === 'ok') {
    const rows = r.response.result.rows
    for (const row of rows) {
      console.log('  -', row[0].value)
    }
  } else {
    console.log('  Error:', r.error.message)
  }
}
