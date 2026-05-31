import { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/utils';

interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface ReceiptPayment {
  method: string;
  amount: number;
}

export interface ReceiptData {
  saleNumber: string;
  createdAt: string;
  cashierName: string;
  customerName?: string | null;
  documentType: string;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  payments: ReceiptPayment[];
  change?: number;
}

interface ReceiptModalProps {
  data: ReceiptData;
  onClose: () => void;
}

export function ReceiptModal({ data, onClose }: ReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=320,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>Ticket ${data.saleNumber}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; padding: 8px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; }
        .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; }
      </style></head>
      <body>${content}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const date = new Date(data.createdAt);
  const dateStr = date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-bold text-lg">Ticket de Venta</h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePrint}>
              <Printer className="mr-1.5 h-4 w-4" />
              Imprimir
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Ticket visual */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <div
            ref={printRef}
            className="font-mono text-xs bg-white text-black p-4 rounded border border-dashed space-y-1"
          >
            <p className="center bold" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>ERP MINIMARKET</p>
            <p className="center" style={{ textAlign: 'center' }}>RUC: 20000000001</p>
            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{data.documentType === 'BOLETA' ? 'BOLETA' : data.documentType === 'FACTURA' ? 'FACTURA' : 'TICKET'}</span>
              <span className="bold" style={{ fontWeight: 'bold' }}>{data.saleNumber}</span>
            </div>
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Fecha:</span><span>{dateStr} {timeStr}</span>
            </div>
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Cajero:</span><span>{data.cashierName}</span>
            </div>
            {data.customerName && (
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cliente:</span><span>{data.customerName}</span>
              </div>
            )}
            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            {/* Items */}
            {data.items.map((item, i) => (
              <div key={i}>
                <p className="bold" style={{ fontWeight: 'bold' }}>{item.productName}</p>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>  {item.quantity} x {formatCurrency(item.unitPrice)}</span>
                  <span>{formatCurrency(item.subtotal)}</span>
                </div>
              </div>
            ))}

            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span><span>{formatCurrency(data.subtotal)}</span>
            </div>
            {Number(data.discountAmount) > 0 && (
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Descuento:</span><span>-{formatCurrency(data.discountAmount)}</span>
              </div>
            )}
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>IGV (18%):</span><span>{formatCurrency(data.taxAmount)}</span>
            </div>
            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
            <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
              <span>TOTAL:</span><span>{formatCurrency(data.totalAmount)}</span>
            </div>
            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            {/* Pagos */}
            {data.payments.map((p, i) => (
              <div key={i} className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}:</span>
                <span>{formatCurrency(p.amount)}</span>
              </div>
            ))}
            {data.change != null && data.change > 0 && (
              <div className="row bold" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>Vuelto:</span><span>{formatCurrency(data.change)}</span>
              </div>
            )}

            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
            <p className="center" style={{ textAlign: 'center' }}>¡Gracias por su compra!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
