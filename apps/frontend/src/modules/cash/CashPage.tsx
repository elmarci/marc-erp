import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, Plus, Minus, X, ChevronDown, ChevronUp, TrendingUp,
  TrendingDown, Clock, CheckCircle, ArrowDownUp, ShoppingCart, Printer, FileSpreadsheet, PackageOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency, formatDateTime, PAYMENT_METHOD_LABELS, cn } from '@/lib/utils';
import { OpenSessionModal } from '@/modules/pos/OpenSessionModal';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { downloadExcel } from '@/lib/exportExcel';
import { printThermalHtml } from '@/lib/printThermal';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface CashRegister { id: string; name: string }

interface CashSession {
  id: string; status: 'OPEN' | 'CLOSED';
  openedAt: string; closedAt: string | null;
  openingAmount: number; closingAmount: number | null;
  expectedAmount: number | null; difference: number | null;
  cashRegister: { name: string };
  user: { firstName: string; lastName: string };
  _count: { sales: number; movements: number };
}

interface SessionSummary {
  session: {
    id: string; status: string; openedAt: string; closedAt: string | null;
    openingAmount: number; closingAmount: number | null;
    expectedAmount: number | null; difference: number | null;
    cashRegister: { name: string }; cashier: { firstName: string; lastName: string };
  };
  reconciliations?: DigitalReconciliation[];
  summary: {
    totalTransactions: number; totalSales: number;
    salesByMethod: Record<string, number>;
    totalWithdrawals: number; totalDeposits: number; netCash: number;
    debtPayments: number; otherDeposits: number;
    purchasePayments: number; otherWithdrawals: number;
  };
}

interface Movement {
  id: string; type: 'WITHDRAWAL' | 'DEPOSIT';
  amount: number; reason: string; createdAt: string;
}

interface Sale {
  id: string; saleNumber: string; totalAmount: number; status: string;
  createdAt: string; payments: Array<{ method: string; amount: number }>;
  _count: { items: number };
}

interface DigitalReconciliation {
  method: string; expectedAmount: number; countedAmount: number; difference: number;
}

/* ─── Arqueo print helper ────────────────────────────────────────────────── */
function printArqueo(summary: SessionSummary, reconciliations: DigitalReconciliation[] = []) {
  const s = summary.session;
  const sm = summary.summary;
  const diff = Number(s.difference ?? 0);
  // Diferencial total = suma de los +/- de cada método por separado (efectivo
  // + cada billetera digital) — así "-2 en efectivo, +2 en Yape" se ve como
  // lo que realmente es (un posible mal registro de método, no una pérdida).
  const totalDiff = diff + reconciliations.reduce((s2, r) => s2 + Number(r.difference), 0);
  const body = `
  <p class="c b" style="font-size:14px">ARQUEO DE CAJA</p>
  <p class="c">${s.cashRegister.name}</p>
  <div class="line"></div>
  <div class="row"><span>Cajero:</span><span>${s.cashier.firstName} ${s.cashier.lastName}</span></div>
  <div class="row"><span>Apertura:</span><span>${new Date(s.openedAt).toLocaleString('es-PE')}</span></div>
  ${s.closedAt ? `<div class="row"><span>Cierre:</span><span>${new Date(s.closedAt).toLocaleString('es-PE')}</span></div>` : ''}
  <div class="line"></div>
  <div class="row"><span>Monto inicial:</span><span>S/ ${Number(s.openingAmount).toFixed(2)}</span></div>
  ${Object.entries(sm.salesByMethod).map(([m, v]) =>
    `<div class="row"><span>Ventas ${PAYMENT_METHOD_LABELS[m] ?? m}:</span><span>S/ ${Number(v).toFixed(2)}</span></div>`
  ).join('')}
  ${sm.debtPayments > 0 ? `<div class="row"><span>Cobro de cuentas:</span><span>+S/ ${sm.debtPayments.toFixed(2)}</span></div>` : ''}
  ${sm.otherDeposits > 0 ? `<div class="row"><span>Otros depósitos:</span><span>+S/ ${sm.otherDeposits.toFixed(2)}</span></div>` : ''}
  ${sm.purchasePayments > 0 ? `<div class="row"><span>Pago a proveedores:</span><span>-S/ ${sm.purchasePayments.toFixed(2)}</span></div>` : ''}
  ${sm.otherWithdrawals > 0 ? `<div class="row"><span>Otros retiros:</span><span>-S/ ${sm.otherWithdrawals.toFixed(2)}</span></div>` : ''}
  <div class="line"></div>
  <div class="row b"><span>Efectivo esperado:</span><span>S/ ${Number(s.expectedAmount ?? sm.netCash).toFixed(2)}</span></div>
  ${s.closingAmount != null ? `<div class="row b"><span>Contado:</span><span>S/ ${Number(s.closingAmount).toFixed(2)}</span></div>` : ''}
  ${s.difference != null ? `<div class="row b"><span>Diferencia:</span><span>${diff >= 0 ? '+' : ''}S/ ${diff.toFixed(2)}</span></div>` : ''}
  ${reconciliations.map((r) => {
    const rd = Number(r.difference);
    return `<div class="line"></div>
    <div class="row b"><span>${PAYMENT_METHOD_LABELS[r.method] ?? r.method} esperado:</span><span>S/ ${Number(r.expectedAmount).toFixed(2)}</span></div>
    <div class="row"><span>Confirmado:</span><span>S/ ${Number(r.countedAmount).toFixed(2)}</span></div>
    <div class="row b"><span>Diferencia:</span><span>${rd >= 0 ? '+' : ''}S/ ${rd.toFixed(2)}</span></div>`;
  }).join('')}
  ${s.difference != null && reconciliations.length > 0 ? `
  <div class="line"></div>
  <div class="row b" style="font-size:13px"><span>DIFERENCIAL TOTAL:</span><span>${totalDiff >= 0 ? '+' : ''}S/ ${totalDiff.toFixed(2)}</span></div>` : ''}
  <div class="line"></div>
  <div class="row"><span>Total transacciones:</span><span>${sm.totalTransactions}</span></div>
  <p class="c" style="margin-top:8px">ERP Minimarket</p>`;
  printThermalHtml(`Arqueo ${s.cashRegister.name}`, body);
}

/* ─── Sub-components ────────────────────────────────────────────────────── */
function MovementRow({ m }: { m: Movement }) {
  const isWithdrawal = m.type === 'WITHDRAWAL';
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div className="flex items-center gap-2">
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-white',
          isWithdrawal ? 'bg-destructive' : 'bg-success')}>
          {isWithdrawal ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </span>
        <div>
          <p className="font-medium">{m.reason}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
        </div>
      </div>
      <span className={cn('font-bold', isWithdrawal ? 'text-destructive' : 'text-success')}>
        {isWithdrawal ? '-' : '+'}{formatCurrency(m.amount)}
      </span>
    </div>
  );
}

function SaleRow({ s }: { s: Sale }) {
  const cash = s.payments.filter(p => p.method === 'CASH').reduce((a, p) => a + Number(p.amount), 0);
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
      <div>
        <p className="font-medium">{s.saleNumber}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)} · {s._count.items} ítem(s)</p>
      </div>
      <div className="text-right">
        <p className="font-bold">{formatCurrency(s.totalAmount)}</p>
        {cash > 0 && <p className="text-xs text-muted-foreground">Efectivo: {formatCurrency(cash)}</p>}
      </div>
    </div>
  );
}

/* ─── Close Session Modal ────────────────────────────────────────────────── */
function CloseSessionModal({
  sessionId, summary, onClose, onClosed,
}: {
  sessionId: string; summary: SessionSummary;
  onClose: () => void; onClosed: () => void;
}) {
  const [closingAmount, setClosingAmount] = useState('');
  const [toTreasury, setToTreasury] = useState(true);
  const [yapeCounted, setYapeCounted] = useState('');
  const [plinCounted, setPlinCounted] = useState('');
  const queryClient = useQueryClient();

  const counted = parseFloat(closingAmount) || 0;
  const expected = Number(summary.summary.netCash);
  const diff = counted - expected;

  // Solo se pide cuadrar Yape/Plin si de verdad hubo ventas por ese medio en
  // esta sesión — no tiene sentido pedir un monto de algo que no se usó.
  const expectedYape = summary.summary.salesByMethod['YAPE'] ?? 0;
  const expectedPlin = summary.summary.salesByMethod['PLIN'] ?? 0;
  const yapeDiff = (parseFloat(yapeCounted) || 0) - expectedYape;
  const plinDiff = (parseFloat(plinCounted) || 0) - expectedPlin;

  const digitalCounts = [
    ...(expectedYape > 0 ? [{ method: 'YAPE' as const, countedAmount: parseFloat(yapeCounted) || 0 }] : []),
    ...(expectedPlin > 0 ? [{ method: 'PLIN' as const, countedAmount: parseFloat(plinCounted) || 0 }] : []),
  ];
  const missingDigitalCounts =
    (expectedYape > 0 && yapeCounted === '') || (expectedPlin > 0 && plinCounted === '');

  // Diferencial total = suma de los +/- de cada método por separado — un
  // -2 en efectivo y +2 en Yape se ve como lo que realmente es (posible
  // pago mal registrado, no una pérdida real), en vez de mostrarlos sueltos.
  const hasDigital = expectedYape > 0 || expectedPlin > 0;
  const totalDiff = diff + (expectedYape > 0 ? yapeDiff : 0) + (expectedPlin > 0 ? plinDiff : 0);
  const readyForTotalDiff = !!closingAmount && !missingDigitalCounts;

  const mutation = useMutation({
    mutationFn: () => api.post(`/cash/sessions/${sessionId}/close`, { closingAmount: counted, toTreasury, digitalCounts }),
    onSuccess: (res) => {
      const closed = res.data.data;
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-movements'] });
      toast.success('Caja cerrada correctamente.');
      // Print arqueo automatically
      printArqueo(
        { ...summary, session: { ...summary.session, closingAmount: counted, difference: diff, closedAt: new Date().toISOString() } },
        closed.reconciliations ?? [],
      );
      onClosed();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">Cierre de Caja</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Resumen previo al cierre */}
          <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monto inicial</span>
              <span>{formatCurrency(summary.session.openingAmount)}</span>
            </div>
            <div className="flex justify-between text-success">
              <span>Ventas efectivo</span>
              <span>+{formatCurrency(summary.summary.salesByMethod['CASH'] ?? 0)}</span>
            </div>
            {summary.summary.debtPayments > 0 && (
              <div className="flex justify-between text-success">
                <span>Cobro de cuentas</span>
                <span>+{formatCurrency(summary.summary.debtPayments)}</span>
              </div>
            )}
            {summary.summary.otherDeposits > 0 && (
              <div className="flex justify-between text-success">
                <span>Otros depósitos</span>
                <span>+{formatCurrency(summary.summary.otherDeposits)}</span>
              </div>
            )}
            {summary.summary.purchasePayments > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Pago a proveedores</span>
                <span>-{formatCurrency(summary.summary.purchasePayments)}</span>
              </div>
            )}
            {summary.summary.otherWithdrawals > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Otros retiros</span>
                <span>-{formatCurrency(summary.summary.otherWithdrawals)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Efectivo esperado</span>
              <span>{formatCurrency(expected)}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Monto contado en caja (S/)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              className="text-lg font-bold"
              min={0}
              step={0.10}
              autoFocus
            />
          </div>

          {/* Diferencia en tiempo real */}
          {closingAmount && (
            <div className={cn('rounded-lg p-4 text-center', diff === 0 ? 'bg-success/10' : diff > 0 ? 'bg-blue-500/10' : 'bg-destructive/10')}>
              <p className="text-sm text-muted-foreground">Diferencia</p>
              <p className={cn('text-2xl font-bold', diff === 0 ? 'text-success' : diff > 0 ? 'text-blue-600' : 'text-destructive')}>
                {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {diff === 0 ? 'Cuadre exacto ✓' : diff > 0 ? 'Sobrante de caja' : 'Faltante de caja'}
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input"
              checked={toTreasury} onChange={(e) => setToTreasury(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium">Depositar en Caja General</span>
              <span className="block text-xs text-muted-foreground">
                El monto contado pasa al fondo general del negocio, disponible para la próxima apertura o para gastos.
              </span>
            </span>
          </label>

          {/* Cuadre de billeteras digitales — cada una es su propia cuenta en
              Caja General, separada del efectivo. Se deposita siempre lo
              confirmado (esa plata ya está acreditada, no es billete físico). */}
          {expectedYape > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ventas Yape esperadas</span>
                <span className="font-medium">{formatCurrency(expectedYape)}</span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Monto confirmado en Yape (S/)</label>
                <Input type="number" placeholder="0.00" min={0} step={0.10}
                  value={yapeCounted} onChange={(e) => setYapeCounted(e.target.value)} />
              </div>
              {yapeCounted && (
                <p className={cn('text-xs font-medium', yapeDiff === 0 ? 'text-success' : yapeDiff > 0 ? 'text-blue-600' : 'text-destructive')}>
                  Diferencia: {yapeDiff >= 0 ? '+' : ''}{formatCurrency(yapeDiff)}
                </p>
              )}
            </div>
          )}
          {expectedPlin > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ventas Plin esperadas</span>
                <span className="font-medium">{formatCurrency(expectedPlin)}</span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Monto confirmado en Plin (S/)</label>
                <Input type="number" placeholder="0.00" min={0} step={0.10}
                  value={plinCounted} onChange={(e) => setPlinCounted(e.target.value)} />
              </div>
              {plinCounted && (
                <p className={cn('text-xs font-medium', plinDiff === 0 ? 'text-success' : plinDiff > 0 ? 'text-blue-600' : 'text-destructive')}>
                  Diferencia: {plinDiff >= 0 ? '+' : ''}{formatCurrency(plinDiff)}
                </p>
              )}
            </div>
          )}

          {/* Diferencial total — solo tiene sentido combinar métodos cuando
              hay más de uno en juego (efectivo + alguna billetera digital). */}
          {hasDigital && readyForTotalDiff && (
            <div className={cn('rounded-lg border-2 p-4 text-center', totalDiff === 0 ? 'border-success bg-success/10' : totalDiff > 0 ? 'border-blue-500 bg-blue-500/10' : 'border-destructive bg-destructive/10')}>
              <p className="text-sm text-muted-foreground">Diferencial total (todos los métodos)</p>
              <p className={cn('text-2xl font-bold', totalDiff === 0 ? 'text-success' : totalDiff > 0 ? 'text-blue-600' : 'text-destructive')}>
                {totalDiff >= 0 ? '+' : ''}{formatCurrency(totalDiff)}
              </p>
            </div>
          )}
        </div>

        <div className="border-t p-5">
          <Button
            className="w-full" variant="destructive"
            disabled={!closingAmount || missingDigitalCounts || mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Confirmar Cierre de Caja
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Active Session Panel ──────────────────────────────────────────────── */
/* ─── Garantía de envase (cobrar/devolver) ───────────────────────────────── */
interface DepositProductRow {
  productId: string; name: string; barcode: string | null;
  depositAmount: number; outstandingQty: number; outstandingAmount: number;
}

function BottleDepositModal({ cashSessionId, onClose }: { cashSessionId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<'charge' | 'return'>('charge');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');

  const { data } = useQuery({
    queryKey: ['bottle-deposits-outstanding'],
    queryFn: async () => (await api.get<{ data: DepositProductRow[] }>('/bottle-deposits')).data.data,
  });

  const product = (data ?? []).find(p => p.productId === productId);
  const amount = product ? Number(quantity || 0) * product.depositAmount : 0;

  const mutation = useMutation({
    mutationFn: () => api.post(`/bottle-deposits/${action === 'charge' ? 'charge' : 'return'}`, {
      productId, quantity: Number(quantity), method, cashSessionId, notes: notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottle-deposits-outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['bottle-deposits-totals'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary', cashSessionId] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements', cashSessionId] });
      toast.success(action === 'charge' ? 'Garantía cobrada.' : 'Garantía devuelta.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const maxQty = action === 'return' ? (product?.outstandingQty ?? 0) : undefined;
  const canSubmit = !!productId && Number(quantity) > 0 && (action === 'charge' || Number(quantity) <= (maxQty ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold flex items-center gap-2"><PackageOpen className="h-5 w-5 text-primary" />Garantía de envase</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" variant={action === 'charge' ? 'default' : 'outline'}
              onClick={() => setAction('charge')}>Cobrar</Button>
            <Button size="sm" className="flex-1" variant={action === 'return' ? 'success' : 'outline'}
              onClick={() => setAction('return')}>Devolver</Button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Producto (envase)</label>
            <select value={productId} onChange={e => { setProductId(e.target.value); setQuantity('1'); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar...</option>
              {(data ?? []).filter(p => action === 'charge' || p.outstandingQty > 0).map(p => (
                <option key={p.productId} value={p.productId}>
                  {p.name} — S/{p.depositAmount.toFixed(2)}/u{action === 'return' ? ` (pendiente: ${p.outstandingQty})` : ''}
                </option>
              ))}
            </select>
            {action === 'charge' && (data ?? []).length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ningún producto tiene garantía configurada — agrégala editando el producto (campo "Garantía de envase").
              </p>
            )}
            {action === 'return' && (data ?? []).every(p => p.outstandingQty === 0) && (
              <p className="mt-1 text-xs text-muted-foreground">No hay garantías pendientes de devolver.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Cantidad</label>
              <Input type="number" min={1} max={maxQty} step={1} value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Método</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== 'CREDIT').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {product && (
            <p className="text-sm text-right font-bold">
              {action === 'charge' ? 'A cobrar: ' : 'A devolver: '}{formatCurrency(amount)}
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Notas (opcional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: cliente Juan, ticket #123..." />
          </div>
        </div>
        <div className="border-t p-5 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActiveSessionPanel({ session }: { session: CashSession }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'movimientos' | 'ventas'>('movimientos');
  const [movType, setMovType] = useState<'WITHDRAWAL' | 'DEPOSIT'>('WITHDRAWAL');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['cash-summary', session.id],
    queryFn: async () => (await api.get<{ data: SessionSummary }>(`/cash/sessions/${session.id}/summary`)).data.data,
    enabled: expanded,
    refetchInterval: expanded ? 30000 : false,
  });

  const { data: movements } = useQuery({
    queryKey: ['cash-movements', session.id],
    queryFn: async () => (await api.get<{ data: Movement[] }>(`/cash/sessions/${session.id}/movements`)).data.data,
    enabled: expanded && tab === 'movimientos',
  });

  const { data: sales } = useQuery({
    queryKey: ['cash-sales', session.id],
    queryFn: async () => (await api.get<{ data: Sale[] }>(`/cash/sessions/${session.id}/sales`)).data.data,
    enabled: expanded && tab === 'ventas',
  });

  const movMutation = useMutation({
    mutationFn: () => api.post(`/cash/sessions/${session.id}/movements`, {
      type: movType, amount: parseFloat(movAmount), reason: movReason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-movements', session.id] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary', session.id] });
      toast.success('Movimiento registrado.');
      setMovAmount(''); setMovReason('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <>
      <Card className="overflow-hidden">
        {/* Session header */}
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
              <Wallet className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="font-semibold">{session.cashRegister.name}</p>
              <p className="text-xs text-muted-foreground">
                {session.user.firstName} {session.user.lastName} · Desde {formatDateTime(session.openedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Inicial</p>
              <p className="font-bold">{formatCurrency(session.openingAmount)}</p>
            </div>
            <Badge variant="success">Abierta</Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="border-t">
            {/* KPIs */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b divide-x">
                {[
                  { label: 'Total ventas', value: formatCurrency(summary.summary.totalSales), icon: TrendingUp, color: 'text-success' },
                  { label: 'Transacciones', value: String(summary.summary.totalTransactions), icon: ShoppingCart, color: 'text-primary' },
                  { label: 'Retiros', value: formatCurrency(summary.summary.totalWithdrawals), icon: TrendingDown, color: 'text-destructive' },
                  { label: 'Efectivo esperado', value: formatCurrency(summary.summary.netCash), icon: Wallet, color: 'text-foreground' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="p-3 text-center">
                    <Icon className={cn('h-4 w-4 mx-auto mb-1', color)} />
                    <p className={cn('text-base font-bold', color)}>{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Ventas por método */}
              {summary && Object.keys(summary.summary.salesByMethod).length > 0 && (
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ventas por método</p>
                  {Object.entries(summary.summary.salesByMethod).map(([method, amount]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span>{PAYMENT_METHOD_LABELS[method] ?? method}</span>
                      <span className="font-medium">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Esperado al cierre — para saber antes de tiempo cuánto debe
                  cuadrar cada método, sin tener que abrir "Cerrar caja". */}
              {summary && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Esperado al cierre</p>
                  <div className="flex justify-between text-sm">
                    <span>Efectivo</span>
                    <span className="font-bold">{formatCurrency(summary.summary.netCash)}</span>
                  </div>
                  {(summary.summary.salesByMethod['YAPE'] ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Yape</span>
                      <span className="font-bold">{formatCurrency(summary.summary.salesByMethod['YAPE'])}</span>
                    </div>
                  )}
                  {(summary.summary.salesByMethod['PLIN'] ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Plin</span>
                      <span className="font-bold">{formatCurrency(summary.summary.salesByMethod['PLIN'])}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Agregar movimiento */}
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registrar movimiento</p>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1"
                    variant={movType === 'WITHDRAWAL' ? 'destructive' : 'outline'}
                    onClick={() => setMovType('WITHDRAWAL')}>
                    <Minus className="mr-1.5 h-3.5 w-3.5" />Retiro
                  </Button>
                  <Button size="sm" className="flex-1"
                    variant={movType === 'DEPOSIT' ? 'success' : 'outline'}
                    onClick={() => setMovType('DEPOSIT')}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />Depósito
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Monto S/" value={movAmount}
                    onChange={e => setMovAmount(e.target.value)} className="w-32" min={0} step={0.10} />
                  <Input placeholder="Motivo (ej: pago proveedor)" value={movReason}
                    onChange={e => setMovReason(e.target.value)} />
                </div>
                <Button size="sm" className="w-full" onClick={() => movMutation.mutate()}
                  disabled={!movAmount || !movReason || parseFloat(movAmount) <= 0}
                  loading={movMutation.isPending}>
                  Registrar
                </Button>
              </div>

              {/* Garantía de envase — aparte de una venta, no es ingreso */}
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowDeposit(true)}>
                <PackageOpen className="mr-1.5 h-3.5 w-3.5" />Cobrar / devolver garantía de envase
              </Button>

              {/* Tabs movimientos / ventas */}
              <div>
                <div className="flex gap-1 mb-3 border-b">
                  {(['movimientos', 'ventas'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={cn('px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
                        tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                      {t === 'movimientos' ? <><ArrowDownUp className="inline h-3.5 w-3.5 mr-1.5" />Movimientos ({session._count.movements})</> : <><ShoppingCart className="inline h-3.5 w-3.5 mr-1.5" />Ventas ({session._count.sales})</>}
                    </button>
                  ))}
                </div>

                {tab === 'movimientos' && (
                  <div className="max-h-64 overflow-y-auto">
                    {!movements || movements.length === 0
                      ? <p className="text-center text-sm text-muted-foreground py-6">Sin movimientos registrados</p>
                      : movements.map(m => <MovementRow key={m.id} m={m} />)}
                  </div>
                )}
                {tab === 'ventas' && (
                  <div className="max-h-64 overflow-y-auto">
                    {!sales || sales.length === 0
                      ? <p className="text-center text-sm text-muted-foreground py-6">Sin ventas en esta sesión</p>
                      : sales.map(s => <SaleRow key={s.id} s={s} />)}
                  </div>
                )}
              </div>

              {/* Acciones de cierre */}
              <div className="flex gap-2 pt-2 border-t">
                {summary && (
                  <Button variant="outline" size="sm" onClick={() => printArqueo(summary)}>
                    <Printer className="mr-1.5 h-3.5 w-3.5" />Imprimir arqueo
                  </Button>
                )}
                <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setShowClose(true)}>
                  <X className="mr-1.5 h-3.5 w-3.5" />Cerrar caja
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {showClose && summary && (
        <CloseSessionModal
          sessionId={session.id}
          summary={summary}
          onClose={() => setShowClose(false)}
          onClosed={() => { setShowClose(false); setExpanded(false); }}
        />
      )}
      {showDeposit && <BottleDepositModal cashSessionId={session.id} onClose={() => setShowDeposit(false)} />}
    </>
  );
}

/* ─── History Panel ──────────────────────────────────────────────────────── */
function HistoryPanel() {
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['cash-sessions', 'CLOSED', page],
    queryFn: async () => (await api.get<{ data: CashSession[]; pagination: { total: number; totalPages: number } }>
      (`/cash/sessions?status=CLOSED&page=${page}&limit=15`)).data,
  });

  const { data: summary } = useQuery({
    queryKey: ['cash-summary', selectedSession],
    queryFn: async () => (await api.get<{ data: SessionSummary }>(`/cash/sessions/${selectedSession}/summary`)).data.data,
    enabled: !!selectedSession,
  });

  // El detalle se renderiza después de la tabla — sin esto queda fuera de
  // vista y hay que bajar a buscarlo manualmente cada vez que se abre.
  useEffect(() => {
    if (selectedSession && summary) {
      detailRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [selectedSession, summary]);

  const sessions = data?.data ?? [];
  const reconciliations = summary?.reconciliations ?? [];
  const totalDiff = summary?.session.difference != null
    ? Number(summary.session.difference) + reconciliations.reduce((s, r) => s + Number(r.difference), 0)
    : null;

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-20" />
            <p>No hay sesiones cerradas aún</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Caja</th>
                  <th className="px-4 py-3 font-medium">Cajero</th>
                  <th className="px-4 py-3 font-medium">Apertura</th>
                  <th className="px-4 py-3 font-medium">Cierre</th>
                  <th className="px-4 py-3 font-medium text-right">Ventas</th>
                  <th className="px-4 py-3 font-medium text-right">Esperado</th>
                  <th className="px-4 py-3 font-medium text-right">Contado</th>
                  <th className="px-4 py-3 font-medium text-right">Diferencia</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map(session => {
                  const diff = Number(session.difference ?? 0);
                  return (
                    <tr key={session.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{session.cashRegister.name}</td>
                      <td className="px-4 py-3">{session.user.firstName} {session.user.lastName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(session.openedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{session.closedAt ? formatDateTime(session.closedAt) : '—'}</td>
                      <td className="px-4 py-3 text-right">{session._count.sales}</td>
                      <td className="px-4 py-3 text-right">{session.expectedAmount != null ? formatCurrency(session.expectedAmount) : '—'}</td>
                      <td className="px-4 py-3 text-right">{session.closingAmount != null ? formatCurrency(session.closingAmount) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {session.difference != null ? (
                          <span className={cn('font-semibold', diff === 0 ? 'text-success' : diff > 0 ? 'text-blue-600' : 'text-destructive')}>
                            {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm"
                          onClick={() => setSelectedSession(selectedSession === session.id ? null : session.id)}>
                          {selectedSession === session.id ? 'Ocultar' : 'Ver'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>Total: {data.pagination.total} sesiones</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <span className="self-center">Pág. {page} / {data.pagination.totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Detalle de sesión histórica */}
      {selectedSession && summary && (
        <Card ref={detailRef}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Detalle — {summary.session.cashRegister.name}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => printArqueo(summary, reconciliations)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />Imprimir arqueo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wide">Resumen financiero</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto inicial</span><span>{formatCurrency(summary.session.openingAmount)}</span></div>
                {Object.entries(summary.summary.salesByMethod).map(([m, v]) => (
                  <div key={m} className="flex justify-between">
                    <span className="text-muted-foreground">Ventas {PAYMENT_METHOD_LABELS[m] ?? m}</span>
                    <span className="text-success">+{formatCurrency(v)}</span>
                  </div>
                ))}
                {summary.summary.debtPayments > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Cobro de cuentas</span><span className="text-success">+{formatCurrency(summary.summary.debtPayments)}</span></div>}
                {summary.summary.otherDeposits > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Otros depósitos</span><span className="text-success">+{formatCurrency(summary.summary.otherDeposits)}</span></div>}
                {summary.summary.purchasePayments > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Pago a proveedores</span><span className="text-destructive">-{formatCurrency(summary.summary.purchasePayments)}</span></div>}
                {summary.summary.otherWithdrawals > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Otros retiros</span><span className="text-destructive">-{formatCurrency(summary.summary.otherWithdrawals)}</span></div>}
                <div className="flex justify-between font-bold border-t pt-2"><span>Esperado</span><span>{formatCurrency(summary.session.expectedAmount ?? 0)}</span></div>
                <div className="flex justify-between font-bold"><span>Contado</span><span>{formatCurrency(summary.session.closingAmount ?? 0)}</span></div>
                {summary.session.difference != null && (() => {
                  const d = Number(summary.session.difference);
                  return <div className={cn('flex justify-between font-bold', d === 0 ? 'text-success' : d > 0 ? 'text-blue-600' : 'text-destructive')}>
                    <span>Diferencia efectivo</span><span>{d >= 0 ? '+' : ''}{formatCurrency(d)}</span>
                  </div>;
                })()}
                {reconciliations.map(r => {
                  const rd = Number(r.difference);
                  return (
                    <div key={r.method} className={cn('flex justify-between', rd === 0 ? 'text-success' : rd > 0 ? 'text-blue-600' : 'text-destructive')}>
                      <span>Diferencia {PAYMENT_METHOD_LABELS[r.method] ?? r.method}</span><span>{rd >= 0 ? '+' : ''}{formatCurrency(rd)}</span>
                    </div>
                  );
                })}
                {totalDiff != null && reconciliations.length > 0 && (
                  <div className={cn('flex justify-between font-bold border-t pt-2', totalDiff === 0 ? 'text-success' : totalDiff > 0 ? 'text-blue-600' : 'text-destructive')}>
                    <span>Diferencial total</span><span>{totalDiff >= 0 ? '+' : ''}{formatCurrency(totalDiff)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-muted-foreground uppercase text-xs tracking-wide">Estadísticas</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Total transacciones</span><span>{summary.summary.totalTransactions}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total ventas</span><span className="font-semibold text-success">{formatCurrency(summary.summary.totalSales)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duración</span>
                  <span>{summary.session.closedAt ? `${Math.round((new Date(summary.session.closedAt).getTime() - new Date(summary.session.openedAt).getTime()) / 60000)} min` : '—'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Caja General ───────────────────────────────────────────────────────── */
interface TreasuryMovementRow {
  id: string; type: 'DEPOSIT' | 'WITHDRAWAL'; account: string; amount: number;
  balanceAfter: number; description: string; createdAt: string;
  user: { firstName: string; lastName: string };
}

interface ExpenseRow {
  id: string; category: string; description: string; amount: number;
  method: string; expenseDate: string; templateId: string | null;
}

interface RecurringTemplate {
  id: string; category: string; description: string; amount: number;
  dayOfMonth: number; isActive: boolean; lastGeneratedPeriod: string | null;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  PERSONNEL: 'Personal', BAGS: 'Bolsas', TRANSPORT: 'Transporte', SYSTEM: 'Sistema',
  WATER: 'Agua', ELECTRICITY: 'Electricidad', RENT: 'Alquiler', OTHER: 'Otro',
};

const TREASURY_ACCOUNT_LABELS: Record<string, string> = { CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin' };

function DepositModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState('CASH');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/deposits', { amount: parseFloat(amount), description, account }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-movements'] });
      toast.success('Depósito registrado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-bold">Registrar Depósito</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Monto (S/)</label>
              <Input type="number" min={0.01} step={0.01} value={amount}
                onChange={(e) => setAmount(e.target.value)} className="text-lg font-bold" autoFocus />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Cuenta</label>
              <select value={account} onChange={(e) => setAccount(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(TREASURY_ACCOUNT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Descripción</label>
            <Input placeholder="Ej: Aporte de capital" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!amount || parseFloat(amount) <= 0 || !description}>
            Confirmar Depósito
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState('PERSONNEL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/expenses', { category, description, amount: parseFloat(amount), method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-movements'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-expenses'] });
      toast.success('Gasto registrado.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-bold">Registrar Gasto</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Categoría</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Descripción</label>
            <Input placeholder="Ej: Pago de luz de julio" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Monto (S/)</label>
              <Input type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Método</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <Button className="w-full" variant="destructive" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!amount || parseFloat(amount) <= 0 || !description}>
            Confirmar Gasto
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecurringTemplateModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState('RENT');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.post('/treasury/recurring-expenses', {
      category, description, amount: parseFloat(amount), dayOfMonth: parseInt(dayOfMonth),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-recurring'] });
      toast.success('Plantilla creada — se generará sola cada mes.');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-bold">Nuevo Gasto Recurrente</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Categoría</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Descripción</label>
            <Input placeholder="Ej: Alquiler del local" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Monto (S/)</label>
              <Input type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Día del mes</label>
              <Input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Se generará solo, cada mes, ese día — sin que tengas que volver a registrarlo.
          </p>
          <Button className="w-full" onClick={() => mutation.mutate()} loading={mutation.isPending}
            disabled={!amount || parseFloat(amount) <= 0 || !description}>
            Crear Plantilla
          </Button>
        </div>
      </div>
    </div>
  );
}

function TreasuryPanel() {
  const queryClient = useQueryClient();
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showBottleDeposit, setShowBottleDeposit] = useState(false);
  const [tab, setTab] = useState<'movimientos' | 'gastos' | 'recurrentes'>('movimientos');

  const { data: depositsOutstanding } = useQuery({
    queryKey: ['bottle-deposits-totals'],
    queryFn: async () => (await api.get<{ totals: { outstandingQty: number; outstandingAmount: number } }>('/bottle-deposits')).data.totals,
  });

  const { data: balances } = useQuery({
    queryKey: ['treasury-balance'],
    queryFn: async () => (await api.get<{ data: { cash: number; yape: number; plin: number; total: number } }>('/treasury/balance')).data.data,
    refetchInterval: 30000,
  });

  const { data: movements } = useQuery({
    queryKey: ['treasury-movements'],
    queryFn: async () => (await api.get<{ data: TreasuryMovementRow[] }>('/treasury/movements?limit=50')).data.data,
    enabled: tab === 'movimientos',
  });

  const { data: expenses } = useQuery({
    queryKey: ['treasury-expenses'],
    queryFn: async () => (await api.get<{ data: ExpenseRow[] }>('/treasury/expenses?limit=50')).data.data,
    enabled: tab === 'gastos',
  });

  const { data: templates } = useQuery({
    queryKey: ['treasury-recurring'],
    queryFn: async () => (await api.get<{ data: RecurringTemplate[] }>('/treasury/recurring-expenses')).data.data,
    enabled: tab === 'recurrentes',
  });

  const toggleTemplateMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/treasury/recurring-expenses/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['treasury-recurring'] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/treasury/recurring-expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-recurring'] });
      toast.success('Plantilla eliminada.');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8">
          <p className="text-sm text-muted-foreground">Saldo de Caja General</p>
          <p className={cn('text-4xl font-black', (balances?.total ?? 0) < 0 ? 'text-destructive' : 'text-foreground')}>
            {balances !== undefined ? formatCurrency(balances.total) : '—'}
          </p>
          {/* Cada cuenta se cuadra por separado (efectivo físico vs. billeteras
              digitales) — nunca se mezclan aunque sumen al mismo total. */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Efectivo: <span className="font-semibold text-foreground">{formatCurrency(balances?.cash ?? 0)}</span></span>
            <span>Yape: <span className="font-semibold text-foreground">{formatCurrency(balances?.yape ?? 0)}</span></span>
            <span>Plin: <span className="font-semibold text-foreground">{formatCurrency(balances?.plin ?? 0)}</span></span>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={() => setShowDeposit(true)}>
              <Plus className="mr-1.5 h-4 w-4" />Depositar
            </Button>
            <Button variant="destructive" onClick={() => setShowExpense(true)}>
              <Minus className="mr-1.5 h-4 w-4" />Registrar Gasto
            </Button>
            <Button variant="outline" onClick={() => setShowBottleDeposit(true)}>
              <PackageOpen className="mr-1.5 h-4 w-4" />Garantía de envase
            </Button>
          </div>
          {depositsOutstanding && depositsOutstanding.outstandingQty > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Pendiente por devolver en garantías: <span className="font-semibold text-foreground">{formatCurrency(depositsOutstanding.outstandingAmount)}</span>
              {' '}({depositsOutstanding.outstandingQty} envase{depositsOutstanding.outstandingQty !== 1 ? 's' : ''}) — no incluido en el saldo de arriba
            </p>
          )}
        </CardContent>
      </Card>

      {showBottleDeposit && <BottleDepositModal onClose={() => setShowBottleDeposit(false)} />}

      <div className="flex gap-1 border-b">
        {([['movimientos', 'Movimientos'], ['gastos', 'Gastos'], ['recurrentes', 'Gastos recurrentes']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'movimientos' && (
        <Card>
          <CardContent className="p-4">
            {!movements || movements.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Sin movimientos registrados</p>
            ) : movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-white',
                    m.type === 'WITHDRAWAL' ? 'bg-destructive' : 'bg-success')}>
                    {m.type === 'WITHDRAWAL' ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </span>
                  <div>
                    <p className="font-medium">{m.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)} · {m.user.firstName} {m.user.lastName}
                      <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">{TREASURY_ACCOUNT_LABELS[m.account] ?? m.account}</Badge>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn('font-bold', m.type === 'WITHDRAWAL' ? 'text-destructive' : 'text-success')}>
                    {m.type === 'WITHDRAWAL' ? '-' : '+'}{formatCurrency(m.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">Saldo {TREASURY_ACCOUNT_LABELS[m.account] ?? m.account}: {formatCurrency(m.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'gastos' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Método</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(expenses ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(e.expenseDate)}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</Badge></td>
                    <td className="px-4 py-3">
                      {e.description}
                      {e.templateId && <span className="ml-1.5 text-xs text-muted-foreground">(recurrente)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{PAYMENT_METHOD_LABELS[e.method] ?? e.method}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
                {(!expenses || expenses.length === 0) && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin gastos registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'recurrentes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowTemplate(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Nuevo Gasto Recurrente
            </Button>
          </div>
          <Card>
            <CardContent className="p-4">
              {!templates || templates.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Sin gastos recurrentes configurados</p>
              ) : templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium">
                      {t.description} <Badge variant="outline" className="ml-1.5">{EXPENSE_CATEGORY_LABELS[t.category] ?? t.category}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cada mes el día {t.dayOfMonth} · {formatCurrency(t.amount)}
                      {t.lastGeneratedPeriod && ` · último generado: ${t.lastGeneratedPeriod}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.isActive ? 'success' : 'secondary'}>{t.isActive ? 'Activo' : 'Pausado'}</Badge>
                    <Button variant="outline" size="sm"
                      onClick={() => toggleTemplateMutation.mutate({ id: t.id, isActive: !t.isActive })}>
                      {t.isActive ? 'Pausar' : 'Activar'}
                    </Button>
                    <Button variant="ghost" size="icon"
                      onClick={() => { if (confirm(`¿Eliminar "${t.description}"?`)) deleteTemplateMutation.mutate(t.id); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
      {showExpense && <ExpenseModal onClose={() => setShowExpense(false)} />}
      {showTemplate && <RecurringTemplateModal onClose={() => setShowTemplate(false)} />}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function CashPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'activas' | 'historial' | 'general'>('activas');
  const [showOpenSession, setShowOpenSession] = useState(false);
  const { setCashSession } = usePosStore();
  const { hasMinRole } = useAuthStore();
  const canSeeTreasury = hasMinRole('SUPERVISOR');
  const tabs: Array<[typeof activeTab, string]> = [
    ['activas', 'Cajas activas'],
    ['historial', 'Historial'],
    ...(canSeeTreasury ? [['general', 'Caja General'] as [typeof activeTab, string]] : []),
  ];

  const { data: registers, isLoading } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: async () => (await api.get<{ data: Array<CashRegister & { sessions: CashSession[] }> }>('/cash/registers')).data.data,
    refetchInterval: 30000,
  });

  const openSessions: CashSession[] = (registers ?? []).flatMap(r =>
    r.sessions.map(s => ({ ...s, cashRegister: { name: r.name } }))
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caja</h1>
          <p className="text-sm text-muted-foreground">Gestión de sesiones y arqueos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadExcel('/cash/sessions/export', 'cajas.xlsx')}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar Excel
          </Button>
          <Button onClick={() => setShowOpenSession(true)}>
            <Plus className="mr-2 h-4 w-4" />Abrir Caja
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={cn('px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {label}
            {key === 'activas' && openSessions.length > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-success text-white text-xs">
                {openSessions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'activas' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando...</div>
          ) : openSessions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 p-16 text-muted-foreground">
                <Wallet className="h-12 w-12 opacity-20" />
                <p className="font-medium">No hay cajas abiertas</p>
                <Button onClick={() => setShowOpenSession(true)}>
                  <Plus className="mr-2 h-4 w-4" />Abrir una caja
                </Button>
              </CardContent>
            </Card>
          ) : (
            openSessions.map(session => (
              <ActiveSessionPanel key={session.id} session={session} />
            ))
          )}
        </div>
      )}

      {activeTab === 'historial' && <HistoryPanel />}

      {activeTab === 'general' && canSeeTreasury && <TreasuryPanel />}

      {showOpenSession && (
        <OpenSessionModal
          onClose={() => setShowOpenSession(false)}
          onOpened={(sessionId, registerId) => {
            setCashSession(sessionId, registerId);
            setShowOpenSession(false);
            queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
            queryClient.invalidateQueries({ queryKey: ['treasury-balance'] });
            queryClient.invalidateQueries({ queryKey: ['treasury-movements'] });
            toast.success('Caja abierta exitosamente.');
          }}
        />
      )}
    </div>
  );
}
