import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { storeApi, type Offer, type TvSlideData, type TvLiveCartItem } from '../api'

type TvProduct = NonNullable<TvSlideData['products']>[number]

// Pantalla de cartelería para la TV de la tienda (abrir tiendasmarc.pe/tv en
// el navegador de la Samsung). Escenario fijo de 1920x1080 que se escala para
// calzar con cualquier resolución, y layout con posicionamiento absoluto en
// vez de flex-gap / grid: los navegadores de TV Samsung de 2018-2020 son un
// Chromium viejo (56-69) y no soportan `gap` en flexbox. Por la misma razón
// no usa framer-motion: solo transiciones de opacidad en CSS.

const STAGE_W = 1920
const STAGE_H = 1080
// Franja inferior delgada: el arte de las slides (y los flyers del dueño) usa
// casi toda la pantalla; la franja solo deja la dirección web y el QR.
const FOOTER_H = 64
const CONTENT_H = STAGE_H - FOOTER_H
// Alto disponible para la slide: normalmente descuenta la franja inferior; las
// slides sin franja usan toda la pantalla (se lo pasa la página por contexto).
const HeightCtx = createContext(CONTENT_H)

const STORE_URL = 'https://www.tiendasmarc.pe'
// utm_source para poder medir cuánta gente llega escaneando el QR de la TV.
const QR_URL = `${STORE_URL}/?utm_source=tv&utm_medium=tienda`
const STORE_ADDRESS = 'Mz F10 Lt2A - C.27 Av. Manchay, Pachacamac'

const C = {
  ink: '#26241c',
  inkSoft: '#5b5744',
  surface: '#f4f4f2',
  blue: '#2460b4',
  green: '#4ca324',
  greenDark: '#3d8a18',
  magenta: '#d6006c',
  achiote: '#c9552a',
}

const FONT_DISPLAY = '"Outfit", system-ui, sans-serif'
const FONT_SANS = '"Public Sans", system-ui, sans-serif'

const REFETCH_MS = 5 * 60 * 1000
// Qué tan seguido pregunta la TV si hay algo en vivo (slide fija, imagen al
// vuelo o venta en curso). 3 s se siente "en vivo" sin saturar nada.
const LIVE_POLL_MS = 3000
// Recarga completa cada tanto: libera memoria en el navegador de la TV (que
// no se reinicia nunca) y de paso recoge cualquier versión nueva desplegada.
const FULL_RELOAD_MS = 6 * 60 * 60 * 1000

const money = (n: number) => `S/ ${n.toFixed(2)}`

// La hora feliz puede ser en % o en soles fijos (valueType) — igual que en
// AddOfferModal, donde el % es el valor por defecto.
const isFixedCut = (offer: Offer) =>
  offer.type === 'FIXED_DISCOUNT' || (offer.type === 'HAPPY_HOUR' && offer.valueType === 'FIXED')

function discounted(price: number, offer: Offer): number {
  const v = Number(offer.value)
  if (isFixedCut(offer)) return Math.max(0, Math.round((price - v) * 100) / 100)
  if (offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'HAPPY_HOUR') {
    return Math.round(price * (1 - v / 100) * 100) / 100
  }
  return price
}

function offerHeadline(offer: Offer): { big: string; small: string } {
  const v = Number(offer.value)
  const cut = isFixedCut(offer) ? `S/ ${v} OFF` : `${v}% OFF`
  if (offer.type === 'PERCENTAGE_DISCOUNT') return { big: cut, small: 'de descuento' }
  if (offer.type === 'HAPPY_HOUR') return { big: cut, small: 'hora feliz' }
  if (offer.type === 'FIXED_DISCOUNT') return { big: cut, small: 'de descuento' }
  if (offer.type === 'BUY_X_GET_Y') {
    const b = offer.buyQuantity ?? 2
    const g = offer.getQuantity ?? 3
    return { big: `Lleva ${g}, paga ${b}`, small: 'llévate más por menos' }
  }
  if (offer.type === 'BUNDLE_PRICE' || offer.type === 'COMBO') {
    return { big: money(v), small: 'precio pack' }
  }
  return { big: 'Precio especial', small: '' }
}

function useQrDataUrl(text: string, size: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: C.ink, light: '#ffffff' } })
      .then((u) => { if (!cancelled) setUrl(u) })
      .catch(() => { /* sin QR no se rompe la pantalla, solo no se ve */ })
    return () => { cancelled = true }
  }, [text, size])
  return url
}

const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', ...style })

const clamp = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

/* ── Slide: oferta ─────────────────────────────────────────────────────── */
function OfferSlide({ offer }: { offer: Offer }) {
  const H = useContext(HeightCtx)
  // `||` y no `??`: el ERP guarda "" (no null) cuando no se subió banner.
  const image = offer.storeImage || offer.products[0]?.product.imageUrl || null
  const isPriceCut = offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT' || offer.type === 'HAPPY_HOUR'

  // Cuando el dueño subió el diseño completo de la promo, se muestra tal cual
  // a pantalla entera — no se le pone texto encima.
  if (offer.storeFullDesign && offer.storeImage) {
    return (
      <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: '#fff', overflow: 'hidden' })}>
        {/* Copia desenfocada de la misma imagen de fondo: el arte del dueño
            casi nunca es 16:9 y sus bordes son de otro color que el blanco. */}
        <img
          src={offer.storeImage}
          alt=""
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            WebkitFilter: 'blur(40px) brightness(1.05)', filter: 'blur(40px) brightness(1.05)',
            transform: 'scale(1.15)',
          }}
        />
        <img
          src={offer.storeImage}
          alt={offer.name}
          style={abs({ left: 0, top: 0, width: '100%', height: '100%', objectFit: 'contain' })}
        />
      </div>
    )
  }

  const { big, small } = offerHeadline(offer)
  const shownProducts = offer.products.slice(0, isPriceCut ? 3 : 4)
  const hasImage = !!image

  const badge = (
    <div style={{
      display: 'inline-block', fontFamily: FONT_SANS, fontWeight: 800, fontSize: 30, letterSpacing: 4,
      padding: '10px 26px', borderRadius: 999,
      background: hasImage ? C.magenta : '#fff', color: hasImage ? '#fff' : C.magenta,
    }}>
      {offer.storeBadge ? offer.storeBadge.toUpperCase() : 'OFERTA'}
    </div>
  )
  const headline = (
    <>
      <div style={{
        fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: big.length > 12 ? 104 : 170,
        lineHeight: 1.02, color: hasImage ? C.magenta : '#fff', marginTop: 28,
      }}>
        {big}
      </div>
      {small && (
        <div style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 40, color: hasImage ? C.inkSoft : '#fff', opacity: hasImage ? 1 : 0.9, marginTop: 6 }}>
          {small}
        </div>
      )}
    </>
  )

  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: '#fff' })}>
      <div style={abs({ left: 0, top: 0, width: 880, height: H, background: hasImage ? C.surface : C.magenta })}>
        {hasImage ? (
          <img
            src={image ?? ''}
            alt=""
            style={abs({ left: 60, top: 60, width: 760, height: H - 120, objectFit: 'contain' })}
          />
        ) : (
          // Sin foto: el precio / descuento pasa a ser lo que llena el panel.
          <div style={abs({ left: 80, top: 250, width: 740 })}>
            {badge}
            {headline}
          </div>
        )}
      </div>

      <div style={abs({ left: 960, top: hasImage ? 70 : 150, width: 880 })}>
        {hasImage && badge}
        {hasImage && headline}

        <div style={{
          fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 60, lineHeight: 1.1, color: C.ink,
          marginTop: hasImage ? 34 : 0, ...clamp(2),
        }}>
          {offer.name}
        </div>
        {offer.description && (
          <div style={{ fontFamily: FONT_SANS, fontSize: 32, lineHeight: 1.3, color: C.inkSoft, marginTop: 12, ...clamp(2) }}>
            {offer.description}
          </div>
        )}

        <div style={{ marginTop: 34 }}>
          {shownProducts.map((p) => {
            const price = Number(p.product.salePrice)
            return (
              <div key={p.product.id} style={{
                position: 'relative', height: 66, borderTop: '2px solid #e5e3dc', fontFamily: FONT_SANS,
              }}>
                <div style={abs({ left: 0, top: 12, width: isPriceCut ? 520 : 880, fontSize: 34, fontWeight: 600, color: C.ink, ...clamp(1) })}>
                  {p.product.name}
                </div>
                {isPriceCut && (
                  <div style={abs({ right: 0, top: 8, textAlign: 'right', whiteSpace: 'nowrap' })}>
                    <span style={{ fontSize: 28, color: '#8a8570', textDecoration: 'line-through', marginRight: 16 }}>
                      {money(price)}
                    </span>
                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 700, color: C.greenDark }}>
                      {money(discounted(price, offer))}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {offer.endDate && (
          <div style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 30, color: C.inkSoft, marginTop: 26 }}>
            Válido hasta el {new Date(offer.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Slide: grilla de productos ────────────────────────────────────────── */
const GRID_COLS = 4
const CARD_W = 416
const CARD_H = 362
const GRID_GAP = 32
const GRID_LEFT = 80
const GRID_TOP = 150

function ProductsSlide({ title, products }: { title: string; products: TvProduct[] }) {
  const H = useContext(HeightCtx)
  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: '#fff' })}>
      <div style={abs({ left: GRID_LEFT, top: 44, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 70, color: C.ink })}>
        <span style={{
          display: 'inline-block', width: 22, height: 22, borderRadius: 999, background: C.green,
          marginRight: 20, verticalAlign: 'middle', position: 'relative', top: -4,
        }} />
        {title}
      </div>

      {products.map((p, i) => {
        const col = i % GRID_COLS
        const row = Math.floor(i / GRID_COLS)
        return (
          <div
            key={p.id}
            style={abs({
              left: GRID_LEFT + col * (CARD_W + GRID_GAP),
              top: GRID_TOP + row * (CARD_H + GRID_GAP),
              width: CARD_W, height: CARD_H, background: C.surface, borderRadius: 28, overflow: 'hidden',
            })}
          >
            <div style={abs({ left: 0, top: 0, width: CARD_W, height: 190, background: '#fff' })}>
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt=""
                  style={abs({ left: 16, top: 12, width: CARD_W - 32, height: 166, objectFit: 'contain' })}
                />
              ) : (
                // Productos elegidos a mano por el admin pueden no tener foto.
                <div style={abs({
                  left: CARD_W / 2 - 60, top: 35, width: 120, height: 120, borderRadius: 999,
                  background: C.surface, color: C.inkSoft, textAlign: 'center', lineHeight: '120px',
                  fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 60,
                })}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={abs({
              left: 24, top: 204, width: CARD_W - 48, height: 72, fontFamily: FONT_SANS,
              fontWeight: 600, fontSize: 29, lineHeight: '36px', color: C.ink, ...clamp(2),
            })}>
              {p.name}
            </div>
            <div style={abs({
              left: 24, top: 284, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 60, color: C.greenDark,
            })}>
              {money(Number(p.salePrice))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Slide: llamado a descargar la app ─────────────────────────────────── */
function AppSlide({ title, subtitle }: { title?: string | null; subtitle?: string | null }) {
  const H = useContext(HeightCtx)
  const qr = useQrDataUrl(QR_URL, 560)
  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: C.green })}>
      <div style={abs({ left: 110, top: 150, width: 1000, color: '#fff' })}>
        <div style={{ fontFamily: FONT_SANS, fontWeight: 800, fontSize: 34, letterSpacing: 5, opacity: 0.85 }}>
          TIENDA MARC
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 132, lineHeight: 1.02, marginTop: 20 }}>
          {title || 'Pide desde tu celular'}
        </div>
        <div style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 44, lineHeight: 1.3, marginTop: 36 }}>
          {subtitle || (
            <>
              Delivery en Manchay o recoge en tienda.
              <br />
              Ofertas y puntos que solo encuentras en la app.
            </>
          )}
        </div>
        <div style={{
          display: 'inline-block', marginTop: 48, background: '#fff', color: C.greenDark,
          fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 54, padding: '14px 40px', borderRadius: 999,
        }}>
          tiendasmarc.pe
        </div>
      </div>

      <div style={abs({ left: 1190, top: 130, width: 640, height: 700, background: '#fff', borderRadius: 40, textAlign: 'center' })}>
        {qr && <img src={qr} alt="QR" style={abs({ left: 40, top: 40, width: 560, height: 560 })} />}
        <div style={abs({
          left: 0, top: 618, width: 640, fontFamily: FONT_SANS, fontWeight: 700, fontSize: 36, color: C.ink,
        })}>
          Escanea con la cámara
        </div>
      </div>
    </div>
  )
}

/* ── Slide: aviso propio (lo arma el dueño desde el ERP) ───────────────── */
function CustomSlide({ title, subtitle, imageUrl }: { title: string | null; subtitle: string | null; imageUrl: string | null }) {
  const H = useContext(HeightCtx)
  const hasText = !!(title || subtitle)

  // Solo imagen: se muestra tal cual, igual que el arte completo de una oferta.
  if (imageUrl && !hasText) {
    return (
      <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: '#fff', overflow: 'hidden' })}>
        <img
          src={imageUrl}
          alt=""
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            WebkitFilter: 'blur(40px) brightness(1.05)', filter: 'blur(40px) brightness(1.05)',
            transform: 'scale(1.15)',
          }}
        />
        <img src={imageUrl} alt="" style={abs({ left: 0, top: 0, width: '100%', height: '100%', objectFit: 'contain' })} />
      </div>
    )
  }

  const textSize = (title ?? '').length > 36 ? 96 : 128

  // Imagen + texto: foto a la izquierda, mensaje grande a la derecha.
  if (imageUrl) {
    return (
      <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: '#fff' })}>
        <div style={abs({ left: 0, top: 0, width: 880, height: H, background: C.surface })}>
          <img src={imageUrl} alt="" style={abs({ left: 60, top: 60, width: 760, height: H - 120, objectFit: 'contain' })} />
        </div>
        <div style={abs({ left: 960, top: 0, width: 880, height: H, display: 'table' })}>
          <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
            {title && (
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: textSize - 24, lineHeight: 1.05, color: C.ink }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontFamily: FONT_SANS, fontWeight: 500, fontSize: 44, lineHeight: 1.3, color: C.inkSoft, marginTop: 28 }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Solo texto: mensaje grande centrado sobre achiote (el azul se confundía
  // con la franja inferior, que ya es azul).
  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: H, background: C.achiote, display: 'table' })}>
      <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'center', padding: '0 140px' }}>
        {title && (
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: textSize, lineHeight: 1.05, color: '#fff' }}>
            {title}
          </div>
        )}
        {subtitle && (
          <div style={{ fontFamily: FONT_SANS, fontWeight: 500, fontSize: 52, lineHeight: 1.3, color: '#fff', opacity: 0.92, marginTop: 36 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Franja fija inferior (delgada) ────────────────────────────────────── */
function Footer({ progressKey, durationSec, rotating, visible }: { progressKey: number; durationSec: number; rotating: boolean; visible: boolean }) {
  const qr = useQrDataUrl(QR_URL, 200)
  return (
    <div style={abs({
      left: 0, top: CONTENT_H, width: STAGE_W, height: FOOTER_H, background: C.blue,
      opacity: visible ? 1 : 0, transition: 'opacity 0.8s ease',
    })}>
      {rotating && (
        <div
          key={progressKey}
          style={abs({
            left: 0, top: 0, height: 4, background: '#fff', opacity: 0.55,
            animation: `tvprogress ${durationSec}s linear forwards`,
          })}
        />
      )}
      <div style={abs({ left: 60, top: 12, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 36, color: '#fff', lineHeight: '46px', whiteSpace: 'nowrap' })}>
        tiendasmarc.pe
        <span style={{ fontFamily: FONT_SANS, fontWeight: 500, fontSize: 24, opacity: 0.85, marginLeft: 22 }}>
          Delivery y recojo · {STORE_ADDRESS}
        </span>
      </div>
      <div style={abs({ left: 1180, top: 12, width: 600, textAlign: 'right', fontFamily: FONT_SANS, fontWeight: 700, fontSize: 28, color: '#fff', lineHeight: '46px' })}>
        Pide en la app
      </div>
      <div style={abs({ left: 1800, top: 6, width: 54, height: 54, background: '#fff', borderRadius: 8 })}>
        {qr && <img src={qr} alt="QR" style={abs({ left: 3, top: 3, width: 48, height: 48 })} />}
      </div>
    </div>
  )
}

/* ── Venta en curso (carrito en vivo del POS) ──────────────────────────── */
const CART_VISIBLE_ROWS = 8
const CART_ROW_H = 88
const CART_LEFT_W = 1080
const PROMO_BOX_W = 800
const PROMO_SCALE = PROMO_BOX_W / STAGE_W
const PROMO_BOX_H = Math.round(CONTENT_H * PROMO_SCALE)

const qtyLabel = (i: TvLiveCartItem) => {
  const q = Number.isInteger(i.quantity) ? String(i.quantity) : i.quantity.toFixed(3).replace(/0+$/, '')
  return `${q}${i.unit && i.unit !== 'und' ? ' ' + i.unit : ''} × ${money(i.unitPrice)}`
}

function PromoRotator({ nodes }: { nodes: ReactNode[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (nodes.length < 2) return
    const t = window.setInterval(() => setI((x) => x + 1), 7000)
    return () => window.clearInterval(t)
  }, [nodes.length])
  const cur = nodes.length > 0 ? i % nodes.length : 0
  return (
    <div style={abs({ left: 1100, top: 40, width: PROMO_BOX_W, height: PROMO_BOX_H, borderRadius: 28, overflow: 'hidden', background: '#fff' })}>
      {nodes.map((n, k) => (
        <div key={k} style={{
          position: 'absolute', left: 0, top: 0, width: STAGE_W, height: CONTENT_H,
          transform: `scale(${PROMO_SCALE})`, transformOrigin: '0 0',
          opacity: k === cur ? 1 : 0, transition: 'opacity 0.6s ease',
        }}>
          {n}
        </div>
      ))}
    </div>
  )
}

function CartView({ cart, promoNodes }: {
  cart: { items: TvLiveCartItem[]; total: number; customerName: string | null }
  promoNodes: ReactNode[]
}) {
  const qr = useQrDataUrl(QR_URL, 420)
  const hidden = Math.max(0, cart.items.length - CART_VISIBLE_ROWS)
  const rows = cart.items.slice(hidden)
  const hasPromos = promoNodes.length > 0
  const qrTop = hasPromos ? PROMO_BOX_H + 80 : 120
  const qrH = CONTENT_H - qrTop - 40
  const qrSize = hasPromos ? 300 : 440

  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: CONTENT_H, background: '#fff' })}>
      <div style={abs({ left: CART_LEFT_W, top: 0, width: STAGE_W - CART_LEFT_W, height: CONTENT_H, background: C.surface })} />

      <div style={abs({ left: 80, top: 36, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 66, color: C.ink, lineHeight: 1 })}>
        {cart.customerName ? `Hola, ${cart.customerName.split(' ')[0]}` : 'Tu compra'}
      </div>
      <div style={abs({ left: 80, top: 112, fontFamily: FONT_SANS, fontWeight: 600, fontSize: 28, color: C.inkSoft })}>
        {hidden > 0 ? `+ ${hidden} producto${hidden === 1 ? '' : 's'} anteriores · ` : ''}
        {cart.items.length} producto{cart.items.length === 1 ? '' : 's'}
      </div>

      {rows.map((it, k) => (
        <div key={hidden + k} style={abs({
          left: 80, top: 166 + k * CART_ROW_H, width: CART_LEFT_W - 160, height: CART_ROW_H,
          borderTop: '2px solid #e5e3dc', fontFamily: FONT_SANS,
        })}>
          <div style={abs({ left: 0, top: 14, width: 560, fontSize: 36, fontWeight: 600, color: C.ink, ...clamp(1) })}>{it.name}</div>
          <div style={abs({ left: 0, top: 54, fontSize: 24, color: C.inkSoft })}>{qtyLabel(it)}</div>
          <div style={abs({ right: 0, top: 18, textAlign: 'right', fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' })}>
            {money(it.subtotal)}
          </div>
        </div>
      ))}

      <div style={abs({ left: 0, top: CONTENT_H - 150, width: CART_LEFT_W, height: 150, background: C.green })}>
        <div style={abs({ left: 80, top: 38, fontFamily: FONT_SANS, fontWeight: 800, fontSize: 40, letterSpacing: 6, color: '#fff', opacity: 0.9 })}>TOTAL</div>
        <div style={abs({ right: 80, top: 16, textAlign: 'right', fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 108, color: '#fff', whiteSpace: 'nowrap', lineHeight: '118px' })}>
          {money(cart.total)}
        </div>
      </div>

      {hasPromos && <PromoRotator nodes={promoNodes} />}

      <div style={abs({ left: 1100, top: qrTop, width: PROMO_BOX_W, height: qrH, background: '#fff', borderRadius: 28 })}>
        {qr && <img src={qr} alt="QR" style={abs({ left: 36, top: (qrH - qrSize) / 2, width: qrSize, height: qrSize })} />}
        <div style={abs({ left: qrSize + 76, top: 0, width: PROMO_BOX_W - qrSize - 100, height: qrH, display: 'table' })}>
          <div style={{ display: 'table-cell', verticalAlign: 'middle', fontFamily: FONT_SANS }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: hasPromos ? 44 : 60, lineHeight: 1.05, color: C.ink }}>Pide en la app</div>
            <div style={{ fontWeight: 600, fontSize: hasPromos ? 26 : 32, color: C.inkSoft, marginTop: 12 }}>Ofertas y puntos solo en la app</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: hasPromos ? 34 : 44, color: C.greenDark, marginTop: 14 }}>tiendasmarc.pe</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ThanksView() {
  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: CONTENT_H, background: C.green, display: 'table' })}>
      <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 170, lineHeight: 1.02 }}>¡Gracias por<br />tu compra!</div>
        <div style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 52, marginTop: 40, opacity: 0.95 }}>
          Vuelve pronto · Marc Minimarket
        </div>
      </div>
    </div>
  )
}

/* ── Pantalla completa (equivale a F11) ────────────────────────────────── */
// Los navegadores no dejan entrar a pantalla completa solos al abrir una página:
// exigen un gesto del usuario. Por eso la primera tecla o toque (en la TV, cualquier
// botón del control remoto) la activa, y mientras no esté activa se muestra un aviso.
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

const isFullscreen = () => !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement)

function enterFullscreen() {
  if (isFullscreen()) return
  const el = document.documentElement as FsEl
  try {
    const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.()
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { /* el navegador no lo permitió */ })
  } catch { /* sin soporte: no pasa nada, la página igual se ve */ }
}

function FullscreenHint() {
  const [full, setFull] = useState(isFullscreen())
  const [hidden, setHidden] = useState(false)
  // Dentro de la vista previa del ERP (iframe) no aplica.
  const embedded = window.self !== window.top

  useEffect(() => {
    if (embedded) return
    const sync = () => setFull(isFullscreen())
    const onGesture = () => { enterFullscreen(); window.setTimeout(sync, 300) }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    window.addEventListener('keydown', onGesture)
    window.addEventListener('click', onGesture)
    window.addEventListener('touchstart', onGesture)
    const hide = window.setTimeout(() => setHidden(true), 25000)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      window.removeEventListener('keydown', onGesture)
      window.removeEventListener('click', onGesture)
      window.removeEventListener('touchstart', onGesture)
      window.clearTimeout(hide)
    }
  }, [embedded])

  if (embedded || full || hidden) return null
  return (
    <div style={abs({
      left: 560, top: 900, width: 800, height: 56, background: 'rgba(0,0,0,0.78)', color: '#fff', borderRadius: 999,
      fontFamily: FONT_SANS, fontWeight: 600, fontSize: 26, lineHeight: '56px', textAlign: 'center',
    })}>
      Pulsa cualquier tecla o toca la pantalla para verla completa
    </div>
  )
}

/* ── Página ────────────────────────────────────────────────────────────── */
interface Slide {
  key: string
  seconds: number
  // false = sin franja inferior: la slide usa toda la pantalla.
  footer: boolean
  node: ReactNode
}

function toSlideNodes(list: TvSlideData[], prefix: string): Slide[] {
  const out: Slide[] = []
  list.forEach((s, i) => {
    const key = `${prefix}-${s.key ?? s.id ?? s.type}-${i}`
    const footer = s.showFooter !== false
    if (s.type === 'OFFER' && s.offer) {
      out.push({ key, seconds: s.seconds, footer, node: <OfferSlide offer={s.offer} /> })
    } else if (s.type === 'PRODUCTS' && s.products && s.products.length > 0) {
      out.push({ key, seconds: s.seconds, footer, node: <ProductsSlide title={s.title || 'Los más vendidos'} products={s.products} /> })
    } else if (s.type === 'CUSTOM') {
      out.push({ key, seconds: s.seconds, footer, node: <CustomSlide title={s.title} subtitle={s.subtitle} imageUrl={s.imageUrl} /> })
    } else if (s.type === 'APP') {
      out.push({ key, seconds: s.seconds, footer, node: <AppSlide title={s.title} subtitle={s.subtitle} /> })
    }
  })
  return out
}

export function TvPage() {
  const [scale, setScale] = useState(1)
  const [idx, setIdx] = useState(0)
  // Reloj del servidor − reloj de la TV, para medir el "gracias" sin depender de que la hora de la TV esté bien.
  const [clockOffset, setClockOffset] = useState(0)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Marc TV'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    const reload = window.setTimeout(() => window.location.reload(), FULL_RELOAD_MS)
    return () => {
      document.title = prevTitle
      document.head.removeChild(meta)
      window.clearTimeout(reload)
    }
  }, [])

  // Qué slides salen, en qué orden y cuánto dura cada una lo decide el dueño
  // desde el ERP (módulo Pantalla TV); el backend ya filtra lo apagado, lo
  // vencido y las promos que dejaron de estar vigentes.
  const { data: configData } = useQuery({
    queryKey: ['tv-config'],
    queryFn: () => storeApi.getTvConfig(),
    refetchInterval: REFETCH_MS,
  })

  // Transmisión en vivo: slide(s) fijas, imagen al vuelo o venta en curso.
  const { data: liveData } = useQuery({
    queryKey: ['tv-live'],
    queryFn: async () => {
      const res = await storeApi.getTvLive()
      setClockOffset(res.data.data.now - Date.now())
      return res.data.data
    },
    refetchInterval: LIVE_POLL_MS,
    refetchIntervalInBackground: true,
  })
  const live = liveData?.mode && liveData.mode !== 'AUTO' ? liveData : null

  const autoSig = JSON.stringify(configData?.data.data.slides ?? [])
  const autoSlides = useMemo<Slide[]>(
    () => toSlideNodes(configData?.data.data.slides ?? [], 'auto'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoSig],
  )
  const liveSig = JSON.stringify(live?.slides ?? [])
  const liveSlides = useMemo<Slide[]>(
    () => toSlideNodes(live?.slides ?? [], 'live'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveSig],
  )
  const liveMode = live?.mode ?? 'AUTO'

  // "Gracias por tu compra" dura unos segundos y se apaga solo.
  const thanksLeft = live?.thanksUntil ? live.thanksUntil - (Date.now() + clockOffset) : 0
  useEffect(() => {
    if (thanksLeft <= 0) return
    const t = window.setTimeout(() => forceTick((n) => n + 1), thanksLeft + 50)
    return () => window.clearTimeout(t)
  }, [thanksLeft])

  const cartActive = live?.mode === 'CART' && !!live.cart && live.cart.items.length > 0
  const thanksActive = live?.mode === 'CART' && !cartActive && thanksLeft > 0

  // Lo que rota: en vivo (ONLY), o las promos elegidas cuando no hay venta, o lo normal.
  const rotation = useMemo<Slide[]>(() => {
    let list = autoSlides
    if (liveMode === 'ONLY' && liveSlides.length > 0) list = liveSlides
    else if (liveMode === 'CART' && liveSlides.length > 0) list = liveSlides
    // Mientras carga (o si no hay nada configurado) la TV nunca queda en
    // blanco: se muestra el llamado a la app.
    return list.length > 0 ? list : [{ key: 'app-fallback', seconds: 12, footer: true, node: <AppSlide /> }]
  }, [autoSlides, liveSlides, liveMode])

  // Al cambiar lo que se transmite se empieza desde la primera.
  const signature = `${live?.mode ?? 'AUTO'}-${liveData?.version ?? 0}`
  useEffect(() => { setIdx(0) }, [signature])

  const current = idx % rotation.length
  const rotating = !cartActive && !thanksActive && rotation.length > 1
  // La venta en curso y el "gracias" siempre llevan la franja; las slides según su ajuste.
  const footerVisible = cartActive || thanksActive || rotation[current].footer

  useEffect(() => {
    if (!rotating) return
    const t = window.setTimeout(() => setIdx((i) => i + 1), rotation[current].seconds * 1000)
    return () => window.clearTimeout(t)
  }, [idx, current, rotation, rotating])

  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, width: '100%', height: '100%',
      background: '#000', overflow: 'hidden', cursor: 'none',
    }}>
      <style>{'@keyframes tvprogress{from{width:0}to{width:1920px}}'}</style>
      <div style={{
        position: 'absolute', width: STAGE_W, height: STAGE_H, background: '#fff', overflow: 'hidden',
        left: (window.innerWidth - STAGE_W * scale) / 2,
        top: (window.innerHeight - STAGE_H * scale) / 2,
        transform: `scale(${scale})`, transformOrigin: '0 0',
      }}>
        {rotation.map((s, i) => {
          const h = s.footer ? CONTENT_H : STAGE_H
          return (
            <div
              key={s.key}
              style={{
                position: 'absolute', left: 0, top: 0, width: STAGE_W, height: h,
                opacity: i === current && !cartActive && !thanksActive ? 1 : 0, transition: 'opacity 0.8s ease',
              }}
            >
              <HeightCtx.Provider value={h}>{s.node}</HeightCtx.Provider>
            </div>
          )
        })}

        {cartActive && live?.cart && (
          <CartView cart={live.cart} promoNodes={liveSlides.map((s) => s.node)} />
        )}
        {thanksActive && <ThanksView />}

        <Footer progressKey={idx} durationSec={rotation[current].seconds} rotating={rotating && footerVisible} visible={footerVisible} />
        <FullscreenHint />
      </div>
    </div>
  )
}
