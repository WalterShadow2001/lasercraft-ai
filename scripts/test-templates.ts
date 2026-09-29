// Test exhaustivo de todas las plantillas
import { generateFromTemplate, TEMPLATES } from './src/lib/laser/templates'
import { validateSvg } from './src/lib/laser/validator'
import { MATERIALS } from './src/types/laser'

const material = MATERIALS.mdf6

console.log('=== TEST DE 8 PLANTILLAS ===\n')

for (const t of TEMPLATES) {
  console.log(`\n--- ${t.id.toUpperCase()} (${t.name}) ---`)
  try {
    // Usar defaults
    const params: Record<string, number | string> = {}
    for (const p of t.params) params[p.id] = p.default
    const result = generateFromTemplate(t.id, params, material)
    const validation = validateSvg(result.svg)
    console.log(`  Partes: ${result.partCount}`)
    console.log(`  Dimensiones: ${result.dimensions.width}×${result.dimensions.height}×${result.dimensions.depth}mm`)
    console.log(`  Válido: ${validation.valid}`)
    if (validation.issues.length > 0) {
      for (const iss of validation.issues) {
        console.log(`    ${iss.severity}: ${iss.code} - ${iss.message}`)
      }
    }
    // Verificar que el SVG tiene paths reales
    const pathCount = (result.svg.match(/<path/g) || []).length
    const circleCount = (result.svg.match(/<circle/g) || []).length
    const groupCount = (result.svg.match(/<g/g) || []).length
    console.log(`  SVG: ${pathCount} paths, ${circleCount} circles, ${groupCount} grupos`)
    // Detectar paths sospechosos (sin M inicial o vacíos)
    const emptyPaths = (result.svg.match(/<path d="[^"]*L[^"]*"/g) || []).length
    console.log(`  Paths con solo L (sin M explícito): ${emptyPaths}`)
    // Tamaño SVG
    console.log(`  SVG length: ${result.svg.length} chars`)
  } catch (err) {
    console.log(`  ❌ ERROR: ${err instanceof Error ? err.message : 'unknown'}`)
    console.log(`  Stack: ${err instanceof Error ? err.stack?.slice(0, 300) : ''}`)
  }
}
