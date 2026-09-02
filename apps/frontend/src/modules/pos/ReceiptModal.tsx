import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { X, Printer, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatCurrency, PAYMENT_METHOD_LABELS, cn } from '@/lib/utils';
import { api, API_ORIGIN } from '@/services/api';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { parseVoiceCommand } from './voiceCommands';

interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  // "kg"/"g"/"l"/"ml"/"und" — ausente sólo en ventas de antes de este campo
  // (ver sales.service.ts/store.service.ts, que lo derivan del producto).
  unit?: string;
}

interface ReceiptPayment {
  method: string;
  amount: number;
}

interface GeneratedCoupon {
  code: string;
  discountPercent: number;
  expiresAt: string;
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
  generatedCoupon?: GeneratedCoupon | null;
  pointsEarned?: number;
  pointsRedeemed?: number;
  offlinePending?: boolean;
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
    showPoints: get('receipt_show_points', 'true') !== 'false',
    showCoupon: get('receipt_show_coupon', 'true') !== 'false',
    showQr: get('receipt_show_qr', 'true') !== 'false',
  };
}

const QR_SIZE_PX = 120;

// La tienda online (a diferencia del POS) pega el peso al nombre del
// producto, ej. "Arroz Costeño 1kg (2.041 kg)" — así quedó guardado en
// ventas de antes de que existiera item.unit (ver sales.service.ts/
// store.service.ts). Se limpia ese sufijo del nombre mostrado y, si
// item.unit no vino (venta vieja), se recupera la unidad de ahí mismo.
// Ojo: nombres como "Aceite Cocinero 900ml (combo)" NO deben interpretarse
// como granel — sólo se reconoce el paréntesis si termina en una unidad de
// peso/volumen real (kg, g, l, ml) o "und"/"unidad".
function splitProductNameAndUnit(name: string): { displayName: string; unit: string | null } {
  const match = name.match(/^(.*)\s\([\d.,]+\s*(kg|g|l|ml|und|unidad)\)\s*$/i);
  if (match) return { displayName: match[1].trim(), unit: match[2].toLowerCase() };
  return { displayName: name, unit: null };
}

// La columna Unidad debe leer siempre igual para "no es a granel" — pero
// según de dónde venga (product.bulkUnit configurado como "unidad" en vez
// de "und", o el sufijo legado del nombre) a veces llegaba "und" y otras
// veces "unidad", inconsistencia que se nota fea en el ticket. Se reduce
// siempre a "und"; kg/g/l/ml quedan tal cual.
function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return u === 'unidad' || u === 'unidades' || u === 'u' ? 'und' : u;
}

// Máximo 2 decimales — el peso real se guarda con 3 (ej. 2.041 kg) pero
// mostrar el tercero en el ticket sólo alarga la columna sin aportar nada
// que el cliente necesite ver.
function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}

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
    // lado, y ese margen suele ser más ancho de lo que el driver reporta.
    // Vamos conservadores (nominal - 14mm) para no seguir comiéndonos los
    // costados; si sobra papel en blanco es preferible a recortar texto.
    const printableWidthMm = Math.max(widthMm - 14, 36);
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
        body {
          font-family: 'Courier New', monospace; font-size: 11px; padding: 0;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
          /* Un trazo delgado es casi todo borde antialiaseado — el driver
             térmico lo difumina. En negrita el trazo tiene más negro sólido
             y sale nítido, así que todo el ticket va en negrita. */
          font-weight: 700;
        }
        .ticket { width: ${printableWidthMm}mm; margin: 0 auto; }
        img { max-width: 100%; image-rendering: pixelated; image-rendering: crisp-edges; }
        .center { text-align: center; }
        .bold { font-weight: 700; }
        .line { border-top: 2px solid #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; }
        .total-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
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

  const handleVoiceResult = useCallback((transcript: string) => {
    const command = parseVoiceCommand(transcript);
    if (command.type === 'PRINT') {
      handlePrint();
      return;
    }
    toast.error('Solo puedo "imprimir" el ticket desde aquí.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isListening, toggle: toggleListening, isSupported: voiceSupported } = useVoiceRecognition({
    onResult: handleVoiceResult,
  });

  const date = new Date(data.createdAt);
  const dateStr = date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
  const timeStr = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-bold text-lg">Ticket de Venta</h2>
          <div className="flex gap-2">
            {voiceSupported && (
              <Button
                size="sm" variant="outline" onClick={toggleListening}
                title={isListening ? 'Toca para apagar el micrófono' : 'Decir "imprimir"'}
                className={cn(isListening && 'border-destructive text-destructive bg-destructive/10 animate-pulse')}>
                <Mic className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" onClick={handlePrint}>
              <Printer className="mr-1.5 h-4 w-4" />
              Imprimir
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {data.offlinePending && (
          <div className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-medium px-4 py-2 text-center border-b border-amber-500/20">
            ⚠ Sin conexión — esta venta se guardó localmente y se sincronizará sola cuando vuelva el internet.
          </div>
        )}

        {/* Ticket visual */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <div
            ref={printRef}
            className="font-mono text-xs bg-white text-black p-4 rounded border space-y-1"
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
            <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
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
            {/* Espacio arriba (separa del bloque anterior) pero nada abajo —
                esta línea debe quedar pegada a los encabezados de la tabla,
                como si fuera el borde superior de la tabla misma, para que
                se lea de un tirón "línea + CANT./UNID./PRODUCTO..." como el
                encabezado de la descripción de la venta. */}
            <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0 0 0' }} />

            {/* Items — tabla real de 5 columnas (Cant./Unid./Producto/P.Unit/
                Total) en una sola fila por producto, como en una boleta
                normal. table-layout:fixed reparte el ancho según las
                columnas de abajo sin importar qué tan largo sea el nombre —
                si no entra en una línea, lo envuelve dentro de su celda en
                vez de desbordar o desalinear el resto. */}
            {/* fontWeight explícito en cada th/td, no sólo heredado de
                body — las celdas de tabla son las únicas partes del ticket
                que no lo tenían puesto directo, y en la impresora térmica
                del cliente salían finas/borrosas mientras el resto (que sí
                lo trae en cada elemento) salía nítido. fontSize igual al
                resto del cuerpo del ticket (11px, no el 9px de "letra
                chica" de antes) — se quejaron de que costaba leerla. */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '11px', fontWeight: 700 }}>
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                {/* Mayúsculas + fontWeight 900 (más pesado que el 700 del
                    resto de la tabla) + letterSpacing, para que el
                    encabezado se distinga de las filas de datos a simple
                    vista — el navegador simula un trazo más grueso (negrita
                    sintética) cuando se pide un peso que la fuente no trae
                    de fábrica, por encima del 700 real que ya usa el resto.
                    Línea sólida (no punteada) para que se lea como el borde
                    de una tabla, no como parte del contenido. */}
                <tr style={{ borderBottom: '1.5px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '0 1px 3px 0', fontWeight: 900, letterSpacing: '0.4px' }}>CANT.</th>
                  <th style={{ textAlign: 'left', padding: '0 1px 3px 0', fontWeight: 900, letterSpacing: '0.4px' }}>UNID.</th>
                  <th style={{ textAlign: 'left', padding: '0 1px 3px 0', fontWeight: 900, letterSpacing: '0.4px' }}>PRODUCTO</th>
                  <th style={{ textAlign: 'right', padding: '0 1px 3px 0', fontWeight: 900, letterSpacing: '0.4px' }}>P.UNIT</th>
                  <th style={{ textAlign: 'right', padding: '0 0 3px 0', fontWeight: 900, letterSpacing: '0.4px' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, i) => {
                  const { displayName, unit: legacyUnit } = splitProductNameAndUnit(item.productName);
                  const unit = normalizeUnit(item.unit ?? legacyUnit ?? 'und');
                  // Línea entre cada fila (estilo tabla de verdad, no un
                  // bloque de texto corrido) — sólo abajo, nunca a los
                  // lados, mismo criterio de las tablas de tres líneas
                  // (formato tipo APA): separa filas sin enjaular columnas.
                  // Sólida, no punteada — se pidió que no se vea "a guiones".
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #000' }}>
                      <td style={{ padding: '3px 1px 3px 0', verticalAlign: 'top', fontWeight: 700 }}>{formatQty(item.quantity)}</td>
                      <td style={{ padding: '3px 1px 3px 0', verticalAlign: 'top', fontWeight: 700 }}>{unit}</td>
                      <td style={{ padding: '3px 1px 3px 0', verticalAlign: 'top', wordBreak: 'break-word', fontWeight: 700 }}>{displayName}</td>
                      <td style={{ padding: '3px 1px 3px 0', verticalAlign: 'top', textAlign: 'right', fontWeight: 700 }}>{item.unitPrice.toFixed(2)}</td>
                      <td style={{ padding: '3px 0 3px 0', verticalAlign: 'top', textAlign: 'right', fontWeight: 700 }}>{item.subtotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Una sola línea entre la tabla y el total — antes había dos
                (una justo después de la tabla y otra antes de TOTAL) que,
                sin descuento de por medio, quedaban una pegada a la otra y
                se veían como una línea doble/gruesa sin sentido. */}
            {Number(data.discountAmount) > 0 && (
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span>Descuento{data.pointsRedeemed ? ` (${data.pointsRedeemed} pts)` : ''}:</span>
                <span>-{formatCurrency(data.discountAmount)}</span>
              </div>
            )}
            <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
            <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
              <span>TOTAL:</span><span>{formatCurrency(data.totalAmount)}</span>
            </div>
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#666', marginTop: '2px' }}>
              <span>Precios incluyen impuestos</span><span>RTE</span>
            </div>
            <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0' }} />

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

            <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
            <p className="center" style={{ textAlign: 'center' }}>{s.footer}</p>

            {s.showPoints && Number(data.pointsEarned) > 0 && (
              <p className="center bold" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px', marginTop: '2px' }}>
                ⭐ Ganaste {data.pointsEarned} puntos de fidelización
              </p>
            )}

            {s.showCoupon && data.generatedCoupon && (
              <>
                <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
                <div className="center" style={{ textAlign: 'center', border: '2px solid #000', padding: '4px', marginTop: '2px' }}>
                  <p className="bold" style={{ fontWeight: 'bold', fontSize: '12px' }}>¡GANASTE UN CUPÓN!</p>
                  <p style={{ fontSize: '11px' }}>{data.generatedCoupon.discountPercent}% de descuento en tu próxima compra</p>
                  <p className="bold" style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '2px' }}>{data.generatedCoupon.code}</p>
                  <p style={{ fontSize: '9px', color: '#666' }}>
                    Válido hasta {new Date(data.generatedCoupon.expiresAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}
                  </p>
                </div>
              </>
            )}

            {s.showQr && qrDataUrl && (
              <>
                <div className="line" style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
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
