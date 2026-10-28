# HANDOFF — contexto para continuar el proyecto en otro equipo

> Lo escribió Claude el 2026-10-27 al migrar el proyecto de equipo. Léelo completo antes de tocar nada.
> El usuario escribe en **español**; responde siempre en español. No contiene secretos: los `.env` viajan aparte.

## 1. Qué es esto

ERP + tienda online para un minimarket en Perú (marca **MARC**). Monorepo (`apps/*`):

| App | Qué es |
|---|---|
| `apps/backend` | Express + TypeScript + Prisma + PostgreSQL 16 + Redis 7 + Socket.io |
| `apps/frontend` | ERP (React 18 + Vite + Tailwind + shadcn): POS, inventario, compras, caja, reportes, pantalla TV, etc. |
| `apps/store` | Tienda online para clientes (PWA) + página de señalización `/tv` |
| `apps/delivery` | App de repartidores (bikers) |
| `apps/landing`, `apps/mars-logistics` | Landing y servicio de logística |

Repo: `github.com/elmarci/marc-erp`, rama `main`. Dominios: tienda `www.tiendasmarc.pe`, ERP `minimarketmarc.up.railway.app`, backend `marc-erp-production.up.railway.app`.

## 2. Levantar el entorno local

1. Instalar Git, Node 20+, Docker Desktop, Claude Code; `gh auth login` y `railway login`.
2. Clonar el repo y **copiar encima el contenido del zip de migración** (trae los `.env`, imágenes y carpetas que no están en git).
3. `docker-compose up --build` (servicios `erp_postgres`, `erp_redis`, `erp_backend`, `erp_frontend`, `erp_pgadmin`; los puertos salen de `docker-compose.yml`/`.env`).
4. Base local vacía: `npm run db:seed` (o `prisma db push` + seed). **No hay migraciones**: el esquema se aplica con `prisma db push`. Los datos reales viven solo en Railway.
5. Credenciales de prueba locales: ver `apps/backend/prisma` / seed y la pantalla de login local. Nunca usarlas en producción.

Trampas conocidas:
- **El hot-reload no es confiable** (tsx watch / Vite HMR): tras editar, reinicia a mano `docker restart erp_backend erp_frontend`.
- Typecheck del backend: en `apps/backend`, `npx prisma generate` y luego `npx tsc -p tsconfig.build.json --noEmit` (el build de producción es más estricto que el tsc normal; ej. error TS4055 por tipos no exportados). Frontend: `npx tsc --noEmit` en `apps/frontend`.
- El CSS global del ERP hace que todo `button` mida mínimo 44 px: usa `min-h-0` en controles pequeños.
- Los archivos del repo usan CRLF en Windows; al parchear con scripts conserva los saltos de línea.
- Rate limit: en local el login admite 5 intentos/15 min y el global 100/15 min por IP (en memoria; reiniciar `erp_backend` lo resetea). En producción `RATE_LIMIT_MAX=1000`; `/tv/live` y `/tv/config` están excluidos.

## 3. Despliegue (Railway)

- **Push a `main` despliega solo** los servicios: `marc-erp-backend`, `Sistema ERP` (frontend), `Tienda Virtual` (store), `apps/delivery`, `mars-logistics`. Postgres y Redis son de Railway.
- Seguir el estado: `railway status --json` (cada servicio `latestDeployment.status`: BUILDING → DEPLOYING → SUCCESS).
- **Si cambias `schema.prisma`, aplica el esquema a producción** (no hay migraciones): `npx prisma db push --schema apps/backend/prisma/schema.prisma --skip-generate` con `DATABASE_URL` apuntando a la `DATABASE_PUBLIC_URL` de Railway (sácala con `railway variables`; **nunca la subas al repo**). Hazlo antes de que el backend nuevo arranque.
- Dominios/Branding/despliegue: usa el skill del repo **`marc-brand`** (`.claude/skills/marc-brand`) para cualquier UI de marca o tema de dominio/deploy.
- Preferencia visual de la tienda: look moderno tipo Rappi/PedidosYa, no impreso/serif; verde con moderación, azul secundario.

## 4. Decisiones de diseño ya tomadas (no re-discutir)

- **Stock siempre en unidades base.** Packs/cajas: `Product.packSize/packPrice/packLabel/packBarcode`; `SaleItem.unitsPerSale` (descuento de stock = cantidad × unitsPerSale). En el carrito la línea de pack lleva el sufijo `#pack` (`PACK_SUFFIX`) y se manda `sellAsPack`. Escanear el código del pack agrega el pack, no la unidad. Las promos pueden armarse con packs (`PromotionProduct.asPack`).
- **Vencimientos:** `Category.requiresExpiry` (hereda del padre; lácteos, panadería, carnes y embutidos) exige fecha al comprar. FEFO al vender. Existe "Sin fecha registrada" para stock sin lote.
- **Alerta de margen (solo alerta, NUNCA modifica precios):** para productos volátiles (categoría `volatilePricing` o granel kg/L) el margen mínimo es `min(setting min_margin_volatile (def. 1 sol), 0.5×costo)` sobre el **último costo de compra** (`Product.lastPurchaseCost`), no el promedio.
- **Préstamos:** solo a clientes registrados, agrupados por persona, pago FIFO.
- **Ventas:** los pagos se guardan netos; `amountTendered` guarda lo entregado para reimprimir recibido/vuelto. Si el POS tiene una sesión de caja vencida, la venta se redirige a la sesión abierta de la misma caja.
- **Venta sin stock registrado (auto-ajuste):** escanear, o doble toque en el producto, vende aunque el sistema tenga 0; al cobrar el backend crea un movimiento `ADJUSTMENT_IN` (`referenceType = SALE_AUTO_ADJUST`) por lo que faltaba y el stock queda en 0. El costo usa el último costo de compra. Sin PIN (decisión del dueño). Reporte en Inventario → Ajustes. Promos/combos siguen exigiendo stock.
- **Pantalla TV (`/tv`):** escenario 1920×1080 escalado, posicionamiento absoluto (compatible con Chromium viejo de Samsung Tizen), barra inferior de 64 px opcional por slide (`TvSlide.showFooter`), estado en vivo en Redis (`tv:live`, modos ONLY/CART, sondeo cada 3 s), claves estables por slide (`slideKey`). El POS puede mandar a la TV la venta en curso. Pantalla completa: el navegador exige un gesto, por eso hay aviso + atajo `chrome.exe --kiosk https://www.tiendasmarc.pe/tv`.

## 5. Contexto del negocio

- Régimen tributario: **NRUS** (cuota fija, solo boletas, sin IGV ni libros). El dueño **lleva su propia contabilidad** (sin contador externo). Topes NRUS según SUNAT: S/ 8,000 al mes / S/ 96,000 al año en ventas y en compras (cat. 1 hasta S/ 5,000, cat. 2 hasta S/ 8,000). **Verificar contra los totales reales de ventas**, probablemente se superan.
- El POS corre en una PC todo-en-uno táctil; la TV es una Smart TV Samsung 40".

## 6. Pendientes (en este orden de prioridad)

1. **Módulo "Administración", Fase 1 (diseño acordado, falta construir):**
   - Control NRUS (ventas y compras del mes/año vs topes, alerta al 80 %) — empezar por aquí.
   - Estado de resultados por periodo (día/semana/mes/año/rango, comparado con el periodo anterior): ventas netas (− devoluciones/descuentos) − costo de ventas (`SaleItem.costPrice`) = utilidad bruta − gastos por categoría − pérdidas de inventario (mermas, vencimientos, ajustes automáticos) = utilidad neta.
   - Compras por periodo (por proveedor/categoría, pagado vs pendiente) y ventas por periodo (método de pago, cajero, categoría, tendencia).
   - Gastos: categorías propias (hoy es un enum fijo de 8 en `ExpenseCategory`), proveedor asociado, categoría para la cuota SUNAT.
   - Ya existe `GET /reports/net-profit` (`reports.service.ts: getNetProfitReport`), básico: ventas − costo − gastos, sin pérdidas de inventario.
   - Fase 2: cuentas por pagar/cobrar con antigüedad, flujo de caja (efectivo/Yape/banco), valorización de inventario. Fase 3: cierre de mes + exportación a Excel.
2. Copiar `barcode → packBarcode` en producción para Golden Beach rojo, Golden Beach verde, Marlboro Kretek Mint y Lucky Strike DC (**el dueño debe confirmar antes**).
3. Pastelería no está marcada como categoría que exige vencimiento (el dueño pidió lácteos, panadería, carnes y embutidos).
4. Módulo de repartidores (bikers): existe `apps/backend/src/modules/delivery` y `apps/delivery`; había un plan de integración ERP↔app de reparto (bolsa de pedidos, claim atómico, billetera, liquidaciones). Verificar en el código qué parte está hecha antes de continuar.
5. El disco del equipo anterior estaba al 99 % (Docker Desktop colgado); si Docker vuelve a fallar, `docker system df` y limpiar.

## 7. Preferencias de trabajo del dueño

- Prefiere que le **confirmes el entendimiento** de un requerimiento nuevo antes de programarlo y luego "despliega" cuando está conforme.
- Verifica los cambios localmente (curl/scripts y el navegador) antes de desplegar; después revisa que los servicios queden en SUCCESS.
- No quiere complicaciones operativas en caja (p. ej. sin PIN de supervisor en el auto-ajuste).
