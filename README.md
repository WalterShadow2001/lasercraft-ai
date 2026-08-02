# LaserCraft AI

Aplicación web para diseñar plantillas de corte y grabado láser de forma conversacional. El usuario describe lo que quiere (ej: "caja 100×80×60mm con finger joints") y un agente IA identifica la plantilla paramétrica correcta, llena los parámetros, genera el SVG con finger joints matemáticamente correctos, lo valida en un loop de auto-corrección, lo ensambla en 3D, y permite exportar a SVG/DXF/LightBurn.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** + shadcn/ui (New York)
- **react-three-fiber** + drei (vista 3D)
- **Zustand** (estado global)
- **Prisma** + Turso (libSQL)
- **z-ai-web-dev-sdk** (agente IA)

## Plantillas disponibles

1. `box` — Caja ensamblable con 6 caras y finger joints
2. `drawer` — Cajón con tirador tipo U
3. `shelf` — Estante con repisas
4. `display` — Exhibidor escalonado
5. `keychain` — Llavero con texto
6. `plaque` — Placa conmemorativa
7. `sign` — Letrero decorativo

## Algoritmos clave

- **Turtle graphics** (`src/lib/laser/turtle.ts`) — puerto del sistema cairo de Boxes.py
- **Finger joints** (`src/lib/laser/finger-joints.ts`) — `calcFingers()`, `drawFinger()`, `rectangularWall()`
- **Validador** (`src/lib/laser/validator.ts`) — 13 reglas estructurales con loop de auto-corrección (hasta 3 intentos)
- **Ensamblaje 2D→3D** (`src/lib/laser/assembly.ts`) — mapeo de roles a posiciones 3D
- **Exportadores** (`src/lib/laser/export.ts`) — SVG, DXF (AutoCAD R12), LightBurn (.lbrn2)

## Variables de entorno

```bash
# Base de datos (SQLite local para dev)
DATABASE_URL="file:./db/custom.db"

# Turso (producción)
TURSO_DATABASE_URL="libsql://<tu-db>.turso.io"
TURSO_AUTH_TOKEN="<tu-token>"

# Z.ai SDK (requerido para el agente IA en producción)
ZAI_BASE_URL="https://api.z.ai/v1"
ZAI_API_KEY="<tu-api-key-de-z.ai>"
```

En desarrollo local (sandbox Z.ai), el SDK usa automáticamente `/etc/.z-ai-config`. En Vercel u otro host, configura `ZAI_BASE_URL` y `ZAI_API_KEY` con tus credenciales de [chat.z.ai](https://chat.z.ai).

### Cómo obtener credenciales de Z.ai

1. Inicia sesión en [chat.z.ai](https://chat.z.ai)
2. Abre las DevTools del navegador → Application → Local Storage
3. Copia el `token` y `userId`
4. Configura en Vercel:
   - `ZAI_BASE_URL` = `https://api.z.ai/v1`
   - `ZAI_API_KEY` = tu API key
   - `ZAI_TOKEN` = el JWT token (opcional)
   - `ZAI_USER_ID` = tu userId (opcional)

## Desarrollo

```bash
bun install
bun run dev    # http://localhost:3000
bun run lint
```

## Convención de colores (SVG)

- `stroke="red"` = corte
- `fill="black"` = grabado relleno
- `stroke="blue"` = grabado línea

## Inspiración

- [Boxes.py](https://github.com/florianfesti/boxes) — generador paramétrico de cajas
- [Stanser](https://www.stanser.com/vectores/) — biblioteca de vectores CNC
