import { api } from '@/services/api';
import { printThermalHtml } from '@/lib/printThermal';

interface DebtPaymentReceiptData {
  customerName: string;
  paidAt: string;
  amount: number;
  method: string;
  appliedTo: Array<{ saleNumber: string; amount: number }>;
  remaining: number;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', TRANSFER: 'Transferencia',
  DEBIT_CARD: 'Tarjeta débito', CREDIT_CARD: 'Tarjeta crédito', OTHER: 'Otro',
};

// Recibo imprimible del pago de una deuda, para entregarle al cliente como
// comprobante — usa el mismo helper térmico que el ticket de venta y el
// arqueo, en vez del componente completo de ticket, ya que no hay ítems de
// productos que mostrar aquí.
export async function printDebtPaymentReceipt(data: DebtPaymentReceiptData) {
  let businessName = 'Minimarket';
  try {
    const res = await api.get<{ data: Array<{ key: string; value: string }> }>('/settings');
    businessName = res.data.data.find((s) => s.key === 'business_name')?.value || businessName;
  } catch {
    // si falla, se imprime igual con el nombre genérico
  }

  const body = `
  <p class="c b" style="font-size:14px">${businessName}</p>
  <p class="c b">RECIBO DE PAGO</p>
  <div class="line"></div>
  <div class="row"><span>Cliente:</span><span>${data.customerName}</span></div>
  <div class="row"><span>Fecha:</span><span>${new Date(data.paidAt).toLocaleString('es-PE')}</span></div>
  <div class="row"><span>Método:</span><span>${METHOD_LABELS[data.method] ?? data.method}</span></div>
  <div class="line"></div>
  <p class="b">Aplicado a:</p>
  ${data.appliedTo.map((a) => `<div class="row"><span>${a.saleNumber}</span><span>S/ ${a.amount.toFixed(2)}</span></div>`).join('')}
  <div class="line"></div>
  <div class="row b" style="font-size:13px"><span>TOTAL PAGADO:</span><span>S/ ${data.amount.toFixed(2)}</span></div>
  <div class="line"></div>
  <div class="row b"><span>Saldo pendiente:</span><span>S/ ${data.remaining.toFixed(2)}</span></div>
  <p class="c" style="margin-top:8px">¡Gracias por su pago!</p>`;
  await printThermalHtml('Recibo de pago', body);
}
