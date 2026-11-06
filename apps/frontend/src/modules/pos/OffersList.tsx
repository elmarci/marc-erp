import { Plus, Tag } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { ProductThumb } from './ProductThumb';
import { addCombo, addOfferProduct, discountedPrice, offerTag, type Offer } from './autoOffers';

/**
 * Filtro "Ofertas" de la lista de productos: los combos arriba y debajo cada
 * producto en oferta como una fila más, con su etiqueta y el precio normal
 * tachado. El botón + lo agrega ya con la oferta aplicada.
 */
export function OffersList({ offers, search }: { offers: Offer[]; search: string }) {
  const q = search.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);

  const combos = offers.filter((o) => o.type === 'COMBO' && o.products.length > 0
    && (match(o.name) || o.products.some((p) => match(p.product.name))));
  const rows = offers
    .filter((o) => o.type !== 'COMBO')
    .flatMap((o) => o.products.map((e) => ({ offer: o, product: e.product })))
    .filter(({ offer, product }) => match(product.name) || match(offer.name));

  if (combos.length === 0 && rows.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Tag className="h-10 w-10 opacity-25" />
        <p className="text-sm">{q ? 'Ninguna oferta coincide con la búsqueda' : 'No hay ofertas vigentes ahora'}</p>
      </div>
    );
  }

  return (
    <div className="lg:mx-auto lg:max-w-3xl">
      {combos.length > 0 && (
        <section className="px-4 pb-1 pt-3 lg:px-0 lg:pt-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Combos</h3>
          <div className="space-y-2">
            {combos.map((o) => {
              const sum = o.products.reduce((s, { quantity, product }) => s + Number(product.salePrice) * (quantity ?? 1), 0);
              const missing = o.products.filter(({ quantity, product }) => product.currentStock < (quantity ?? 1));
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{o.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {o.products.map(({ quantity, product }) => `${(quantity ?? 1) > 1 ? `${quantity} ` : ''}${product.name}`).join(' + ')}
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      <span className="font-semibold">{formatCurrency(Number(o.value))}</span>
                      {sum > Number(o.value) && <span className="ml-2 text-xs text-muted-foreground line-through">{formatCurrency(sum)}</span>}
                    </p>
                    {missing.length > 0 && <p className="mt-0.5 text-xs text-destructive">Sin stock: {missing.map((m) => m.product.name).join(', ')}</p>}
                  </div>
                  <button onClick={() => addCombo(o)} disabled={missing.length > 0}
                    className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-40">
                    Agregar
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="pt-3 lg:pt-5">
          {combos.length > 0 && <h3 className="mb-1 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:px-0">Productos en oferta</h3>}
          <ul className="divide-y divide-border/60 lg:overflow-hidden lg:rounded-xl lg:bg-card lg:shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {rows.map(({ offer, product }) => {
              const orig = Number(product.salePrice);
              const isPackDeal = offer.type === 'BUY_X_GET_Y' || offer.type === 'BUNDLE_PRICE';
              const units = offer.getQuantity ?? 3;
              const packTotal = offer.type === 'BUNDLE_PRICE' ? Number(offer.value) : orig * (offer.buyQuantity ?? 2);
              const noStock = isPackDeal ? product.currentStock < units : product.currentStock <= 0;
              return (
                <li key={`${offer.id}-${product.id}`} className={cn('flex items-center gap-3 px-4 py-3 lg:px-3', noStock && 'opacity-50')}>
                  <ProductThumb name={product.name} imageUrl={product.imageUrl} className="h-12 w-12 lg:h-10 lg:w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
                      {isPackDeal ? (
                        <>
                          <span className="font-semibold">{units} por {formatCurrency(packTotal)}</span>
                          <span className="text-xs text-muted-foreground line-through">{formatCurrency(orig * units)}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">{formatCurrency(discountedPrice(offer, orig))}</span>
                          <span className="text-xs text-muted-foreground line-through">{formatCurrency(orig)}</span>
                        </>
                      )}
                      <span className="rounded bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">{offerTag(offer)}</span>
                    </p>
                    {noStock && <p className="mt-0.5 text-xs text-destructive">{isPackDeal ? `Necesita ${units}, hay ${product.currentStock}` : 'Sin stock'}</p>}
                  </div>
                  <button onClick={(e) => { e.currentTarget.blur(); addOfferProduct(offer, product); }} disabled={noStock}
                    aria-label={`Agregar ${product.name} con oferta`}
                    className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-semibold text-primary active:scale-95 disabled:opacity-40">
                    {isPackDeal ? `+${units}` : <Plus className="h-5 w-5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
