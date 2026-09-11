---
name: marc-brand
description: >-
  Sistema de diseño y flujo de despliegue de MARC (ERP + Tienda Marc + landing).
  Usar SIEMPRE al construir o modificar cualquier interfaz de cara al cliente
  o de marca (apps/store, el landing, correos, tickets, banners), al elegir
  colores/tipografía/íconos para este proyecto, o al conectar un dominio
  nuevo / desplegar a Railway. Evita el look genérico de plantilla y evita
  repetir los errores ya cometidos.
---

# MARC — marca + despliegue

Minimarket real en Pachacamac (Manchay). Monorepo: `apps/backend` (Express +
Prisma + PostgreSQL), `apps/frontend` (ERP interno), `apps/store` (PWA de
clientes: React + Vite + Tailwind + Framer Motion + React Query + Zustand +
React Router). Un landing separado puede vivir como `apps/landing`.

La identidad es **"Marc, de barrio"**: una bodega de verdad, no un agregador
de delivery. Cercano y cálido, pero **moderno y limpio** — referencia
Rappi / PedidosYa / Bees, **nunca** print/imprenta ni "de caricatura".

---

## Sistema de diseño

Fuente de verdad: `apps/store/tailwind.config.ts`. Un landing u otra app
debe copiar estos tokens, no inventar una paleta nueva.

### Color

| Token | Base | Uso |
|---|---|---|
| `brand.blue` | `#2460b4` | Wordmark "Marc", carrito. **Secundario** — estructura, links, acentos fríos. |
| `brand.green` | `#4ca324` (hover `#3d8a18`) | "MINIMARKET" y el aro del logo. Acción primaria (botones "Agregar", CTA). **Con moderación** — no pintar todo de verde. |
| `brand.magenta` | `#d6006c` | **Raro**: ofertas, badges, sello de confirmación. |
| `brand.achiote` | `#c9552a` | "Fresco / oferta real" — la sazón de mercado. El acento que ninguna plantilla de delivery usa. |
| `paper.bg` | `#ffffff` | **Fondo BLANCO real.** Pedido explícito del dueño — nada de beige / mostaza / "papel". |
| `paper.surface` | `#f4f4f2` | Gris neutro clarísimo para inputs, chips, tarjetas secundarias. |
| `paper.line` | `#e5e3dc` | Bordes / divisores. |
| `paper.ink` | `#26241c` | Texto principal (negro cálido). `ink-soft` `#5b5744`, `ink-faint` `#8a8570`, `ink-ghost` `#b3ad94`. |
| `process.yellow` | `#edbb00` | Reservado (registro tipo imprenta). |

Escalas completas 50–900 en el config. En un proyecto nuevo, cargar Tailwind
con este `theme.extend.colors` idéntico.

### Tipografía

Google Fonts:
`Outfit:wght@500;600;700;800` + `Public Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500`

- **`font-sans` = Public Sans** — cuerpo, transaccional: precios, botones,
  formularios, todo el checkout.
- **`font-display` = Outfit** — voz de marca: títulos de sección, precio
  grande de una oferta, hero. Geométrica, con calidez propia de app de
  delivery, **sin efecto burbuja redondeada**. Nunca en párrafos largos ni
  en formularios.

Ya se descartaron y **no se vuelve a**: Fredoka (se sintió "de caricatura"),
Source Serif / cualquier serif (se sintió "de imprenta genérica"), Plus
Jakarta / Inter como voz de marca (se sintió "segura", la usa cualquier app).

### Forma y movimiento

- Radios: `rounded-2xl` en tarjetas, `rounded-full` en pills / avatares / FAB
  / badges. Nada de `rounded-3xl` en todo.
- Transiciones entre pantallas: **discretas** — fundido + ~8px de
  desplazamiento vertical, ~0.18s, `easeOut`. Se probó rotación 3D + escala
  y se sintió "diapositiva de PowerPoint" — no se hace.
- Micro-interacciones sí (whileTap scale 0.94–0.98, spring), pero que no
  llamen la atención sobre la animación misma.
- Keyframes útiles ya definidos: `ring-pulse` (FAB), `stamp-in` (sello de
  confirmación), `shimmer` (skeletons), `marquee` (ticker de ofertas).

### Íconos

- Set propio de íconos de categoría en `apps/store/src/categoryIcons.tsx`:
  componentes SVG con `stroke="currentColor"`, **formas geométricas simples**
  (círculos, elipses, rects, paths cortos). Los blobs orgánicos con bézier
  se ven ilegibles a tamaño ícono — probado y descartado.
- `lucide-react` para el resto.
- **Fuera** los íconos genéricos de e-commerce: la balanza de "por kg", etc.
  Si algo se explica solo con texto (mono, mayúscula), no lleva ícono.

### Qué hace que NO se vea genérico

1. **Foto real > ícono > stock.** Fotos de la tienda / productos / barrio
   (Manchay, Pachacamac) con luz de día. Es el 80% de la diferencia.
2. **Datos reales, no relleno.** Años operando, N de productos, distritos y
   tiempos de entrega, la historia en palabras del dueño. Cero "Calidad y
   confianza".
3. **Datos en vivo de la API** — productos destacados y ofertas reales con
   precios (`/api/v1/store/products/featured`, `/api/v1/store/offers`). Una
   plantilla no puede hacer esto; MARC sí, ya está construido.
4. **Elementos propios**: mapa estilizado de zonas de reparto en SVG (no un
   Google Maps incrustado), ticket/sello como recurso gráfico recurrente.
5. **Un concepto con punto de vista**, no "hero + 3 cards + testimonio +
   footer".

### Proceso

Para cualquier rediseño o pantalla nueva importante: primero **concepto
visual** (paleta aplicada + tipografía + mockup) para que el dueño lo
apruebe/ajuste **antes** de construir. Recién después, implementación real.

---

## Arquitectura y entorno

### Local (Docker)

Contenedores: `erp_backend` (3001), `erp_postgres` (5432), `erp_redis`,
`erp_frontend` (5173), `cianuro_db` (no relacionado). Docker Desktop puede
necesitar arranque manual (`"C:\Program Files\Docker\Docker\Docker Desktop.exe"`).

- **Reiniciar `erp_backend` / `erp_frontend` a mano después de editar** — el
  hot-reload (tsx watch / Vite HMR) no es confiable acá.
- Store dev server: `.claude/launch.json` → `store-dev` en puerto **5174**
  (`preview_start({name: 'store-dev'})`). NO persiste entre sesiones — hay
  que relevantarlo al empezar.
- Base de datos local ≠ producción (docker-compose usa su propio Postgres).

### Producción (Railway, proyecto `robust-enthusiasm`)

| Servicio | URL | Puerto interno |
|---|---|---|
| `marc-erp-backend` | `marc-erp-production.up.railway.app` | 8080 |
| `Sistema ERP` | `minimarketmarc.up.railway.app` | 8080 |
| `Tienda Virtual` | `tiendamarc.up.railway.app` + `www.tiendasmarc.pe` | **8080** |
| Postgres | proxy público: `switchback.proxy.rlwy.net:20458` | — |
| Redis | — | — |

- Deploy: commit a `main` → push → Railway redespliega el/los servicio(s)
  afectados. Cambiar una **variable de entorno** también dispara redeploy.
- Cambios de schema Prisma: `DATABASE_URL=<proxy publico> npx prisma db push`
  desde `apps/backend` (no hay migración automática en el entrypoint).
- `railway` CLI: lecturas OK; algunas escrituras (editar dominios) piden
  `railway login` de nuevo; `railway variables --set` sí funcionó.
- Typecheck obligatorio antes de commitear: `npx tsc -b apps/<app>`
  (NO `--noEmit`).

---

## Checklist: conectar un dominio / subdominio nuevo

Hecho ya varias veces. Los tres pasos que se olvidan son puerto, CORS y caché.

1. **Railway** → servicio → Settings → Networking → Custom Domain → agregar
   `sub.tiendasmarc.pe`.
2. **Target Port** del dominio custom = el puerto donde escucha la app.
   Para las apps servidas con `serve -s dist` es **8080** (verificar en los
   logs: `Accepting connections at http://localhost:PORT`). Un puerto que no
   coincide → `502 Bad Gateway` con `x-railway-fallback: true`.
3. **DNS** en el registrar (nameservers de `tiendasmarc.pe` = `ns*.wowperu.pe`):
   - Subdominio: registro `CNAME` `sub` → el target que da Railway
     (ej. `f7m1vb2i.up.railway.app`).
   - Apex (`tiendasmarc.pe` sin `www`): necesita `ALIAS`/`ANAME` al target, o
     un redirect a `www`. Hoy el apex cae en una página de estacionamiento
     de GoDaddy — no está conectado.
4. **CORS** (si el sitio llama al backend): agregar el origen exacto a la
   variable `CORS_ORIGIN` de `marc-erp-backend` — separado por comas, con
   `https://`, **sin barra final**. Dispara redeploy del backend.
   ```
   railway variables --service marc-erp-backend --set "CORS_ORIGIN=<lista completa con el nuevo>"
   ```
   El backend valida contra lista blanca exacta (`src/server.ts`): si el
   origen no está, no manda `access-control-allow-origin` y el navegador
   bloquea en silencio → la app carga el shell pero "Cargando..." infinito.
5. **Verificar**:
   ```
   curl -sI -H "Origin: https://sub.tiendasmarc.pe" \
     "https://marc-erp-production.up.railway.app/api/v1/store/products/featured?limit=1" \
     | grep -i access-control-allow-origin
   ```
   Debe aparecer el header con el origen nuevo.

### Caché de la PWA (apps/store)

`apps/store/public/serve.json` (Vite lo copia a `dist/`, `serve` lo lee solo):
`index.html` / `sw.js` / `push-sw.js` / `manifest.webmanifest` → `no-cache`;
`assets/**` y `workbox-*.js` (nombre con hash) → `max-age=31536000, immutable`.
**No borrar este archivo** — sin él el Service Worker nunca detecta un build
nuevo y los usuarios se quedan pegados en una versión vieja sin aviso.

### Instalación de la PWA

- Android/Chrome: evento `beforeinstallprompt` real → botón "Instalar".
- **iOS: Apple NO permite instalar con un botón.** Solo manual desde
  **Safari** → Compartir → "Agregar a inicio". El banner en iOS abre una
  guía de 3 pasos (`InstallAppBanner.tsx`), no intenta disparar nada.
  Chrome/Firefox en iPhone crean solo un acceso directo, no la PWA.

---

## Disciplina de verificación

- **Probar con datos reales**: crear filas reales (cliente / pedido /
  venta), mintear JWT a mano si hace falta
  (`jwt.sign({sub}, JWT_SECRET)` para ERP, `+ '_customer'` para tienda), y
  **siempre limpiar después** en orden seguro de FK
  (sale_items → sale_payments → sales → store_order_items → store_orders →
  store_customers → customers; inventory_movements por `reference_id`).
- El visor del navegador (Browser pane) **congela las animaciones de Framer
  Motion** — los screenshots salen a media transición o con frames viejos.
  Cross-verificar con `get_page_text` / `read_page` / medición del DOM, no
  confiar solo en el screenshot. Frontear la pestaña y esperar ayuda a veces.
- Chrome oculta `www.` en la barra de direcciones — `tiendasmarc.pe` ahí
  suele ser en realidad `www.tiendasmarc.pe`.

## Reglas de negocio ya resueltas (no re-romper)

- Pedidos web como invitado: `confirmOrder` ahora vincula (o crea) un
  `Customer` por teléfono — ningún pedido queda sin cliente asociado, con o
  sin sesión. De eso dependen el reporte de consumos y los puntos.
- Producto comodín "Otros / Venta varios" (`isMiscItem`): oculto de la
  tienda; su costo se asume como 15% de margen (no 0 = 100%).
- Canje de puntos: resta atómica con guarda `gte` contra doble canje, mismo
  mecanismo en POS y en `confirmOrder`.
