import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Play, QrCode, Radio, RotateCcw, ShoppingBasket, Tag, Tv, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/services/api';
import { cn } from '@/lib/utils';
import { useTvLiveStore } from '@/stores/tvLiveStore';
import { pushTvCart } from './tvCartSync';

interface Option { key: string; type: 'OFFER' | 'PRODUCTS' | 'APP' | 'CUSTOM'; label: string; thumb: string | null; isActive: boolean }
interface LiveState { mode: 'AUTO' | 'ONLY' | 'CART'; keys: string[]; hasImage: boolean; cartItems: number }

const ICONS = { OFFER: Tag, PRODUCTS: ShoppingBasket, APP: QrCode, CUSTOM: Megaphone };

// Control de la TV de la tienda desde el punto de venta: mostrar al cliente su
// compra en vivo con promos al lado, o fijar una promo concreta en la pantalla.
export function TvLiveModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enabled, promoKeys, setEnabled, setPromoKeys } = useTvLiveStore();

  const { data: options } = useQuery({
    queryKey: ['pos-tv-options'],
    queryFn: async () => (await api.get<{ data: Option[] }>('/tv/live/options')).data.data,
  });
  const { data: live } = useQuery({
    queryKey: ['pos-tv-state'],
    queryFn: async () => (await api.get<{ data: LiveState }>('/tv/live/state')).data.data,
    refetchInterval: 4000,
  });

  const refreshState = () => queryClient.invalidateQueries({ queryKey: ['pos-tv-state'] });

  const toggleSync = async () => {
    if (enabled) {
      setEnabled(false);
      try { await api.delete('/tv/live'); } catch (err) { toast.error(getErrorMessage(err)); }
      refreshState();
      toast.success('La TV volvió al automático.');
    } else {
      setEnabled(true);
      // Se manda de inmediato para que la TV cambie sin esperar al próximo cambio del carrito.
      window.setTimeout(() => { pushTvCart(); refreshState(); }, 50);
      toast.success('La TV mostrará la venta en curso al cliente.');
    }
  };

  const togglePromo = (key: string) => {
    setPromoKeys(promoKeys.includes(key) ? promoKeys.filter((k) => k !== key) : [...promoKeys, key]);
  };

  const showNow = async (key: string) => {
    try {
      // Fijar una slide y mostrar la venta se pisan entre sí: gana lo último que el cajero eligió.
      setEnabled(false);
      await api.put('/tv/live/only', { keys: [key], minutes: 15 });
      refreshState();
      toast.success('Esa promo quedó fija en la TV por 15 minutos.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const backToAuto = async () => {
    setEnabled(false);
    try { await api.delete('/tv/live'); refreshState(); toast.success('La TV volvió al automático.'); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const status = !live || live.mode === 'AUTO' ? 'Automático'
    : live.mode === 'CART' ? (live.cartItems > 0 ? `Mostrando la venta (${live.cartItems} productos)` : 'Pantalla del cliente activada')
    : 'Una promo fija en pantalla';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="flex items-center gap-2 font-bold"><Tv className="h-5 w-5 text-primary" />Pantalla TV</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className={cn('h-3 w-3', live && live.mode !== 'AUTO' && 'animate-pulse text-red-500')} />Ahora: {status}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          <div className={cn('rounded-xl border p-4', enabled && 'border-primary bg-primary/5')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Mostrar la venta al cliente</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  La TV enseña los productos que vas pasando, con el total en grande. Al cobrar sale «¡Gracias por tu compra!»
                  y vuelve a las promos.
                </p>
              </div>
              <button type="button" role="switch" aria-checked={enabled} onClick={toggleSync}
                className={cn('relative h-7 min-h-0 w-12 shrink-0 rounded-full transition-colors', enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30')}>
                <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', enabled ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold">Promos al lado de la venta</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Marca las que quieres que vea el cliente mientras ve su compra. Sin marcar, la TV sigue con su rotación normal cuando no hay venta.
            </p>
            <div className="space-y-1.5">
              {(options ?? []).map((o) => {
                const Icon = ICONS[o.type];
                const on = promoKeys.includes(o.key);
                return (
                  <div key={o.key} className={cn('flex items-center gap-3 rounded-lg border p-2', on && 'border-primary bg-primary/5')}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={on} onChange={() => togglePromo(o.key)} className="h-4 w-4 min-h-0 min-w-0 rounded border-input" />
                      <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                        {o.thumb ? <img src={o.thumb} alt="" className="h-full w-full object-cover" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <span className="truncate text-sm font-medium">{o.label}</span>
                    </label>
                    <Button variant="outline" size="sm" title="Fijar solo esta en la TV ahora" onClick={() => showNow(o.key)}>
                      <Play className="mr-1 h-3.5 w-3.5" />Ahora
                    </Button>
                  </div>
                );
              })}
              {options && options.length === 0 && <p className="text-sm text-muted-foreground">No hay slides configuradas en Pantalla TV.</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <Button variant="outline" onClick={backToAuto}><RotateCcw className="mr-1.5 h-4 w-4" />Volver al automático</Button>
          <Button onClick={onClose}>Listo</Button>
        </div>
      </div>
    </div>
  );
}
