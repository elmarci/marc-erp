import { PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { printThermalHtml } from '@/lib/printThermal';
import type { DigitalReconciliation, SessionSummary } from './types';

/* ─── Arqueo print helper ────────────────────────────────────────────────── */
export function printArqueo(summary: SessionSummary, reconciliations: DigitalReconciliation[] = []) {
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
  ${Object.entries(sm.refundsByMethod ?? {}).filter(([, v]) => Number(v) > 0).map(([m, v]) =>
    `<div class="row"><span>Devoluciones ${PAYMENT_METHOD_LABELS[m] ?? m} (ya restadas):</span><span>S/ ${Number(v).toFixed(2)}</span></div>`
  ).join('')}
  ${(sm.cardCommissions ?? 0) > 0 ? `<div class="row"><span>Comisión tarjeta cobrada:</span><span>S/ ${Number(sm.cardCommissions).toFixed(2)}</span></div>` : ''}
  ${sm.debtPayments > 0 ? `<div class="row"><span>Cobro de cuentas:</span><span>+S/ ${sm.debtPayments.toFixed(2)}</span></div>` : ''}
  ${sm.otherDeposits > 0 ? `<div class="row"><span>Otros depósitos:</span><span>+S/ ${sm.otherDeposits.toFixed(2)}</span></div>` : ''}
  ${sm.purchasePayments > 0 ? `<div class="row"><span>Pago a proveedores:</span><span>-S/ ${sm.purchasePayments.toFixed(2)}</span></div>` : ''}
  ${sm.expensePayments > 0 ? `<div class="row"><span>Gastos pagados:</span><span>-S/ ${sm.expensePayments.toFixed(2)}</span></div>` : ''}
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

