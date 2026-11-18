import { formatCost } from '@/lib/utils';
import { printThermalHtml } from '@/lib/printThermal';
import { OrderDetail, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from './types';

export function printPurchaseReceipt(order: OrderDetail) {
  const rows = order.items.map(i => `
    <tr>
      <td>${i.product.name}${i.isBonus ? ' <b>(bonif.)</b>' : ''}</td>
      <td style="text-align:center">${Number(i.orderedQty).toLocaleString('es-PE', { maximumFractionDigits: 3 })}</td>
      <td style="text-align:right">${i.isBonus ? 'GRATIS' : formatCost(i.unitCost)}</td>
      <td style="text-align:right">S/ ${Number(i.subtotal).toFixed(2)}</td>
    </tr>`).join('');
  const outstanding = Number(order.totalAmount) - Number(order.paidAmount);
  const paymentsRows = order.payments.map(p => `
    <div class="row"><span>${PAYMENT_METHOD_LABELS[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ''}:</span><span>S/ ${Number(p.amount).toFixed(2)}</span></div>`).join('');
  const body = `
    <p class="c b" style="font-size:14px">COMPROBANTE DE COMPRA</p>
    <p class="c">${order.orderNumber}</p>
    <div class="line"></div>
    <div class="row"><span>Proveedor:</span><span>${order.supplier.businessName}</span></div>
    ${order.supplierInvoice ? `<div class="row"><span>Documento:</span><span>${order.supplierInvoice}</span></div>` : ''}
    <div class="row"><span>Fecha:</span><span>${new Date(order.createdAt).toLocaleString('es-PE')}</span></div>
    <div class="row"><span>Estado de pago:</span><span>${PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span></div>
    <div class="line"></div>
    <table><thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Costo</th><th style="text-align:right">Subt.</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="line"></div>
    <div class="row b" style="font-size:14px"><span>TOTAL:</span><span>S/ ${Number(order.totalAmount).toFixed(2)}</span></div>
    ${order.payer ? `<div class="row"><span>Financiado por:</span><span>${order.payer.name} — S/ ${Number(order.payerAmount).toFixed(2)}</span></div>` : ''}
    ${paymentsRows ? `<div class="line"></div><p class="b">Pagos registrados:</p>${paymentsRows}` : ''}
    ${outstanding > 0.009 ? `<div class="row b"><span>Pendiente:</span><span>S/ ${outstanding.toFixed(2)}</span></div>` : ''}
    ${order.dueDate ? `<div class="row"><span>Vence:</span><span>${new Date(order.dueDate).toLocaleDateString('es-PE')}</span></div>` : ''}
    <p class="c" style="margin-top:10px">MARC ERP</p>`;
  printThermalHtml(`Compra ${order.orderNumber}`, body);
}

/* ─── Fuente y forma de pago (reutilizado en Registrar/Recibir/Pagar) ────── */
