// Turtle graphics path builder — puerto del sistema cairo de Boxes.py
// Mantiene un cursor (x, y, angle) y acumula segmentos SVG.
// Soporta arcos, holes (agujeros), finger joints.

export class Turtle {
  x = 0
  y = 0
  angle = 0
  burn = 0.1 // corrección de láser (no usada para SVG, pero preservamos el concepto)

  private paths: string[] = []
  private currentPath: string[] = []
  private pathStarted = false

  constructor(burn = 0.1) {
    this.burn = burn
  }

  // ---- Helpers de posición ----

  moveTo(x: number, y: number): this {
    this.x = x
    this.y = y
    this.pathStarted = false
    return this
  }

  setAngle(degrees: number): this {
    this.angle = degrees
    return this
  }

  turn(degrees: number): this {
    this.angle += degrees
    return this
  }

  private ensurePathStarted(): void {
    if (!this.pathStarted) {
      this.currentPath.push(`M ${this.x.toFixed(3)} ${this.y.toFixed(3)}`)
      this.pathStarted = true
    }
  }

  private pushCurrentPath(): void {
    if (this.currentPath.length > 0) {
      this.paths.push(this.currentPath.join(' '))
      this.currentPath = []
      this.pathStarted = false
    }
  }

  // ---- Movimientos ----

  edge(length: number): this {
    if (length === 0) return this
    const rad = (this.angle * Math.PI) / 180
    this.x += length * Math.cos(rad)
    this.y += length * Math.sin(rad)
    this.ensurePathStarted()
    this.currentPath.push(`L ${this.x.toFixed(3)} ${this.y.toFixed(3)}`)
    return this
  }

  corner(degrees: number, radius = 0): this {
    if (degrees === 0) return this
    if (radius === 0) {
      this.angle += degrees
      return this
    }
    // Arco SVG (A rx ry x-axis-rotation large-arc-flag sweep-flag x y)
    const rad = (this.angle * Math.PI) / 180
    // Centro del arco: perpendicular a la dirección actual
    const sign = degrees > 0 ? 1 : -1
    const cx = this.x - sign * radius * Math.sin(rad)
    const cy = this.y + sign * radius * Math.cos(rad)
    // Nuevo ángulo
    this.angle += degrees
    const newRad = (this.angle * Math.PI) / 180
    const nx = cx + sign * radius * Math.sin(newRad)
    const ny = cy - sign * radius * Math.cos(newRad)
    const largeArc = Math.abs(degrees) > 180 ? 1 : 0
    const sweep = degrees > 0 ? 1 : 0
    this.ensurePathStarted()
    this.currentPath.push(
      `A ${radius.toFixed(3)} ${radius.toFixed(3)} 0 ${largeArc} ${sweep} ${nx.toFixed(3)} ${ny.toFixed(3)}`,
    )
    this.x = nx
    this.y = ny
    return this
  }

  // polyline acepta una secuencia alternando lengths y ángulos
  // Ejemplo: polyline(50, 90, 30, 90) = avanza 50, gira 90, avanza 30, gira 90
  // También acepta tuplas [length, radius] para esquinas con radio
  polyline(...args: (number | [number, number])[]): this {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (i % 2 === 0) {
        // length
        this.edge(Array.isArray(arg) ? arg[0] : arg)
      } else {
        // corner
        if (Array.isArray(arg)) {
          this.corner(arg[0], arg[1])
        } else {
          this.corner(arg, 0)
        }
      }
    }
    return this
  }

  // ---- Figuras ----

  rectangularHole(x: number, y: number, dx: number, dy: number, r = 0): this {
    this.pushCurrentPath()
    this.moveTo(x + r, y)
    this.ensurePathStarted()
    this.currentPath.push(`L ${(x + dx - r).toFixed(3)} ${y.toFixed(3)}`)
    if (r > 0) this.corner(90, r)
    this.currentPath.push(`L ${(x + dx).toFixed(3)} ${(y + dy - r).toFixed(3)}`)
    if (r > 0) this.corner(90, r)
    this.currentPath.push(`L ${(x + r).toFixed(3)} ${(y + dy).toFixed(3)}`)
    if (r > 0) this.corner(90, r)
    this.currentPath.push(`L ${x.toFixed(3)} ${(y + r).toFixed(3)}`)
    if (r > 0) this.corner(90, r)
    this.pushCurrentPath()
    // Restaurar posición sin afectar path
    this.x = x
    this.y = y
    this.pathStarted = false
    return this
  }

  circle(x: number, y: number, r: number): this {
    this.pushCurrentPath()
    this.paths.push(
      `M ${(x - r).toFixed(3)} ${y.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 1 0 ${(x + r).toFixed(3)} ${y.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 1 0 ${(x - r).toFixed(3)} ${y.toFixed(3)} Z`,
    )
    this.x = x
    this.y = y
    this.pathStarted = false
    return this
  }

  // Texto como paths aproximados (para grabado) — usamos <text> SVG directamente
  text(x: number, y: number, content: string, size = 12, rotation = 0): this {
    this.pushCurrentPath()
    const transform = rotation !== 0 ? ` transform="rotate(${rotation} ${x} ${y})"` : ''
    this.paths.push(
      `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-size="${size}" font-family="Arial, sans-serif" fill="black" text-anchor="middle"${transform}>${escapeXml(content)}</text>`,
    )
    this.x = x
    this.y = y
    this.pathStarted = false
    return this
  }

  // ---- Output ----

  getPaths(): string[] {
    this.pushCurrentPath()
    return this.paths
  }

  toSvg(stroke = 'stroke="red" stroke-width="0.4" fill="none"'): string {
    return this.getPaths()
      .filter((d) => !d.startsWith('<text'))
      .map((d) => `<path d="${d}" ${stroke}/>`)
      .concat(this.getPaths().filter((d) => d.startsWith('<text')))
      .join('\n')
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
