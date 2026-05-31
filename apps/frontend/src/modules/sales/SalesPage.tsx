import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Receipt, Search, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/services/api';
import { formatCurrency, formatDateTime, STATUS_LABELS } from '@/lib/utils';

interface Sale {
  id: string; saleNumber: string; totalAmount: number; status: string; createdAt: string;
  cashier: { firstName: string; lastName: string };
  customer: { firstName: string; lastName: string } | null;
  payments: Array<{ method: string; amount: number }>;
  _count: { items: number };
}

export function SalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const page = parseInt(searchParams.get('page') ?? '1');

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, search],
    queryFn: async () => {
      const res = await api.get<{ data: Sale[]; pagination: { total: number; totalPages: number } }>(
        `/sales?page=${page}&limit=25`,
      );
      return res.data;
    },
  });

  const statusVariant = (s: string) =>
    s === 'COMPLETED' ? 'success' : s === 'CANCELLED' ? 'destructive' : 'warning';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ventas</h1>
          <p className="text-sm text-muted-foreground">Historial de ventas</p>
        </div>
        <Link to="/pos"><Button><Receipt className="mr-2 h-4 w-4" />Nueva Venta</Button></Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando ventas...</div>
          ) : (data?.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
              <Receipt className="h-12 w-12 opacity-20" />
              <p>No hay ventas registradas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Número</th>
                    <th className="px-4 py-3 text-left font-medium">Cajero</th>
                    <th className="px-4 py-3 text-left font-medium">Cliente</th>
                    <th className="px-4 py-3 text-center font-medium">Ítems</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-center font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.data ?? []).map((sale) => (
                    <tr key={sale.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{sale.saleNumber}</td>
                      <td className="px-4 py-3">{sale.cashier.firstName} {sale.cashier.lastName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">{sale._count.items}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(sale.totalAmount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={statusVariant(sale.status) as 'success' | 'destructive' | 'warning'}>
                          {STATUS_LABELS[sale.status] ?? sale.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(sale.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <Link to={`/sales/${sale.id}`}>
                          <Button variant="ghost" size="icon-sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Página {page} de {data.pagination.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page - 1)); return n; })}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages}
              onClick={() => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('page', String(page + 1)); return n; })}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
