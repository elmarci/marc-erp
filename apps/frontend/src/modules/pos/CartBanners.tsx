// Avisos del carrito cuando hay cliente: cupón disponible o puntos para canjear.
import { useQuery } from '@tanstack/react-query';
import { Ticket, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency } from '@/lib/utils';
import { api } from '@/services/api';

interface CustomerCoupon { id: string; code: string; discountPercent: number; expiresAt: string }

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'America/Lima' });
}

/* ─── Cupón de descuento del cliente asignado ────────────────────────────── */
export function CouponBanner({ customerId }: { customerId: string }) {
  const { couponCode, pointsToRedeem, setCoupon } = usePosStore();

  const { data: coupons } = useQuery({
    queryKey: ['customer-coupons', customerId],
    queryFn: async () => (await api.get<{ data: CustomerCoupon[] }>(`/coupons?customerId=${customerId}`)).data.data,
  });

  const available = (coupons ?? []).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))[0];

  if (couponCode) {
    return (
      <div className="flex items-center justify-between border-b bg-ok/10 px-4 py-2">
        <span className="text-xs font-medium text-ok-ink flex items-center gap-1.5">
          <Ticket className="h-3.5 w-3.5" />
          Cupón {couponCode} aplicado (-{usePosStore.getState().couponDiscountPercent}%)
        </span>
        <button onClick={() => setCoupon(null, 0)} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Excluyente con los puntos: si ya se están canjeando puntos, no ofrecer el cupón.
  if (!available || pointsToRedeem > 0) return null;

  return (
    <div className="flex items-center justify-between border-b bg-warn/10 px-4 py-2">
      <span className="text-xs font-medium text-warn-ink flex items-center gap-1.5">
        <Ticket className="h-3.5 w-3.5" />
        Cupón {available.discountPercent}% disponible · vence {formatShortDate(available.expiresAt)}
      </span>
      <Button size="sm" variant="outline" className="h-6 text-xs px-2"
        onClick={() => setCoupon(available.code, available.discountPercent)}>
        Aplicar
      </Button>
    </div>
  );
}

/* ─── Puntos de fidelización del cliente asignado ────────────────────────── */
export function LoyaltyPointsBanner({ customerId }: { customerId: string }) {
  const { couponCode, pointsToRedeem, subtotal, setPointsRedemption } = usePosStore();

  const { data: customer } = useQuery({
    queryKey: ['customer-loyalty', customerId],
    queryFn: async () => (await api.get<{ data: { loyaltyPoints: number } }>(`/customers/${customerId}`)).data.data,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ data: Array<{ key: string; value: string }> }>('/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const pointValue = Number(settings?.find(s => s.key === 'loyalty_point_value')?.value ?? 0.05);
  const points = customer?.loyaltyPoints ?? 0;

  if (pointsToRedeem > 0) {
    return (
      <div className="flex items-center justify-between border-b bg-ok/10 px-4 py-2">
        <span className="text-xs font-medium text-ok-ink flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" />
          {pointsToRedeem} puntos canjeados (-{formatCurrency(pointsToRedeem * pointValue)})
        </span>
        <button onClick={() => setPointsRedemption(0, 0)} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // Excluyente con el cupón, y no tiene sentido si no hay puntos o no alcanzan para nada.
  if (couponCode || points <= 0) return null;

  // No se puede canjear más de lo que cubre el subtotal actual.
  const usablePoints = Math.min(points, Math.floor(subtotal / pointValue));
  if (usablePoints <= 0) return null;

  return (
    <div className="flex items-center justify-between border-b bg-warn/10 px-4 py-2">
      <span className="text-xs font-medium text-warn-ink flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5" />
        {points} puntos disponibles (equivalen a {formatCurrency(points * pointValue)})
      </span>
      <Button size="sm" variant="outline" className="h-6 text-xs px-2"
        onClick={() => setPointsRedemption(usablePoints, usablePoints * pointValue)}>
        Canjear
      </Button>
    </div>
  );
}
