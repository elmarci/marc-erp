import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, ScanBarcode, Search, Tag, X } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { usePosStore } from '@/stores/posStore';
import { ProductThumb } from './ProductThumb';
import { addCombo, addOfferProduct, discountedPrice, offerTag, setOfferScanHandler, useLiveOffers, type Offer } from './autoOffers';
import { CameraScanner, isCameraScanSupported } from './CameraScanner';

type Kind = 'discount' | 'pack' | 'combo';
type Sort = 'venta' | 'ahorro' | 'vence' | 'az';

interface Entry {
  key: string;
  offer: Offer;
  kind: Kind;
  product?: Offer['products'][0]['product'];
  name: string;
  detail: string;
  price: number;
  oldPrice: number;
  saving: number;
  categories: string[];
  /** Códigos de barra (unidad y paquete) de los productos de la oferta. */
  codes: string[];
  inCart: boolean;
  noStock: boolean;
}

const KIND_LABEL: Record<Kind | 'all', string> = { all: 'Todas', discount: 'Descuentos', pack: 'Packs', combo: 'Combos' };
const PAGE = 20;

function codesOf(p: { barcode: string | null; packBarcode?: string | null }) {
  return [p.barcode, p.packBarcode].filter((c): c is string => !!c).map((c) => c.toLowerCase());
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

/**
 * Pantalla de ofertas dentro del punto de venta: buscador, filtros por tipo y
 * categoría, orden, y carga de a 20. Primero salen las que aplican a lo que
 * ya está en el carrito.
 */
export function OffersBrowser({ onClose }: { onClose: () => void }) {
  const { data: offers = [], isLoading } = useLiveOffers();
  const cartIds = usePosStore((s) => new Set(s.items.map((i) => i.productId.split('#')[0])));
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('venta');
  const [limit, setLimit] = useState(PAGE);
  const [showCamera, setShowCamera] = useState(false);

  // El lector de códigos busca la oferta del producto leído.
  useEffect(() => {
    setOfferScanHandler((code) => { setQ(code); setKind('all'); setCat(null); setLimit(PAGE); });
    return () => setOfferScanHandler(null);
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const o of offers) {
      if (o.type === 'COMBO') {
        const sum = o.products.reduce((s, { quantity, product }) => s + Number(product.salePrice) * (quantity ?? 1), 0);
        out.push({
          key: o.id, offer: o, kind: 'combo', name: o.name,
          detail: o.products.map(({ quantity, product }) => `${(quantity ?? 1) > 1 ? `${quantity} ` : ''}${product.name}`).join(' + '),
          price: Number(o.value), oldPrice: sum, saving: Math.max(0, sum - Number(o.value)),
          categories: [...new Set(o.products.map((e) => e.product.category?.name).filter(Boolean))],
          codes: o.products.flatMap((e) => codesOf(e.product)),
          inCart: o.products.some((e) => cartIds.has(e.product.id)),
          noStock: o.products.some(({ quantity, product }) => product.currentStock < (quantity ?? 1)),
        });
        continue;
      }
      const isPack = o.type === 'BUY_X_GET_Y' || o.type === 'BUNDLE_PRICE';
      for (const e of o.products) {
        const orig = Number(e.product.salePrice);
        const units = o.getQuantity ?? 3;
        const total = o.type === 'BUNDLE_PRICE' ? Number(o.value) : orig * (o.buyQuantity ?? 2);
        out.push({
          key: `${o.id}-${e.product.id}`, offer: o, product: e.product, kind: isPack ? 'pack' : 'discount',
          name: e.product.name, detail: o.name,
          price: isPack ? total : discountedPrice(o, orig), oldPrice: isPack ? orig * units : orig,
          saving: isPack ? orig * units - total : orig - discountedPrice(o, orig),
          categories: e.product.category?.name ? [e.product.category.name] : [],
          codes: codesOf(e.product),
          inCart: cartIds.has(e.product.id),
          noStock: isPack ? e.product.currentStock < units : e.product.currentStock <= 0,
        });
      }
    }
    return out;
  // cartIds cambia de identidad en cada render; basta con la lista de ids
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, [...cartIds].sort().join()]);

  const counts = useMemo(() => {
    const c = { all: entries.length, discount: 0, pack: 0, combo: 0 };
    for (const e of entries) c[e.kind]++;
    return c;
  }, [entries]);
  const categories = useMemo(() => [...new Set(entries.flatMap((e) => e.categories))].sort(), [entries]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = entries.filter((e) =>
      (kind === 'all' || e.kind === kind) &&
      (!cat || e.categories.includes(cat)) &&
      (!term || e.codes.includes(term) || e.name.toLowerCase().includes(term) || e.detail.toLowerCase().includes(term) || offerTag(e.offer).toLowerCase().includes(term)));
    const byEnd = (e: Entry) => (e.offer.endDate ? new Date(e.offer.endDate).getTime() : Infinity);
    const cmp: Record<Sort, (a: Entry, b: Entry) => number> = {
      venta: (a, b) => Number(b.inCart) - Number(a.inCart) || b.saving - a.saving,
      ahorro: (a, b) => b.saving - a.saving,
      vence: (a, b) => byEnd(a) - byEnd(b),
      az: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(cmp[sort]);
  }, [entries, q, kind, cat, sort]);

  const reset = () => setLimit(PAGE);

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/50 lg:items-center lg:p-6" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-card pt-[env(safe-area-inset-top)] lg:h-[88vh] lg:max-w-3xl lg:rounded-2xl lg:pt-0 lg:shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Encabezado + buscador */}
        <div className="space-y-3 border-b border-border/60 px-4 pb-3 pt-2 lg:pt-4">
          <div className="flex items-center gap-1">
            <button onClick={onClose} aria-label="Volver" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-lg font-semibold">Ofertas <span className="text-sm font-normal text-muted-foreground">{entries.length} vigentes</span></h2>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={q} onChange={(e) => { setQ(e.target.value); reset(); }}
                placeholder="Buscar oferta, producto o código" enterKeyHint="search"
                className="h-11 w-full rounded-xl bg-muted pl-11 pr-10 text-sm outline-none focus:bg-card focus:ring-2 focus:ring-primary/40" />
              {q && (
                <button onClick={() => { setQ(''); reset(); }} aria-label="Borrar búsqueda"
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {isCameraScanSupported() && (
              <button onClick={() => setShowCamera(true)} aria-label="Buscar oferta con la cámara" title="Leer código con la cámara"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary active:scale-95">
                <ScanBarcode className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 h-scroll">
            {(['all', 'discount', 'pack', 'combo'] as const).map((k) => (
              <button key={k} onClick={() => { setKind(k); reset(); }} disabled={k !== 'all' && counts[k] === 0}
                className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-40',
                  kind === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/80')}>
                {KIND_LABEL[k]}<span className="tabular-nums opacity-70">{counts[k]}</span>
              </button>
            ))}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar"
              className="h-9 shrink-0 rounded-full bg-muted px-3 text-sm font-medium text-foreground/80 outline-none">
              <option value="venta">Para esta venta</option>
              <option value="ahorro">Mayor ahorro</option>
              <option value="vence">Vencen pronto</option>
              <option value="az">A – Z</option>
            </select>
          </div>
          {categories.length > 1 && (
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 text-sm h-scroll">
              {[null, ...categories].map((c) => (
                <button key={c ?? 'all'} onClick={() => { setCat(c); reset(); }}
                  className={cn('shrink-0 border-b-2 pb-1 font-medium transition-colors',
                    cat === c ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
                  {c ?? 'Todas las categorías'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {isLoading ? (
            <div className="space-y-px p-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/70" />)}</div>
          ) : shown.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Tag className="h-10 w-10 opacity-25" />
              <p className="text-sm">{entries.length === 0 ? 'No hay ofertas vigentes ahora' : /^\d{6,}$/.test(q.trim()) ? 'Ese producto no tiene ofertas vigentes' : 'Ninguna oferta coincide'}</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border/60">
                {shown.slice(0, limit).map((e) => {
                  const until = fmtDate(e.offer.endDate);
                  const units = e.offer.getQuantity ?? 3;
                  return (
                    <li key={e.key} className={cn('flex items-center gap-3 px-4 py-3', e.noStock && 'opacity-50')}>
                      {e.kind === 'combo'
                        ? <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">Combo</span>
                        : <ProductThumb name={e.name} imageUrl={e.product?.imageUrl} className="h-12 w-12" />}
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{e.name}</p>
                        {e.kind === 'combo' && <p className="line-clamp-1 text-xs text-muted-foreground">{e.detail}</p>}
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
                          <span className="font-semibold">{e.kind === 'pack' ? `${units} por ${formatCurrency(e.price)}` : formatCurrency(e.price)}</span>
                          {e.oldPrice > e.price && <span className="text-xs text-muted-foreground line-through">{formatCurrency(e.oldPrice)}</span>}
                          {e.kind !== 'combo' && <span className="rounded bg-primary/10 px-1.5 text-[11px] font-semibold leading-5 text-primary">{offerTag(e.offer)}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {e.inCart && <span className="mr-2 font-medium text-primary">En esta venta</span>}
                          {until && <span>Hasta {until}</span>}
                          {e.noStock && <span className="ml-2 text-destructive">Sin stock suficiente</span>}
                        </p>
                      </div>
                      <button disabled={e.noStock}
                        aria-label={`Agregar ${e.name}`}
                        onClick={(ev) => { ev.currentTarget.blur(); if (e.kind === 'combo') addCombo(e.offer); else if (e.product) addOfferProduct(e.offer, e.product); }}
                        className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-semibold text-primary active:scale-95 disabled:opacity-40">
                        {e.kind === 'pack' ? `+${units}` : <Plus className="h-5 w-5" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {shown.length > limit && (
                <div className="p-4">
                  <button onClick={() => setLimit((l) => l + PAGE)}
                    className="h-11 w-full rounded-xl bg-muted text-sm font-medium hover:bg-muted/70">
                    Ver más ({shown.length - limit})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showCamera && (
        <div onClick={(e) => e.stopPropagation()}>
          <CameraScanner
            onDetected={(code) => { setQ(code); setKind('all'); setCat(null); reset(); setShowCamera(false); return true; }}
            onClose={() => setShowCamera(false)}
          />
        </div>
      )}
    </div>
  );
}
