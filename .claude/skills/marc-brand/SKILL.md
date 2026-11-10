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

## Sistema de diseño — "Azul de confianza" (elegido por el dueño, 2026-11-10)

Aplica a la **tienda online** (`apps/store`) y a todo lo de cara al cliente.
El ERP (`apps/frontend`) conserva su propia tipografía y paleta.

Fuente de verdad de los tokens: `apps/store/tailwind.config.ts`. Datos de
negocio que se muestran (nombre, WhatsApp, zonas, horarios, costos):
`apps/store/src/lib/storeInfo.ts`. No repetirlos sueltos en las pantallas.

Referencia de estilo: apps de market y de pagos que la gente ya usa a diario
(Rappi, PedidosYa, Bees, Yape). Moderna, ordenada, fácil de navegar con el
pulgar. **Mobile-first, 375 px**: el 95 % del uso es en celular.

### Marca

- Nombre único: **Tiendas Marc** (oficial "TIENDAS MARC", dominio
  tiendasmarc.pe). No usar "Tienda Marc", "Minimarket Marc" ni "TIENDA MARC".
- Logo: mientras el logo completo siga diciendo "MINIMARKET Marc", usar el
  ícono del carrito (`/logo-icon.png`) + el texto "Tiendas Marc" en Figtree 800.

### Color

| Token | Valor | Uso |
|---|---|---|
| `brand-blue-600` | `#1450B4` (pulsado `700` `#0C3A8A`) | **El color de la marca en pantalla**: cabecera, barra de carrito, botón principal ("Hacer pedido"), enlaces, pestaña activa, íconos. |
| `brand-green-600` | `#2B7A12` (pulsado `700`) | **Solo el botón "Agregar"** y su contador −/+. No usarlo como relleno decorativo ni en otros botones. |
| `brand-sun-400` | `#FFD84D` con texto `brand-sun-900` `#3D2F00` | Ofertas, "Últimas N", insignias. |
| WhatsApp | `#25D366` con texto `#0B3B1E` | Botones de WhatsApp. **Nunca texto blanco** sobre este verde (2:1). |
| `paper-bg` | `#F4F6FB` | Fondo de página. Las tarjetas van en blanco encima. |
| `paper-surface` | `#EEF1F7` | Fondo de fotos, chips, campos sobre tarjeta blanca. |
| `paper-line` | `#E1E6F0` | Bordes y divisores. |
| `paper-ink` | `#14213D` | Texto principal y **precios** (siempre en tinta, nunca en color). |
| `paper-ink-soft` | `#4A5568` | Texto secundario (7:1). `ink-faint`/`ink-ghost` existen por compatibilidad y también pasan AA; en código nuevo usar `ink-soft`. |

Reglas: contraste **AA mínimo** en todo texto (4.5:1), sin degradados, sin
desenfoques de fondo. Magenta y achiote quedan solo para pantallas aún no
rediseñadas; no usarlos en código nuevo.

### Tipografía

**Figtree** (Google Fonts, pesos 400/600/700/800) para todo: `font-sans` y
`font-display` apuntan a la misma familia.

- Texto base 16 px (15 px en nombres de producto). Mínimo 12 px, y solo en
  etiquetas de la barra inferior e insignias.
- Títulos de sección: 18 px, peso 800. Precio en tarjeta: 20 px, peso 800,
  `tabular-nums`.
- Los campos de texto usan 16 px (evita el zoom automático de iOS).

### Forma

- Radios: tarjeta de producto `rounded-[18px]`, paneles `rounded-2xl`,
  botones y fotos `rounded-xl`, chips `rounded-full`.
- Sombras: `shadow-card` (tarjetas) y `shadow-float` (barra de carrito). Nada
  de `shadow-xl` decorativo.
- **Zonas táctiles de 44 px como mínimo** (botones 44–52 px de alto).
- Movimiento: solo el que informa (producto que vuela al carrito, contador).
  Sin animaciones de aparición al hacer scroll ni parpadeos.

### Componentes base (apps/store/src/components)

- `Header`: bloque azul; en celular la fila del buscador queda fija (64 px).
- `MobileTabBar`: Inicio, Categorías, Carrito, Cuenta. 64 px.
- `CartBar`: barra fija "Ver carrito · N · total" + botón de WhatsApp.
- `ProductCard`: foto, nombre (2 líneas), precio, "Agregar" / contador.
  Imágenes con `loading="lazy"` y ancho/alto declarados.
- Estados diseñados siempre: esqueleto al cargar, vacío con siguiente paso,
  error con "Reintentar" y "Pedir por WhatsApp".

### Tono

Claro y directo, de tú, sin signos de admiración ni emojis en la interfaz.
Decir el dato concreto: "Envío desde S/ 1.00 en Manchay alto", "Próximo
reparto: 5 a 9 pm", "Aún no tienes productos. Busca lo que necesitas."

### Reglas de experiencia

- **Tienda abierta**: catálogo, carrito y checkout sin cuenta. El ingreso
  (`/ingresar`) solo se pide para pedidos anteriores, puntos, direcciones
  guardadas y saldo.
- WhatsApp es vía principal junto al checkout, visible en todas las pantallas.
- Señales de confianza a la vista (zona, horarios, costo de envío, pagos),
  no escondidas en el pie de página.
- Solo anunciar medios de pago que el checkout acepta.

### Ya descartado (no volver)

Fredoka, serif, estética "papel/imprenta", verde como relleno general,
degradados, texto gris claro de bajo contraste, muro de login.

### Proceso

Para cualquier pantalla nueva importante: primero concepto visual para que el
dueño lo apruebe, luego implementación, y captura a 375 px antes de darla por
terminada.

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
