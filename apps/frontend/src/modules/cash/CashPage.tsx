import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, Plus, Minus, X, ChevronDown, ChevronUp, TrendingUp,
  TrendingDown, Clock, CheckCircle, ArrowDownUp, ShoppingCart, Printer, FileSpreadsheet,
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
import { downloadExcel } from '@/lib/exportExcel';

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
  summary: {
    totalTransactions: number; totalSales: number;
    salesByMethod: Record<string, number>;
    totalWithdrawals: number; totalDeposits: number; netCash: number;
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

/* ─── Arqueo print helper ────────────────────────────────────────────────── */
function printArqueo(summary: SessionSummary) {
  const s = summary.session;
  const sm = summary.summary;
  const diff = Number(s.difference ?? 0);
  const win = window.open('', '_blank', 'width=320,height=700');
  if (!win) return;
  win.document.write(`<html><head><title>Arqueo ${s.cashRegister.name}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:280px;padding:8px}
  .c{text-align:center}.b{font-weight:bold}.line{border-top:1px dashed #000;margin:4px 0}
  .row{display:flex;justify-content:space-between}.green{color:#16a34a}.red{color:#dc2626}</style></head><body>
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
  ${sm.totalDeposits > 0 ? `<div class="row"><span>Depósitos:</span><span>+S/ ${sm.totalDeposits.toFixed(2)}</span></div>` : ''}
  ${sm.totalWithdrawals > 0 ? `<div class="row"><span>Retiros:</span><span>-S/ ${sm.totalWithdrawals.toFixed(2)}</span></div>` : ''}
  <div class="line"></div>
  <div class="row b"><span>Efectivo esperado:</span><span>S/ ${Number(s.expectedAmount ?? sm.netCash).toFixed(2)}</span></div>
  ${s.closingAmount != null ? `<div class="row b"><span>Contado:</span><span>S/ ${Number(s.closingAmount).toFixed(2)}</span></div>` : ''}
  ${s.difference != null ? `<div class="row b ${diff >= 0 ? 'green' : 'red'}"><span>Diferencia:</span><span>${diff >= 0 ? '+' : ''}S/ ${diff.toFixed(2)}</span></div>` : ''}
  <div class="line"></div>
  <div class="row"><span>Total transacciones:</span><span>${sm.totalTransactions}</span></div>
  <p class="c" style="margin-top:8px">ERP Minimarket</p>
  </body></html>`);
  win.document.close(); win.focus(); win.print(); win.close();
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
  const queryClient = useQueryClient();

  const counted = parseFloat(closingAmount) || 0;
  const expected = Number(summary.summary.netCash);
  const diff = counted - expected;

  const mutation = useMutation({
    mutationFn: () => api.post(`/cash/sessions/${sessionId}/close`, { closingAmount: counted }),
    onSuccess: (res) => {
      const closed = res.data.data;
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
      toast.success('Caja cerrada correctamente.');
      // Print arqueo automatically
      printArqueo({ ...summary, session: { ...summary.session, closingAmount: counted, difference: diff, closedAt: new Date().toISOString() } });
      onClosed();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="text-lg font-bold">Cierre de Caja</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-4">
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
            {summary.summary.totalDeposits > 0 && (
              <div className="flex justify-between text-success">
                <span>Depósitos</span>
                <span>+{formatCurrency(summary.summary.totalDeposits)}</span>
              </div>
            )}
            {summary.summary.totalWithdrawals > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Retiros</span>
                <span>-{formatCurrency(summary.summary.totalWithdrawals)}</span>
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
        </div>

        <div className="border-t p-5">
          <Button
            className="w-full" variant="destructive"
            disabled={!closingAmount || mutation.isPending}
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
function ActiveSessionPanel({ session }: { session: CashSession }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'movimientos' | 'ventas'>('movimientos');
  const [movType, setMovType] = useState<'WITHDRAWAL' | 'DEPOSIT'>('WITHDRAWAL');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [showClose, setShowClose] = useState(false);

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
    </>
  );
}

/* ─── History Panel ──────────────────────────────────────────────────────── */
function HistoryPanel() {
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

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

  const sessions = data?.data ?? [];

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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Detalle — {summary.session.cashRegister.name}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => printArqueo(summary)}>
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
                {summary.summary.totalDeposits > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Depósitos</span><span className="text-success">+{formatCurrency(summary.summary.totalDeposits)}</span></div>}
                {summary.summary.totalWithdrawals > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Retiros</span><span className="text-destructive">-{formatCurrency(summary.summary.totalWithdrawals)}</span></div>}
                <div className="flex justify-between font-bold border-t pt-2"><span>Esperado</span><span>{formatCurrency(summary.session.expectedAmount ?? 0)}</span></div>
                <div className="flex justify-between font-bold"><span>Contado</span><span>{formatCurrency(summary.session.closingAmount ?? 0)}</span></div>
                {summary.session.difference != null && (() => {
                  const d = Number(summary.session.difference);
                  return <div className={cn('flex justify-between font-bold', d === 0 ? 'text-success' : d > 0 ? 'text-blue-600' : 'text-destructive')}>
                    <span>Diferencia</span><span>{d >= 0 ? '+' : ''}{formatCurrency(d)}</span>
                  </div>;
                })()}
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

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function CashPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'activas' | 'historial'>('activas');
  const [showOpenSession, setShowOpenSession] = useState(false);
  const { setCashSession } = usePosStore();

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
        {([['activas', 'Cajas activas'], ['historial', 'Historial']] as const).map(([key, label]) => (
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

      {showOpenSession && (
        <OpenSessionModal
          onClose={() => setShowOpenSession(false)}
          onOpened={(sessionId, registerId) => {
            setCashSession(sessionId, registerId);
            setShowOpenSession(false);
            queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
            toast.success('Caja abierta exitosamente.');
          }}
        />
      )}
    </div>
  );
}
