import { api } from '@/services/api';

let cachedWidthMm: number | null = null;

async function getPrinterWidthMm(): Promise<number> {
  if (cachedWidthMm != null) return cachedWidthMm;
  try {
    const res = await api.get<{ data: Array<{ key: string; value: string }> }>('/settings');
    const raw = res.data.data.find((s) => s.key === 'printer_width')?.value;
    cachedWidthMm = Number(raw) || 80;
  } catch {
    cachedWidthMm = 80;
  }
  return cachedWidthMm;
}

/**
 * Imprime un comprobante angosto (arqueo, recibo, comprobante de compra...)
 * con el mismo ajuste que ya usa el ticket de venta para que la térmica lo
 * saque nítido: todo en negrita y negro puro, sin antialiasing — un trazo
 * delgado es casi todo borde antialiaseado, y el driver térmico lo difumina
 * tratando de simular el gris con puntos. También usa un iframe oculto en
 * vez de ventana emergente, para fijar el tamaño de página al ancho real
 * del rollo (configurado en Ajustes) y no pedir confirmar la impresión dos veces.
 */
export async function printThermalHtml(title: string, bodyHtml: string) {
  const widthMm = await getPrinterWidthMm();
  const printableWidthMm = Math.max(widthMm - 14, 36);

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

  doc.open();
  doc.write(`
    <html><head><title>${title}</title>
    <style>
      @page { size: ${widthMm}mm auto; margin: 0; }
      * {
        margin: 0; padding: 0; box-sizing: border-box;
        color: #000 !important;
        -webkit-font-smoothing: none;
        text-rendering: optimizeSpeed;
      }
      html, body { width: ${widthMm}mm; }
      body {
        font-family: 'Courier New', monospace; font-size: 12px; padding: 8px 0;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
        font-weight: 700;
      }
      .ticket { width: ${printableWidthMm}mm; margin: 0 auto; }
      .c { text-align: center; }
      .b { font-weight: 700; }
      .line { border-top: 2px dashed #000; margin: 5px 0; }
      .row { display: flex; justify-content: space-between; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 2px; }
      td { padding: 3px 0; }
    </style></head>
    <body><div class="ticket">${bodyHtml}</div></body></html>
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
