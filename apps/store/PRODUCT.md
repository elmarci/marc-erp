# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Clientes de Minimarket Marc, una bodega física real en Pachacamac (zona
Manchay), que quieren pedir productos de bodega — leche, pan, bebidas,
abarrotes, licores, limpieza, etc. — para delivery en distritos cercanos o
recojo en tienda, desde el celular. No es un supermercado grande ni un
catálogo genérico: es el inventario real de esta tienda.

## Product Purpose

Tienda online oficial de Minimarket Marc. Permite comprar el mismo
inventario que existe en el local físico, integrada de verdad al ERP interno
del negocio: cada pedido confirmado se convierte en una Venta real (stock,
caja, cliente y puntos reales), no en un pedido aislado de una app de
delivery genérica.

## Positioning

Bodega real, no agregador. La diferencia frente a Rappi/PedidosYa: catálogo
e inventario en tiempo real de ESTA tienda (no productos de marketplace
genérico), puntos de fidelización reales acumulados sobre compras reales,
WhatsApp directo con el dueño para consultas o pedidos fuera de catálogo, y
la confianza de una bodega de barrio conocida en vez de la distancia de un
agregador.

## Operating Context

- Catálogo con categorías/subcategorías reales del negocio, búsqueda de
  texto y por voz.
- Carrito → checkout: recojo en tienda o delivery a distritos configurados
  (costo de delivery por zona, se rechaza fuera de zona); pago con Yape,
  Plin, Efectivo o Yape contra entrega.
- Registro con teléfono/contraseña o Google; también modo invitado con
  "Pedir por WhatsApp" como salida sin fricción.
- Perfil del cliente: historial de pedidos, reporte de consumos por
  producto/rango de fechas, puntos de fidelización + zona de canje, libreta
  de direcciones.
- Notificaciones push (ofertas, hora feliz) vía Web Push.
- Instalable como PWA: Android/Chrome con instalación real
  (`beforeinstallprompt`); iOS con guía manual paso a paso (Apple no permite
  instalación programática — solo Safari → Compartir → Agregar a inicio).
- Ofertas segmentadas por categoría, con paquetes/combos armables desde la
  propia tienda.
- El dueño y su equipo administran productos, categorías, ofertas, zonas de
  entrega y confirman pedidos desde el ERP interno (`apps/frontend`) — esta
  app (`apps/store`) es sólo la cara pública para el cliente.

## Capabilities and Constraints

- Catálogo, stock, precios y confirmación de pedidos dependen siempre del
  backend real (`apps/backend` + PostgreSQL) — nada de datos de mentira ni
  backend simulado.
- Sin pasarela de tarjeta: solo Yape / Plin / Efectivo (incluye "Yape contra
  entrega", se cobra al recibir).
- Delivery limitado a distritos configurados en el ERP (zona Pachacamac /
  Manchay y alrededores) — pedir fuera de zona activa se rechaza en el
  backend.
- Distribución sólo como PWA instalable — no hay publicación en App
  Store/Play Store. En iOS la instalación es 100% manual vía Safari.
- Existe un producto "comodín" interno del POS (ventas varias fuera de
  catálogo) que vive en la base del ERP pero está **intencionalmente oculto**
  de esta tienda — nunca debe aparecer como producto pedible.
- Alcance de este documento: sólo Tienda Marc (una tienda). No se documenta
  como plataforma multi-tienda; si esa dirección avanza de verdad, se
  registra aparte cuando exista.

## Brand Commitments

- Nombre: "Minimarket Marc" / "Tienda Marc". Ubicación real: Mz F10 Lt2A -
  C.27 Av. Manchay, Pachacamac. Horario: Lun–Dom 7:00 AM–10:00 PM.
- Logo real: `logomarc.png` (raíz del repo) y `apps/store/public/logo.png` /
  `logo-icon.png`.
- El sistema de diseño y las reglas de marca ya están decididas y
  documentadas en el skill de proyecto **`marc-brand`**
  (`.claude/skills/marc-brand/SKILL.md`): paleta (`brand.blue/green/magenta/
  achiote`, fondo blanco real), tipografía (Outfit + Public Sans), y una
  lista explícita de qué evitar (nada de serif, nada de "caricatura", nada
  de transición 3D tipo diapositiva). Ese skill es la autoridad de estilo —
  este documento no repite ni compite con esas decisiones visuales.
- Tono: cercano, "de barrio", pero moderno y limpio — nunca imprenta/print,
  nunca infantil.

## Evidence on Hand

- **537 fotos de producto reales** en `image_products/` (raíz del repo, sin
  trackear en git todavía) — el nombre de archivo es el nombre del producto,
  listas para asociarse al catálogo.
- Logo real en `logomarc.png`.
- Catálogo, categorías, ofertas y clientes reales ya viven en producción
  (Railway) — para cualquier demo o construcción se prefiere usar datos
  reales vía la API en vez de inventar contenido de ejemplo.
- No hay testimonios, casos de estudio ni cifras de prensa registrados — no
  se inventa ninguno.

## Product Principles

1. Es la tienda de un negocio real — nunca se inventa catálogo, precios,
   testimonios o métricas; todo sale del backend real o se deja pendiente.
2. Cara pública simple para el cliente; toda la complejidad operativa
   (confirmar pedidos, ofertas, zonas, inventario) vive en el ERP interno,
   no acá.
3. Cercanía de barrio ante todo: WhatsApp siempre disponible, sin fricción
   de registro obligatorio agresivo.
4. Todo pedido debe terminar asociado a un cliente real del ERP (con o sin
   sesión iniciada) para que el reporte de consumos y los puntos funcionen
   siempre.
5. El estilo visual sigue al skill `marc-brand`; este documento no toma
   decisiones de paleta, tipografía o layout.
