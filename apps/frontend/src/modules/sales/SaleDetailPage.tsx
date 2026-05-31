import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { useState } from 'react';
import { ReceiptModal, type ReceiptData } from '@/modules/pos/ReceiptModal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasMinRole } = useAuthStore();

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const res = await api.get<{ data: unknown }>(`/sales/${id}`);
      return res.data.data as {
        id: string; saleNumber: string; totalAmount: number; subtotal: number; taxAmount: number;
        discountAmount: number; status: string; createdAt: string; documentType: string; notes: string | null;
        cashier: { firstName: string; lastName: string };
        customer: { firstName: string; lastName: string } | null;
        items: Array<{ id: string; productName: string; quantity: number; unitPrice: number; subtotal: number }>;
        payments: Array<{ method: string; amount: number }>;
      };
    },
  });

  const [showReceipt, setShowReceipt] = useState(false);

  const voidMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/sales/${id}/void`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      toast.success('Venta anulada.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;
  if (!sale) return <div className="p-8 text-center text-muted-foreground">Venta no encontrada</div>;

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{sale.saleNumber}</h1>
            <p className="text-sm text-muted-foreground">{formatDateTime(sale.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={sale.status === 'COMPLETED' ? 'success' : 'destructive'}>
            {STATUS_LABELS[sale.status] ?? sale.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setShowReceipt(true)}>
            <Printer className="mr-2 h-4 w-4" />Ticket
          </Button>
          {hasMinRole('SUPERVISOR') && sale.status === 'COMPLETED' && (
            <Button variant="destructive" size="sm"
              onClick={() => {
                const reason = window.prompt('Motivo de anulación:');
                if (reason) voidMutation.mutate(reason);
              }}>
              <Ban className="mr-2 h-4 w-4" />Anular
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Información</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cajero</span>
              <span>{sale.cashier.firstName} {sale.cashier.lastName}</span></div>
            {sale.customer && <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span>
              <span>{sale.customer.firstName} {sale.customer.lastName}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Documento</span>
              <span>{sale.documentType}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Pagos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sale.payments.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                <span className="font-medium">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Productos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Producto</th>
                <th className="px-4 py-2 text-right font-medium">Cant.</th>
                <th className="px-4 py-2 text-right font-medium">Precio</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">{item.productName}</td>
                  <td className="px-4 py-2 text-right">{Number(item.quantity)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t p-4 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{formatCurrency(sale.subtotal)}</span></div>
            {Number(sale.discountAmount) > 0 && <div className="flex justify-between text-success">
              <span>Descuento</span><span>-{formatCurrency(sale.discountAmount)}</span></div>}
            <div className="flex justify-between text-muted-foreground">
              <span>IGV</span><span>{formatCurrency(sale.taxAmount)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-1">
              <span>TOTAL</span><span>{formatCurrency(sale.totalAmount)}</span></div>
          </div>
        </CardContent>
      </Card>
      {showReceipt && (
        <ReceiptModal
          data={{
            saleNumber: sale.saleNumber,
            createdAt: sale.createdAt,
            cashierName: `${sale.cashier.firstName} ${sale.cashier.lastName}`,
            customerName: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : null,
            documentType: sale.documentType,
            notes: sale.notes,
            items: sale.items.map(i => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
            subtotal: sale.subtotal,
            discountAmount: sale.discountAmount,
            taxAmount: sale.taxAmount,
            totalAmount: sale.totalAmount,
            payments: sale.payments,
          } as ReceiptData}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
