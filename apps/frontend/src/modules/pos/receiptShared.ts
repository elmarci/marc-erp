// Ticket de venta: tipos, datos del negocio para el ticket e impresión por
// el navegador (iframe oculto al ancho del rollo térmico).
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  // "kg"/"g"/"l"/"ml"/"und" — ausente sólo en ventas de antes de este campo
  // (ver sales.service.ts/store.service.ts, que lo derivan del producto).
  unit?: string;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  // Comisión de tarjeta sobre este pago — en el ticket el pago se muestra
  // por lo realmente cobrado (amount + commissionAmount).
  commissionAmount?: number;
}

export interface GeneratedCoupon {
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
  // Comisión por pago con tarjeta, aparte de totalAmount. commissionPercent
  // ausente = se usa la tasa vigente en Configuración.
  commissionAmount?: number;
  commissionPercent?: number;
  payments: ReceiptPayment[];
  change?: number;
  generatedCoupon?: GeneratedCoupon | null;
  pointsEarned?: number;
  pointsRedeemed?: number;
  offlinePending?: boolean;
}

interface Setting { key: string; value: string }

export function useBusinessSettings() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<{ data: Setting[] }>('/settings')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const get = (key: string, fallback = '') => data?.find((s) => s.key === key)?.value || fallback;

  return {
    loaded: !!data,
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
    cardCommissionPercent: Number(get('card_commission_percent', '3.5')) || 0,
  };
}


export const QR_SIZE_PX = 120;

/** Imprime el HTML del ticket con la impresora del equipo. */
export function printTicketHtml(content: string, widthMm: number, saleNumber: string) {
  const data = { saleNumber };
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
}
