// Resultados de la grilla del POS: filas en celular y tarjetas en tablet/PC.
import { Package } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { ProductThumb } from './ProductThumb';
import { hasPack } from './packSale';
import { useAutoOffers } from './autoOffers';
import { AddButton, OfferBadge, StockNote, type Product } from './ProductParts';

type Offers = ReturnType<typeof useAutoOffers>;

export function ProductResults({ products, isLoading, qtyInCart, happyHourByProductId, offerTags, tapProduct, tapPack }: {
  products: Product[];
  isLoading: boolean;
  qtyInCart: Map<string, number>;
  happyHourByProductId: Offers['deals'];
  offerTags: Offers['tags'];
  tapProduct: (p: Product) => void;
  tapPack: (p: Product) => void;
}) {
  return (
  <div className="flex-1 overflow-y-auto pb-4 sm:pt-3 lg:p-4">
    {isLoading ? (
      <div className="space-y-px px-4 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0 md:grid-cols-4 lg:px-0 xl:grid-cols-5">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl bg-muted/70 sm:h-36" />
        ))}
      </div>
    ) : products.length === 0 ? (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Package className="h-10 w-10 opacity-25" />
        <p className="text-sm">No se encontraron productos</p>
      </div>
    ) : (
      <>
        {/* Celular: filas */}
        <ul className="divide-y divide-border/60 sm:hidden">
          {products.map((product) => {
            const hh = happyHourByProductId.get(product.id);
            const inCart = qtyInCart.get(product.id) ?? 0;
            const packOn = hasPack(product) && !product.isBulk;
            return (
              <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
                  onClick={(e) => { e.currentTarget.blur(); tapProduct(product); }}>
                  <ProductThumb name={product.name} imageUrl={product.imageUrl} className="h-12 w-12" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold tabular-nums">{formatCurrency(hh ? hh.effectivePrice : product.salePrice)}</span>
                      {product.isBulk && <span className="text-muted-foreground">por {product.bulkUnit ?? 'kg'}</span>}
                      {hh && <span className="text-xs text-muted-foreground line-through tabular-nums">{formatCurrency(product.salePrice)}</span>}
                      {(hh || offerTags.has(product.id)) && <OfferBadge>{hh?.label ?? offerTags.get(product.id)}</OfferBadge>}
                      <StockNote product={product} />
                    </span>
                  </span>
                </button>
                {packOn && (
                  <button onClick={(e) => { e.currentTarget.blur(); tapPack(product); }}
                    title={`Agregar ${(product.packLabel || 'paquete').toLowerCase()} de ${product.packSize} unidades`}
                    className="shrink-0 rounded-lg bg-muted px-2 py-1.5 text-center text-[11px] font-medium leading-tight active:scale-95">
                    {product.packLabel || 'Paq'} x{product.packSize}<br />
                    <span className="font-semibold tabular-nums">{formatCurrency(Number(product.packPrice))}</span>
                  </button>
                )}
                <AddButton count={inCart} onClick={() => tapProduct(product)} />
              </li>
            );
          })}
        </ul>

        {/* Tablet / PC: grilla compacta */}
        <div className="hidden gap-3 px-4 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:px-0 xl:grid-cols-5 2xl:grid-cols-6">
          {products.map((product) => {
            const hh = happyHourByProductId.get(product.id);
            const inCart = qtyInCart.get(product.id) ?? 0;
            const packOn = hasPack(product) && !product.isBulk;
            const packOk = packOn && product.currentStock >= (product.packSize ?? 0);
            return (
              <div key={product.id} className={cn(
                'group flex flex-col rounded-xl bg-card p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] transition-shadow hover:shadow-md dark:ring-white/5',
                inCart > 0 && 'ring-2 ring-primary/50',
              )}>
                <button className="flex flex-1 flex-col text-left focus-visible:outline-none"
                  onClick={(e) => { e.currentTarget.blur(); tapProduct(product); }}>
                  {product.imageUrl && <ProductThumb name={product.name} imageUrl={product.imageUrl} className="mb-2 h-20 w-full lg:h-16" />}
                  <span className="line-clamp-2 min-h-[2.4em] text-sm font-medium leading-tight">{product.name}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="min-w-0 truncate text-sm font-semibold tabular-nums">
                      {formatCurrency(hh ? hh.effectivePrice : product.salePrice)}
                      {product.isBulk && <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/{product.bulkUnit ?? 'kg'}</span>}
                    </span>
                    {inCart > 0
                      ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">{Number(inCart.toFixed(2))}</span>
                      : <StockNote product={product} compact />}
                  </span>
                  {(hh || offerTags.has(product.id)) && (
                    <span className="mt-1 flex items-center gap-1.5 text-[11px]">
                      <OfferBadge>{hh?.label ?? offerTags.get(product.id)}</OfferBadge>
                      {hh && <span className="text-muted-foreground line-through tabular-nums">{formatCurrency(product.salePrice)}</span>}
                    </span>
                  )}
                </button>
                {packOn && (
                  <button onClick={(e) => { e.currentTarget.blur(); tapPack(product); }}
                    title={`Agregar ${(product.packLabel || 'paquete').toLowerCase()} de ${product.packSize} unidades`}
                    className={cn('mt-2 flex items-center justify-between rounded-lg bg-muted/70 px-2 py-1 text-[11px] font-medium hover:bg-muted', !packOk && 'opacity-50')}>
                    <span className="truncate">{product.packLabel || 'Paq'} x{product.packSize}</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(Number(product.packPrice))}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </>
    )}
  </div>
  );
}
