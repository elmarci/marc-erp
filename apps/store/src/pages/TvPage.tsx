import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { storeApi, type Offer, type Product } from '../api'

// Pantalla de cartelería para la TV de la tienda (abrir tiendasmarc.pe/tv en
// el navegador de la Samsung). Escenario fijo de 1920x1080 que se escala para
// calzar con cualquier resolución, y layout con posicionamiento absoluto en
// vez de flex-gap / grid: los navegadores de TV Samsung de 2018-2020 son un
// Chromium viejo (56-69) y no soportan `gap` en flexbox. Por la misma razón
// no usa framer-motion: solo transiciones de opacidad en CSS.

const STAGE_W = 1920
const STAGE_H = 1080
const FOOTER_H = 150
const CONTENT_H = STAGE_H - FOOTER_H

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
}

const FONT_DISPLAY = '"Outfit", system-ui, sans-serif'
const FONT_SANS = '"Public Sans", system-ui, sans-serif'

const REFETCH_MS = 5 * 60 * 1000
// Recarga completa cada tanto: libera memoria en el navegador de la TV (que
// no se reinicia nunca) y de paso recoge cualquier versión nueva desplegada.
const FULL_RELOAD_MS = 6 * 60 * 60 * 1000

const money = (n: number) => `S/ ${n.toFixed(2)}`

function discounted(price: number, offer: Offer): number {
  const v = Number(offer.value)
  if (offer.type === 'FIXED_DISCOUNT') return Math.max(0, Math.round((price - v) * 100) / 100)
  if (offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'HAPPY_HOUR') {
    return Math.round(price * (1 - v / 100) * 100) / 100
  }
  return price
}

function offerHeadline(offer: Offer): { big: string; small: string } {
  const v = Number(offer.value)
  if (offer.type === 'PERCENTAGE_DISCOUNT') return { big: `${v}% OFF`, small: 'de descuento' }
  if (offer.type === 'HAPPY_HOUR') return { big: `${v}% OFF`, small: 'hora feliz' }
  if (offer.type === 'FIXED_DISCOUNT') return { big: `S/ ${v} OFF`, small: 'de descuento' }
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
  const image = offer.storeImage ?? offer.products[0]?.product.imageUrl ?? null
  const isPriceCut = offer.type === 'PERCENTAGE_DISCOUNT' || offer.type === 'FIXED_DISCOUNT' || offer.type === 'HAPPY_HOUR'

  // Cuando el dueño subió el diseño completo de la promo, se muestra tal cual
  // a pantalla entera — no se le pone texto encima.
  if (offer.storeFullDesign && offer.storeImage) {
    return (
      <div style={abs({ left: 0, top: 0, width: STAGE_W, height: CONTENT_H, background: '#fff' })}>
        <img
          src={offer.storeImage}
          alt={offer.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    )
  }

  const { big, small } = offerHeadline(offer)
  const shownProducts = offer.products.slice(0, isPriceCut ? 3 : 4)

  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: CONTENT_H, background: '#fff' })}>
      <div style={abs({ left: 0, top: 0, width: 880, height: CONTENT_H, background: C.surface })}>
        {image && (
          <img
            src={image}
            alt=""
            style={abs({ left: 60, top: 60, width: 760, height: CONTENT_H - 120, objectFit: 'contain' })}
          />
        )}
      </div>

      <div style={abs({ left: 960, top: 70, width: 880 })}>
        <div style={{
          display: 'inline-block', background: C.magenta, color: '#fff', fontFamily: FONT_SANS,
          fontWeight: 800, fontSize: 30, letterSpacing: 4, padding: '10px 26px', borderRadius: 999,
        }}>
          {offer.storeBadge ? offer.storeBadge.toUpperCase() : 'OFERTA'}
        </div>

        <div style={{
          fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: big.length > 12 ? 104 : 150,
          lineHeight: 1.02, color: C.magenta, marginTop: 28,
        }}>
          {big}
        </div>
        {small && (
          <div style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 38, color: C.inkSoft, marginTop: 6 }}>
            {small}
          </div>
        )}

        <div style={{
          fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 60, lineHeight: 1.1, color: C.ink,
          marginTop: 34, ...clamp(2),
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

function ProductsSlide({ title, products }: { title: string; products: Product[] }) {
  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: CONTENT_H, background: '#fff' })}>
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
              {p.imageUrl && (
                <img
                  src={p.imageUrl}
                  alt=""
                  style={abs({ left: 16, top: 12, width: CARD_W - 32, height: 166, objectFit: 'contain' })}
                />
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
function AppSlide() {
  const qr = useQrDataUrl(QR_URL, 560)
  return (
    <div style={abs({ left: 0, top: 0, width: STAGE_W, height: CONTENT_H, background: C.green })}>
      <div style={abs({ left: 110, top: 150, width: 1000, color: '#fff' })}>
        <div style={{ fontFamily: FONT_SANS, fontWeight: 800, fontSize: 34, letterSpacing: 5, opacity: 0.85 }}>
          TIENDA MARC
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 132, lineHeight: 1.02, marginTop: 20 }}>
          Pide desde tu celular
        </div>
        <div style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 44, lineHeight: 1.3, marginTop: 36 }}>
          Delivery en Manchay o recoge en tienda.
          <br />
          Ofertas y puntos que solo encuentras en la app.
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

/* ── Franja fija inferior ──────────────────────────────────────────────── */
function Footer({ progressKey, durationSec }: { progressKey: number; durationSec: number }) {
  const qr = useQrDataUrl(QR_URL, 240)
  return (
    <div style={abs({ left: 0, top: CONTENT_H, width: STAGE_W, height: FOOTER_H, background: C.blue })}>
      <div
        key={progressKey}
        style={abs({
          left: 0, top: 0, height: 6, background: '#fff', opacity: 0.55,
          animation: `tvprogress ${durationSec}s linear forwards`,
        })}
      />
      <div style={abs({ left: 80, top: 28, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 70, color: '#fff', lineHeight: 1 })}>
        Marc
        <span style={{ fontFamily: FONT_SANS, fontWeight: 800, fontSize: 24, letterSpacing: 6, marginLeft: 18 }}>
          MINIMARKET
        </span>
      </div>
      <div style={abs({ left: 80, top: 104, fontFamily: FONT_SANS, fontWeight: 500, fontSize: 26, color: '#ffffff', opacity: 0.85 })}>
        {STORE_ADDRESS}
      </div>

      <div style={abs({ left: 960, top: 34, width: 700, textAlign: 'right', fontFamily: FONT_SANS, color: '#fff' })}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 46 }}>Pide en la app</div>
        <div style={{ fontWeight: 600, fontSize: 28, opacity: 0.9, marginTop: 6 }}>
          Delivery y recojo · tiendasmarc.pe
        </div>
      </div>
      <div style={abs({ left: 1700, top: 14, width: 122, height: 122, background: '#fff', borderRadius: 18 })}>
        {qr && <img src={qr} alt="QR" style={abs({ left: 6, top: 6, width: 110, height: 110 })} />}
      </div>
    </div>
  )
}

/* ── Página ────────────────────────────────────────────────────────────── */
interface Slide {
  key: string
  seconds: number
  node: ReactNode
}

export function TvPage() {
  const [scale, setScale] = useState(1)
  const [idx, setIdx] = useState(0)

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

  const { data: offersData } = useQuery({
    queryKey: ['tv-offers'],
    queryFn: () => storeApi.getOffers(),
    refetchInterval: REFETCH_MS,
  })
  const { data: featuredData } = useQuery({
    queryKey: ['tv-featured'],
    queryFn: () => storeApi.getFeaturedProducts(16),
    refetchInterval: REFETCH_MS,
  })

  const slides = useMemo<Slide[]>(() => {
    const offers = (offersData?.data.data ?? []).slice(0, 6)
    const featured = (featuredData?.data.data ?? []).filter((p) => Number(p.salePrice) > 0)
    const list: Slide[] = []
    offers.forEach((o) => list.push({ key: `offer-${o.id}`, seconds: 11, node: <OfferSlide offer={o} /> }))
    for (let i = 0; i < featured.length && i < 16; i += 8) {
      const chunk = featured.slice(i, i + 8)
      if (chunk.length >= 4) {
        list.push({
          key: `products-${i}`, seconds: 13,
          node: <ProductsSlide title={i === 0 ? 'Los más vendidos' : 'Más para tu despensa'} products={chunk} />,
        })
      }
    }
    list.push({ key: 'app', seconds: 12, node: <AppSlide /> })
    return list
  }, [offersData, featuredData])

  const current = idx % slides.length

  useEffect(() => {
    const t = window.setTimeout(() => setIdx((i) => i + 1), slides[current].seconds * 1000)
    return () => window.clearTimeout(t)
  }, [idx, current, slides])

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
        {slides.map((s, i) => (
          <div
            key={s.key}
            style={{
              position: 'absolute', left: 0, top: 0, width: STAGE_W, height: CONTENT_H,
              opacity: i === current ? 1 : 0, transition: 'opacity 0.8s ease',
            }}
          >
            {s.node}
          </div>
        ))}
        <Footer progressKey={idx} durationSec={slides[current].seconds} />
      </div>
    </div>
  )
}
