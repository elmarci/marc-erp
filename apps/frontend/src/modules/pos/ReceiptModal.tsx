import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { api, API_ORIGIN } from '@/services/api';

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
  notes?: string | null;
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

interface Setting { key: string; value: string }

function useBusinessSettings() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ data: Setting[] }>('/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const get = (key: string, fallback = '') => data?.find((s) => s.key === key)?.value || fallback;

  return {
    businessName: get('business_name', 'ERP MINIMARKET'),
    ruc: get('business_ruc'),
    address: get('business_address'),
    phone: get('business_phone'),
    // La versión "print" es blanco/negro puro (sin grises) — en térmica sale
    // nítida. Si el logo se subió antes de tener esta versión, usamos la de color.
    logoUrl: get('business_logo_print_url') || get('business_logo_url'),
    footer: get('receipt_footer', '¡Gracias por su compra!'),
    storeUrl: get('store_url'),
    printerWidthMm: Number(get('printer_width', '80')) || 80,
  };
}

const QR_SIZE_PX = 120;

export function ReceiptModal({ data, onClose }: ReceiptModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const s = useBusinessSettings();
  const logoSrc = s.logoUrl ? (s.logoUrl.startsWith('http') ? s.logoUrl : `${API_ORIGIN}${s.logoUrl}`) : null;

  useEffect(() => {
    if (!s.storeUrl) { setQrDataUrl(null); return; }
    // Sin margen y en blanco/negro puro (default de la librería) — el tamaño
    // generado coincide con el tamaño mostrado para no reescalar la imagen
    // (reescalar introduce suavizado/blur en una impresora térmica monocroma).
    QRCode.toDataURL(s.storeUrl, { margin: 0, width: QR_SIZE_PX })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [s.storeUrl]);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;

    // Impresión vía iframe oculto: evita la ventana emergente adicional que
    // exigía confirmar la impresión dos veces, y fija el tamaño de página al
    // ancho real del rollo térmico (sin desperdiciar hoja A4/carta).
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }

    const widthMm = s.printerWidthMm;
    // Las impresoras térmicas reservan un margen físico no imprimible a cada
    // lado (ej. la Epson TM-T20 de 80mm solo imprime ~72mm reales). Si el
    // contenido llena el ancho nominal completo, el driver recorta texto en
    // ambos bordes. Dejamos ~4mm de colchón por lado y centramos.
    const printableWidthMm = Math.max(widthMm - 8, 40);
    doc.open();
    doc.write(`
      <html><head><title>Ticket ${data.saleNumber}</title>
      <style>
        @page { size: ${widthMm}mm auto; margin: 0; }
        * {
          margin: 0; padding: 0; box-sizing: border-box;
          /* Térmica = blanco/negro puro. Cualquier gris (color, antialiasing
             de texto/imágenes) se difumina al tratar de simular tonos con
             puntos — de ahí el efecto "borroso". Todo a negro sólido. */
          color: #000 !important;
          -webkit-font-smoothing: none;
          text-rendering: optimizeSpeed;
        }
        html, body { width: ${widthMm}mm; }
        body { font-family: 'Courier New', monospace; font-size: 11px; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .ticket { width: ${printableWidthMm}mm; margin: 0 auto; }
        img { max-width: 100%; image-rendering: pixelated; image-rendering: crisp-edges; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; }
        .total-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; }
      </style></head>
      <body><div class="ticket">${content}</div></body></html>
    `);
    doc.close();

    const cleanup = () => { if (iframe.parentNode) document.body.removeChild(iframe); };
    iframe.contentWindow?.addEventListener('afterprint', cleanup);
    // Respaldo por si el navegador no dispara afterprint (algunos WebViews)
    setTimeout(cleanup, 5000);

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };
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
            {logoSrc && (
              <div className="center" style={{ textAlign: 'center', marginBottom: '4px' }}>
                <img src={logoSrc} alt={s.businessName} style={{ maxHeight: '60px', maxWidth: '100%', display: 'inline-block' }} />
              </div>
            )}
            <p className="center bold" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>{s.businessName}</p>
            {s.ruc && <p className="center" style={{ textAlign: 'center' }}>RUC: {s.ruc}</p>}
            {s.address && <p className="center" style={{ textAlign: 'center', fontSize: '10px' }}>{s.address}</p>}
            {s.phone && <p className="center" style={{ textAlign: 'center', fontSize: '10px' }}>Tel: {s.phone}</p>}
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
            {data.notes?.startsWith('Pedido web') && (
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between', color: '#166534', fontWeight: 'bold' }}>
                <span>Canal:</span><span>🌐 Venta Online</span>
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
            {Number(data.discountAmount) > 0 && (
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Descuento:</span><span>-{formatCurrency(data.discountAmount)}</span>
              </div>
            )}
            <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
            <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
              <span>TOTAL:</span><span>{formatCurrency(data.totalAmount)}</span>
            </div>
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>Precios incluyen impuestos</span><span>RTE</span>
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
            <p className="center" style={{ textAlign: 'center' }}>{s.footer}</p>

            {qrDataUrl && (
              <>
                <div className="line" style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
                <div className="center" style={{ textAlign: 'center', marginTop: '4px' }}>
                  <img src={qrDataUrl} alt="Visítanos en línea" style={{ display: 'inline-block', width: `${QR_SIZE_PX}px`, height: `${QR_SIZE_PX}px` }} />
                  <p style={{ fontSize: '10px', marginTop: '2px' }}>Visítanos en línea</p>
                  <p style={{ fontSize: '9px', color: '#555' }}>{s.storeUrl.replace(/^https?:\/\//, '')}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
