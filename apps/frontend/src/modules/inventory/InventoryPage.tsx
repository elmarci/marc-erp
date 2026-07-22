import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp, ArrowDown, Search, Plus, X, AlertTriangle, Package,
  BarChart3, ClipboardList, History, TrendingDown, DollarSign,
  ChevronDown, ChevronUp, Printer, ScanBarcode,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface DashboardData {
  kpis: { totalProducts: number; outOfStock: number; lowStock: number; costValue: number; saleValue: number; margin: number };
  byCategory: Array<{ category: string; products: number; totalStock: number; costValue: number; saleValue: number }>;
  recentMovements: Array<{ id: string; type: string; quantity: number; quantityBefore: number; quantityAfter: number; createdAt: string; product: { name: string } }>;
}
interface StockProduct {
  id: string; name: string; barcode: string | null; sku: string | null;
  current_stock: number; min_stock: number; max_stock: number | null;
  cost_price: number; sale_price: number; category: string; category_id: string;
  last_movement: string | null; stockStatus: 'ok' | 'low' | 'out'; stockValue: number;
}
interface Movement {
  id: string; type: string; quantity: number; quantityBefore: number; quantityAfter: number;
  unitCost: number | null; referenceType: string | null; notes: string | null; createdAt: string;
  product: { id: string; name: string; barcode: string | null };
}
interface Adjustment {
  id: string; reason: string; notes: string | null; createdAt: string;
  user: { firstName: string; lastName: string };
  _count: { items: number };
  items: Array<{ productId: string; productName: string; systemQuantity: number; physicalQuantity: number; difference: number }>;
}
interface Category { id: string; name: string }

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const MOV_LABELS: Record<string, string> = {
  PURCHASE_IN: 'Compra', SALE_OUT: 'Venta', ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste −', RETURN_IN: 'Devolución E', RETURN_OUT: 'Devolución S',
  INITIAL_STOCK: 'Stock inicial', LOSS: 'Pérdida', EXPIRY: 'Vencimiento',
};
const isEntry = (t: string) => ['PURCHASE_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'INITIAL_STOCK', 'TRANSFER_IN'].includes(t);

const STATUS_LABEL: Record<string, string> = { ok: 'Normal', low: 'Stock bajo', out: 'Sin stock' };
const STATUS_VARIANT: Record<string, 'success' | 'default' | 'destructive'> = { ok: 'success', low: 'default', out: 'destructive' };

/* ─── Quick Adjust Modal ─────────────────────────────────────────────────── */
function QuickAdjustModal({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(String(product.current_stock));
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory/quick-adjust', {
      productId: product.id, newQuantity: Number(qty), reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inv-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['inv-movements'] });
      toast.success(`Stock de "${product.name}" actualizado a ${qty} unidades.`);
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const diff = Number(qty) - product.current_stock;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-semibold">Ajuste rápido</h3>
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{product.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex justify-between rounded-lg bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Stock actual</span>
            <span className="font-bold">{product.current_stock} uds</span>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nuevo stock (uds)</label>
            <Input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)}
              className="text-xl font-bold text-center" autoFocus />
            {qty !== '' && diff !== 0 && (
              <p className={cn('text-center text-sm mt-1.5 font-medium', diff > 0 ? 'text-success' : 'text-destructive')}>
                {diff > 0 ? `+${diff}` : diff} unidades respecto al sistema
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Motivo *</label>
            <Input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Ej: Conteo físico, merma, rotura..." />
          </div>
        </div>
        <div className="border-t p-4 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={mutation.isPending}
            disabled={!reason || qty === '' || Number(qty) < 0 || diff === 0}
            onClick={() => mutation.mutate()}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Bulk Adjust Modal ──────────────────────────────────────────────────── */
function BulkAdjustModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; name: string; systemQty: number; physicalQty: number }>>([]);

  const { data: products } = useQuery({
    queryKey: ['products-adj-search', search],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; currentStock: number }> }>(`/products?q=${search}&limit=15`)).data.data,
    enabled: search.length >= 2,
  });

  const addProduct = (p: { id: string; name: string; currentStock: number }) => {
    if (items.find(i => i.productId === p.id)) return;
    setItems(v => [...v, { productId: p.id, name: p.name, systemQty: p.currentStock, physicalQty: p.currentStock }]);
    setSearch('');
  };

  // Escanear código de barras agrega directo (sin pasar por la lista de
  // coincidencias) — mucho más rápido para un conteo físico con lector.
  const handleScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = e.currentTarget.value.trim();
    if (!/^\d{8,}$/.test(value)) return;
    try {
      const res = await api.get<{ data: { id: string; name: string; currentStock: number } }>(`/products/barcode/${value}`);
      addProduct(res.data.data);
    } catch {
      toast.error(`No se encontró ningún producto con código ${value}.`);
    }
  };

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory/adjustments', {
      reason, notes: notes || undefined,
      items: items.map(i => ({ productId: i.productId, physicalQuantity: i.physicalQty })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inv-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['inv-adjustments'] });
      toast.success('Ajuste de inventario aplicado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const changedCount = items.filter(i => i.physicalQty !== i.systemQty).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">Ajuste masivo de inventario</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Motivo *</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Conteo físico mensual, merma..." />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Observaciones</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalles adicionales..." />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Agregar producto</label>
            <div className="relative">
              <ScanBarcode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar o escanear código de barras..." value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={handleScanKeyDown} />
            </div>
            {products && products.length > 0 && search.length >= 2 && (
              <div className="border rounded-lg mt-1 divide-y max-h-36 overflow-y-auto bg-popover shadow-lg">
                {products.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                    <span>{p.name}</span><span className="text-muted-foreground">Stock: {p.currentStock}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium text-center w-24">Sistema</th>
                <th className="py-2 font-medium text-center w-28">Físico</th>
                <th className="py-2 font-medium text-center w-20">Dif.</th>
                <th className="w-8" />
              </tr></thead>
              <tbody className="divide-y">
                {items.map((item, idx) => {
                  const diff = item.physicalQty - item.systemQty;
                  return (
                    <tr key={item.productId}>
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-center text-muted-foreground">{item.systemQty}</td>
                      <td className="py-2 px-2">
                        <Input type="number" min={0} value={item.physicalQty}
                          onChange={e => setItems(v => v.map((i, n) => n === idx ? { ...i, physicalQty: Number(e.target.value) } : i))}
                          className="h-8 text-center" />
                      </td>
                      <td className={cn('py-2 text-center font-bold text-sm', diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-success' : 'text-destructive')}>
                        {diff > 0 ? '+' : ''}{diff}
                      </td>
                      <td><Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setItems(v => v.filter((_, n) => n !== idx))}><X className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {changedCount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <AlertTriangle className="inline h-4 w-4 mr-1" />{changedCount} producto(s) con cambios. Acción irreversible.
            </div>
          )}
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button loading={mutation.isPending}
            disabled={!reason || items.length === 0 || changedCount === 0}
            onClick={() => mutation.mutate()}>
            Aplicar ajuste ({changedCount} cambios)
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Dashboard ─────────────────────────────────────────────────────── */
function DashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['inv-dashboard'],
    queryFn: async () => (await api.get<{ data: DashboardData }>('/inventory/dashboard')).data.data,
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Cargando...</div>;
  if (!data) return null;

  const { kpis, byCategory, recentMovements } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Productos activos', value: kpis.totalProducts, color: 'text-foreground', icon: Package },
          { label: 'Sin stock', value: kpis.outOfStock, color: 'text-destructive', icon: AlertTriangle },
          { label: 'Stock bajo', value: kpis.lowStock, color: 'text-amber-500', icon: TrendingDown },
          { label: 'Valor al costo', value: formatCurrency(kpis.costValue), color: 'text-primary', icon: DollarSign },
          { label: 'Valor al precio', value: formatCurrency(kpis.saleValue), color: 'text-success', icon: DollarSign },
          { label: 'Margen potencial', value: formatCurrency(kpis.margin), color: 'text-amber-500', icon: BarChart3 },
        ].map(({ label, value, color, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <Icon className={cn('h-4 w-4 mb-2', color)} />
              <p className={cn('text-xl font-bold', color)}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Por categoría */}
        <Card>
          <CardHeader><CardTitle className="text-base">Valor por categoría (costo)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v: number) => `S/${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="costValue" name="Valor costo" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Movimientos recientes */}
        <Card>
          <CardHeader><CardTitle className="text-base">Últimos movimientos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[230px] overflow-y-auto">
              {recentMovements.map(m => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <p className="font-medium truncate max-w-[180px]">{m.product.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <Badge variant={isEntry(m.type) ? 'success' : 'destructive'} className="text-xs">
                      {MOV_LABELS[m.type] ?? m.type}
                    </Badge>
                    <span className={cn('text-xs font-bold', isEntry(m.type) ? 'text-success' : 'text-destructive')}>
                      {isEntry(m.type) ? '+' : '-'}{m.quantity} → {m.quantityAfter}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla por categoría */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resumen por categoría</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-center">Productos</th>
              <th className="px-4 py-3 font-medium text-right">Unidades</th>
              <th className="px-4 py-3 font-medium text-right">Valor costo</th>
              <th className="px-4 py-3 font-medium text-right">Valor venta</th>
              <th className="px-4 py-3 font-medium text-right">Margen</th>
            </tr></thead>
            <tbody className="divide-y">
              {byCategory.map(c => (
                <tr key={c.category} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.category}</td>
                  <td className="px-4 py-3 text-center">{c.products}</td>
                  <td className="px-4 py-3 text-right">{c.totalStock}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(c.costValue)}</td>
                  <td className="px-4 py-3 text-right text-success font-medium">{formatCurrency(c.saleValue)}</td>
                  <td className="px-4 py-3 text-right text-amber-500 font-medium">{formatCurrency(c.saleValue - c.costValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Tab: Stock ─────────────────────────────────────────────────────────── */
function StockTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'ok' | 'low' | 'out'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [adjustProduct, setAdjustProduct] = useState<StockProduct | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ data: Category[] }>('/categories')).data.data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['inv-stock', search, status, categoryId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);
      if (categoryId) params.set('categoryId', categoryId);
      return (await api.get<{ data: StockProduct[]; pagination: { total: number; totalPages: number } }>(`/inventory/stock?${params}`)).data;
    },
  });

  const printStock = () => {
    const rows = (data?.data ?? []).map(p =>
      `<tr style="border-bottom:1px solid #eee">
        <td style="padding:6px 8px">${p.name}</td>
        <td style="padding:6px 8px">${p.barcode ?? '—'}</td>
        <td style="padding:6px 8px">${p.category}</td>
        <td style="padding:6px 8px;text-align:center;font-weight:bold;color:${p.stockStatus === 'out' ? '#dc2626' : p.stockStatus === 'low' ? '#d97706' : '#16a34a'}">${p.current_stock}</td>
        <td style="padding:6px 8px;text-align:center">${p.min_stock}</td>
        <td style="padding:6px 8px;text-align:right">S/ ${p.cost_price.toFixed(2)}</td>
        <td style="padding:6px 8px;text-align:right">S/ ${p.stockValue.toFixed(2)}</td>
      </tr>`
    ).join('');
    const win = window.open('', '_blank', 'width=900,height=600');
    if (!win) return;
    win.document.write(`<html><head><title>Reporte de Stock</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:8px;text-align:left}
      .header{display:flex;justify-content:space-between;margin-bottom:16px}</style></head><body>
      <div class="header"><h2 style="margin:0">Reporte de Stock — MARC</h2><span>${new Date().toLocaleString('es-PE')}</span></div>
      <table><thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th>Stock actual</th><th>Mín.</th><th>Costo unit.</th><th>Valor total</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
    win.document.close(); win.focus(); win.print();
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar producto o código..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="all">Todo el stock</option>
          <option value="ok">Stock normal</option>
          <option value="low">Stock bajo</option>
          <option value="out">Sin stock</option>
        </select>
        <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">Todas las categorías</option>
          {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button variant="outline" onClick={printStock}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
      </div>

      {/* Tabla */}
      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium text-center">Stock</th>
                <th className="px-4 py-3 font-medium text-center">Mín.</th>
                <th className="px-4 py-3 font-medium text-center">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Valor total</th>
                <th className="px-4 py-3 font-medium text-right">Últ. movimiento</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y">
                {(data?.data ?? []).map(p => (
                  <tr key={p.id} className={cn('hover:bg-muted/30', p.stockStatus === 'out' ? 'bg-destructive/5' : p.stockStatus === 'low' ? 'bg-amber-500/5' : '')}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.barcode ?? p.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                    <td className={cn('px-4 py-3 text-center font-bold text-base', p.stockStatus === 'out' ? 'text-destructive' : p.stockStatus === 'low' ? 'text-amber-500' : 'text-success')}>
                      {p.current_stock}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{p.min_stock}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={STATUS_VARIANT[p.stockStatus]}>{STATUS_LABEL[p.stockStatus]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(p.cost_price)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.stockValue)}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {p.last_movement ? formatDateTime(p.last_movement) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" onClick={() => setAdjustProduct(p)}>
                        Ajustar
                      </Button>
                    </td>
                  </tr>
                ))}
                {(data?.data ?? []).length === 0 && (
                  <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">No se encontraron productos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total: {data.pagination.total} productos</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>

      {adjustProduct && <QuickAdjustModal product={adjustProduct} onClose={() => setAdjustProduct(null)} />}
    </div>
  );
}

/* ─── Tab: Movimientos ───────────────────────────────────────────────────── */
function MovementsTab() {
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['inv-movements', typeFilter, fromDate, toDate, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (typeFilter) params.set('type', typeFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      return (await api.get<{ data: Movement[]; pagination: { total: number; totalPages: number } }>(`/inventory/movements?${params}`)).data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">Todos los tipos</option>
          {Object.entries(MOV_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Desde</span>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <span className="text-sm text-muted-foreground">hasta</span>
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {(typeFilter || fromDate || toDate) && (
          <Button variant="ghost" size="sm" onClick={() => { setTypeFilter(''); setFromDate(''); setToDate(''); setPage(1); }}>
            <X className="mr-1 h-3.5 w-3.5" />Limpiar filtros
          </Button>
        )}
      </div>

      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-center">Cantidad</th>
                <th className="px-4 py-3 font-medium text-center">Antes</th>
                <th className="px-4 py-3 font-medium text-center">Después</th>
                <th className="px-4 py-3 font-medium text-right">Costo unit.</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
              </tr></thead>
              <tbody className="divide-y">
                {(data?.data ?? []).map(m => {
                  const entry = isEntry(m.type);
                  return (
                    <tr key={m.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{m.product.name}</p>
                        {m.product.barcode && <p className="text-xs text-muted-foreground font-mono">{m.product.barcode}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={entry ? 'success' : 'destructive'} className="text-xs">{MOV_LABELS[m.type] ?? m.type}</Badge>
                      </td>
                      <td className={cn('px-4 py-3 text-center font-bold', entry ? 'text-success' : 'text-destructive')}>
                        {entry ? <ArrowUp className="inline h-3 w-3 mr-0.5" /> : <ArrowDown className="inline h-3 w-3 mr-0.5" />}
                        {m.quantity}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{m.quantityBefore}</td>
                      <td className="px-4 py-3 text-center font-semibold">{m.quantityAfter}</td>
                      <td className="px-4 py-3 text-right">{m.unitCost ? formatCurrency(m.unitCost) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{m.notes ?? m.referenceType ?? '—'}</td>
                    </tr>
                  );
                })}
                {(data?.data ?? []).length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No hay movimientos con estos filtros</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total: {data.pagination.total} movimientos</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Tab: Ajustes ───────────────────────────────────────────────────────── */
function AdjustmentsTab() {
  const [page, setPage] = useState(1);
  const [showBulk, setShowBulk] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['inv-adjustments', page],
    queryFn: async () => (await api.get<{ data: Adjustment[]; pagination: { total: number; totalPages: number } }>(`/inventory/adjustments?page=${page}&limit=20`)).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowBulk(true)}>
          <Plus className="mr-2 h-4 w-4" />Nuevo ajuste masivo
        </Button>
      </div>
      <Card>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Realizado por</th>
                <th className="px-4 py-3 font-medium text-center">Productos</th>
                <th className="px-4 py-3 w-20" />
              </tr></thead>
              <tbody className="divide-y">
                {(data?.data ?? []).map(adj => (
                  <>
                    <tr key={adj.id} className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpanded(expanded === adj.id ? null : adj.id)}>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateTime(adj.createdAt)}</td>
                      <td className="px-4 py-3 font-medium">{adj.reason}</td>
                      <td className="px-4 py-3">{adj.user.firstName} {adj.user.lastName}</td>
                      <td className="px-4 py-3 text-center">{adj._count.items}</td>
                      <td className="px-4 py-3 text-right">
                        {expanded === adj.id ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                      </td>
                    </tr>
                    {expanded === adj.id && (
                      <tr key={`${adj.id}-d`}>
                        <td colSpan={5} className="bg-muted/20 px-6 py-4">
                          <table className="w-full text-sm">
                            <thead><tr className="text-xs text-muted-foreground border-b">
                              <th className="py-1 text-left font-medium">Producto</th>
                              <th className="py-1 text-center font-medium">Sistema</th>
                              <th className="py-1 text-center font-medium">Físico</th>
                              <th className="py-1 text-center font-medium">Diferencia</th>
                            </tr></thead>
                            <tbody>
                              {adj.items.map(item => (
                                <tr key={item.productId}>
                                  <td className="py-1.5">{item.productName}</td>
                                  <td className="py-1.5 text-center">{item.systemQuantity}</td>
                                  <td className="py-1.5 text-center">{item.physicalQuantity}</td>
                                  <td className={cn('py-1.5 text-center font-bold',
                                    item.difference === 0 ? 'text-muted-foreground' : item.difference > 0 ? 'text-success' : 'text-destructive')}>
                                    {item.difference > 0 ? '+' : ''}{item.difference}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {(data?.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">No hay ajustes registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total: {data.pagination.total} ajustes</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </Card>
      {showBulk && <BulkAdjustModal onClose={() => setShowBulk(false)} />}
    </div>
  );
}

/* ─── Tab: Alertas ───────────────────────────────────────────────────────── */
function AlertsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['inv-low-stock'],
    queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string; barcode: string | null; current_stock: number; min_stock: number; category: string }> }>('/inventory/low-stock')).data.data,
    refetchInterval: 60000,
  });

  const outOfStock = (data ?? []).filter(p => p.current_stock === 0);
  const lowStock = (data ?? []).filter(p => p.current_stock > 0);

  return (
    <div className="space-y-4">
      {isLoading ? <div className="py-12 text-center text-muted-foreground">Cargando...</div> : (
        <>
          {outOfStock.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />Sin stock — {outOfStock.length} producto(s)
              </CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-destructive/5"><th className="px-4 py-2 text-left font-medium">Producto</th><th className="px-4 py-2 text-left font-medium">Categoría</th><th className="px-4 py-2 text-center font-medium">Stock mín.</th></tr></thead>
                  <tbody className="divide-y">
                    {outOfStock.map(p => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3"><p className="font-medium">{p.name}</p>{p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                        <td className="px-4 py-3 text-center font-bold text-destructive">0 / {p.min_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2 text-amber-500">
              <TrendingDown className="h-4 w-4" />Stock bajo — {lowStock.length} producto(s)
            </CardTitle></CardHeader>
            <CardContent className="p-0">
              {lowStock.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Package className="h-10 w-10 opacity-20" />
                  <p>¡Todo el stock está en niveles normales!</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-amber-500/5">
                    <th className="px-4 py-2 text-left font-medium">Producto</th>
                    <th className="px-4 py-2 text-left font-medium">Categoría</th>
                    <th className="px-4 py-2 text-center font-medium">Stock actual</th>
                    <th className="px-4 py-2 text-center font-medium">Mínimo</th>
                    <th className="px-4 py-2 text-center font-medium">% del mínimo</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {lowStock.map(p => {
                      const pct = Math.round((p.current_stock / p.min_stock) * 100);
                      return (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3"><p className="font-medium">{p.name}</p>{p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                          <td className="px-4 py-3 text-center font-bold text-amber-500">{p.current_stock}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{p.min_stock}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function InventoryPage() {
  const [tab, setTab] = useState<'dashboard' | 'stock' | 'movements' | 'adjustments' | 'alerts'>('dashboard');

  const { data: alertCount } = useQuery({
    queryKey: ['inv-low-stock-count'],
    queryFn: async () => (await api.get<{ data: unknown[] }>('/inventory/low-stock')).data.data.length,
    refetchInterval: 60000,
  });

  const tabs = [
    { key: 'dashboard', icon: BarChart3, label: 'Resumen' },
    { key: 'stock', icon: Package, label: 'Stock actual' },
    { key: 'movements', icon: History, label: 'Movimientos' },
    { key: 'adjustments', icon: ClipboardList, label: 'Ajustes' },
    { key: 'alerts', icon: AlertTriangle, label: 'Alertas' },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <p className="text-sm text-muted-foreground">Control de stock, movimientos, ajustes y valorización</p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{label}
            {key === 'alerts' && alertCount != null && alertCount > 0 && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs">{alertCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'stock' && <StockTab />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'adjustments' && <AdjustmentsTab />}
      {tab === 'alerts' && <AlertsTab />}
    </div>
  );
}
