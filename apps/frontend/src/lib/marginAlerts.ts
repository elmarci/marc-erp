import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

// Alerta de margen bajo (frutas, verduras y granel): el backend la calcula con
// el último costo de compra contra el precio de venta actual. Solo avisa — el
// precio de venta nunca se toca solo.
export interface MarginAlert {
  productId: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  lastPurchaseCost: number;
  lastPurchaseAt: string | null;
  salePrice: number;
  margin: number;
  minMargin: number;
  suggestedPrice: number;
  severity: 'LOW' | 'LOSS';
}

// Aviso inmediato al registrar/recibir una compra: justo cuando se paga el
// costo nuevo es cuando hay que decidir si se sube el precio.
export function notifyMarginAlerts(alerts: MarginAlert[] | undefined) {
  if (!alerts || alerts.length === 0) return;
  for (const a of alerts.slice(0, 4)) {
    const loss = a.severity === 'LOSS';
    toast.warning(
      loss ? `${a.name}: estás vendiendo con pérdida` : `${a.name}: margen bajo`,
      {
        description: `Costo ${formatCurrency(a.lastPurchaseCost)} · Venta ${formatCurrency(a.salePrice)} → margen ${formatCurrency(a.margin)} por ${a.unit} (mínimo ${formatCurrency(a.minMargin)}). Sugerido: ${formatCurrency(a.suggestedPrice)}.`,
        duration: 15000,
        action: { label: 'Editar precio', onClick: () => window.location.assign(`/products/${a.productId}/edit`) },
      },
    );
  }
  if (alerts.length > 4) {
    toast.warning(`${alerts.length - 4} producto(s) más con margen bajo`, {
      description: 'Revísalos en Inventario → Alertas.',
      duration: 15000,
    });
  }
}
