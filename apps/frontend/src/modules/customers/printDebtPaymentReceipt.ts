import { api } from '@/services/api';

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
// comprobante. Reutiliza el mismo patrón sencillo del arqueo (ventana nueva +
// HTML inline) en vez del componente completo de ticket de venta, ya que
// no hay ítems de productos que mostrar aquí.
export async function printDebtPaymentReceipt(data: DebtPaymentReceiptData) {
  let businessName = 'Minimarket';
  try {
    const res = await api.get<{ data: Array<{ key: string; value: string }> }>('/settings');
    businessName = res.data.data.find((s) => s.key === 'business_name')?.value || businessName;
  } catch {
    // si falla, se imprime igual con el nombre genérico
  }

  const win = window.open('', '_blank', 'width=320,height=600');
  if (!win) return;
  win.document.write(`<html><head><title>Recibo de pago</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:280px;padding:8px;font-weight:700}
  .c{text-align:center}.b{font-weight:700}.line{border-top:1px dashed #000;margin:4px 0}
  .row{display:flex;justify-content:space-between}</style></head><body>
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
  <p class="c" style="margin-top:8px">¡Gracias por su pago!</p>
  </body></html>`);
  win.document.close();
  win.focus();
  win.print();
  win.close();
}
