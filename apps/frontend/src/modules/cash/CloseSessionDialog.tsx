// Cierre de caja: una tabla "Debe haber / Hay / Diferencia" por medio de pago.
// Yape y Plin solo se piden si hubo ventas por ese medio en la sesión. El
// arqueo se imprime solo al cerrar, igual que antes.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Btn, Check, Field, Modal, fieldCls, tableCls } from '@/components/erp';
import { api, getErrorMessage } from '@/services/api';
import { cn, formatCurrency } from '@/lib/utils';
import { printArqueo } from './printing';
import { Diff, KeyRows, Money } from './parts';
import { isZero, type SessionSummary } from './types';

export function CloseSessionDialog({ sessionId, summary, onClose, onClosed }: {
  sessionId: string; summary: SessionSummary; onClose: () => void; onClosed: () => void;
}) {
  const queryClient = useQueryClient();
  const [cash, setCash] = useState('');
  const [yape, setYape] = useState('');
  const [plin, setPlin] = useState('');
  const [notes, setNotes] = useState('');
  const [toTreasury, setToTreasury] = useState(true);

  const sm = summary.summary;
  const expected = Number(sm.netCash);
  const expectedYape = sm.salesByMethod['YAPE'] ?? 0;
  const expectedPlin = sm.salesByMethod['PLIN'] ?? 0;
  const counted = parseFloat(cash) || 0;
  const diff = counted - expected;

  const rows = [
    { key: 'CASH', label: 'Efectivo', expected, value: cash, set: setCash },
    ...(expectedYape > 0 ? [{ key: 'YAPE', label: 'Yape', expected: expectedYape, value: yape, set: setYape }] : []),
    ...(expectedPlin > 0 ? [{ key: 'PLIN', label: 'Plin', expected: expectedPlin, value: plin, set: setPlin }] : []),
  ];
  const digitalCounts = rows.filter((r) => r.key !== 'CASH')
    .map((r) => ({ method: r.key as 'YAPE' | 'PLIN', countedAmount: parseFloat(r.value) || 0 }));
  const missing = rows.some((r) => r.value === '');
  // Diferencial total = suma de las diferencias de cada medio: un −2 en efectivo
  // y +2 en Yape se ve como lo que es (pago mal registrado), no como pérdida.
  const totalDiff = rows.reduce((n, r) => n + (parseFloat(r.value) || 0) - r.expected, 0);

  const mutation = useMutation({
    mutationFn: () => api.post(`/cash/sessions/${sessionId}/close`, {
      closingAmount: counted, toTreasury, digitalCounts, notes: notes.trim() || undefined,
    }),
    onSuccess: (res) => {
      const closed = res.data.data;
      ['cash-registers', 'cash-sessions', 'treasury-balance', 'treasury-movements']
        .forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast.success('Caja cerrada correctamente.');
      printArqueo(
        { ...summary, session: { ...summary.session, closingAmount: counted, difference: diff, closedAt: new Date().toISOString() } },
        closed.reconciliations ?? [],
      );
      onClosed();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="sm" keepOpen
      title={`Cerrar ${summary.session.cashRegister.name}`}
      description={rows.length > 1 ? 'Cuenta el efectivo y confirma lo que llegó por Yape y Plin.' : 'Cuenta el efectivo que hay en la caja.'}
      footer={<>
        <Btn onClick={onClose}>Volver</Btn>
        <Btn variant="danger" disabled={missing} loading={mutation.isPending} onClick={() => mutation.mutate()}>Confirmar cierre de caja</Btn>
      </>}>
      <div className="flex flex-col gap-4">
        <details className="rounded-ctl bg-surface-2 px-3 py-2 shadow-[inset_0_0_0_1px_hsl(var(--line))]">
          <summary className="cursor-pointer text-table text-ink">
            Efectivo esperado <span className="float-right font-medium tabular-nums">{formatCurrency(expected)}</span>
          </summary>
          <KeyRows className="mt-2 border-t border-line pt-2" rows={[
            ['Monto inicial', <Money v={summary.session.openingAmount} />],
            ['Ventas efectivo', <Money v={sm.salesByMethod['CASH'] ?? 0} sign />],
            sm.debtPayments > 0 && ['Cobro de cuentas', <Money v={sm.debtPayments} sign />],
            sm.otherDeposits > 0 && ['Otros depósitos', <Money v={sm.otherDeposits} sign />],
            sm.purchasePayments > 0 && ['Pago a proveedores', <Money v={-sm.purchasePayments} sign />],
            sm.expensePayments > 0 && ['Gastos pagados', <Money v={-sm.expensePayments} sign />],
            sm.otherWithdrawals > 0 && ['Otros retiros', <Money v={-sm.otherWithdrawals} sign />],
          ]} />
        </details>

        <div className="-mx-5">
          <table className={tableCls}>
            <thead>
              <tr className="text-meta text-ink-muted">
                <th className="border-b border-line px-5 py-2 text-left font-medium">Medio</th>
                <th className="border-b border-line px-2 py-2 text-right font-medium">Debe haber</th>
                <th className="w-32 border-b border-line px-2 py-2 text-right font-medium">Hay</th>
                <th className="border-b border-line px-5 py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="h-12 border-b border-line px-5 font-medium">{r.label}</td>
                  <td className="border-b border-line px-2 text-right tabular-nums text-ink-muted">{formatCurrency(r.expected)}</td>
                  <td className="border-b border-line px-2">
                    <input type="number" inputMode="decimal" min={0} step={0.1} placeholder="0.00" autoFocus={i === 0}
                      aria-label={`${r.label} contado`} value={r.value} onChange={(e) => r.set(e.target.value)}
                      className={cn(fieldCls, 'h-8 text-right tabular-nums')} />
                  </td>
                  <td className="border-b border-line px-5 text-right">
                    {r.value === '' ? <span className="text-ink-muted">—</span> : <Diff v={(parseFloat(r.value) || 0) - r.expected} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!missing && (
            <div className="flex items-center gap-2 px-5 pt-3 text-table">
              <span className={cn('size-1.5 rounded-full', isZero(totalDiff) ? 'bg-ok' : 'bg-warn')} aria-hidden />
              <span className="text-ink">
                {isZero(totalDiff) ? 'Todo cuadra.'
                  : <>{totalDiff < 0 ? 'Faltan' : 'Sobran'} <span className="font-medium tabular-nums">{formatCurrency(Math.abs(totalDiff))}</span>{rows.length > 1 ? ' sumando todos los medios.' : ' en efectivo.'}</>}
              </span>
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-ctl px-3 py-2.5 shadow-[inset_0_0_0_1px_hsl(var(--line))]">
          <span className="pt-0.5"><Check checked={toTreasury} onChange={() => setToTreasury((v) => !v)} label="Depositar en Caja General" /></span>
          <span className="text-table">
            <span className="font-medium text-ink">Depositar en Caja General</span>
            <span className="block text-meta text-ink-muted">El efectivo contado pasa al fondo general del negocio. Lo de Yape y Plin pasa siempre a su cuenta.</span>
          </span>
        </label>

        <Field label="Nota del cierre"><input className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
      </div>
    </Modal>
  );
}
