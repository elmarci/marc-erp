import QRCode from 'qrcode';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils';
import type { ReceiptData } from './ReceiptModal';
import { splitProductNameAndUnit, normalizeUnit, formatQty } from './receiptFormat';
import type { PaperWidth } from './bluetoothPrinter';

/**
 * Arma el ticket en comandos ESC/POS (texto plano + imágenes en raster) para
 * la impresora Bluetooth. El contenido sigue al ticket de ReceiptModal.
 *
 * Texto en página de códigos PC437 (la que traen por defecto casi todas las
 * ticketeras) — tiene á é í ó ú ñ Ñ ü ¡ ¿. Lo que no exista ahí se cambia por
 * su versión sin tilde para que nunca salgan símbolos raros.
 */

export interface TicketSettings {
  businessName: string;
  ruc: string;
  address: string;
  phone: string;
  logoUrl: string | null; // URL absoluta
  footer: string;
  storeUrl: string;
  showPoints: boolean;
  showCoupon: boolean;
  showQr: boolean;
  cardCommissionPercent: number;
}

const ESC = 0x1b;
const GS = 0x1d;

const CP437: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8a,
  'ï': 0x8b, 'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
  'Ö': 0x99, 'Ü': 0x9a, 'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8,
};

function encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) { out.push(code); continue; }
    if (CP437[ch] != null) { out.push(CP437[ch]); continue; }
    const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (plain.length === 1 && plain.charCodeAt(0) < 0x7f) { out.push(plain.charCodeAt(0)); continue; }
    if (ch === '\n') { out.push(0x0a); continue; }
    // emojis y demás: se omiten
  }
  return out;
}

class Builder {
  private bytes: number[] = [];
  constructor(readonly cols: number) {
    this.raw(ESC, 0x40); // inicializar
    this.raw(ESC, 0x74, 0x00); // página de códigos PC437
  }
  raw(...b: number[]) { this.bytes.push(...b); return this; }
  align(a: 'left' | 'center' | 'right') { return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2); }
  bold(on: boolean) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(double: boolean) { return this.raw(GS, 0x21, double ? 0x11 : 0x00); }
  text(t: string) { this.bytes.push(...encode(t)); return this; }
  line(t = '') { return this.text(t).raw(0x0a); }
  rule(ch = '-') { return this.line(ch.repeat(this.cols)); }
  /** Texto a la izquierda y a la derecha en la misma línea. */
  pair(left: string, right: string, cols = this.cols) {
    const space = cols - left.length - right.length;
    if (space >= 1) return this.line(left + ' '.repeat(space) + right);
    return this.line(left).line(right.padStart(cols));
  }
  wrapped(t: string, cols = this.cols) { for (const l of wrap(t, cols)) this.line(l); return this; }
  image(img: Raster) {
    const bytesPerRow = img.width / 8;
    this.raw(GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, img.height & 0xff, (img.height >> 8) & 0xff);
    this.bytes.push(...img.data);
    return this;
  }
  feedAndCut() { return this.raw(ESC, 0x64, 4).raw(GS, 0x56, 0x42, 0x00); }
  build() { return new Uint8Array(this.bytes); }
}

function wrap(text: string, cols: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; } else if ((cur + ' ' + w).length <= cols) { cur += ' ' + w; } else { lines.push(cur); cur = w; }
    while (cur.length > cols) { lines.push(cur.slice(0, cols)); cur = cur.slice(cols); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const money = (n: number) => `S/ ${n.toFixed(2)}`;

/* ─── Imágenes (logo y QR) en raster monocromo ────────────────────────────── */

interface Raster { width: number; height: number; data: number[] }

function canvasToRaster(canvas: HTMLCanvasElement): Raster {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = width / 8;
  const data = new Array<number>(bytesPerRow * height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = px[i + 3] / 255;
      const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * a + 255 * (1 - a);
      if (lum < 128) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width, height, data };
}

function drawCentered(source: CanvasImageSource, srcW: number, srcH: number, maxW: number, maxH: number): HTMLCanvasElement {
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(maxW / 8) * 8; // ancho múltiplo de 8 (1 byte = 8 puntos)
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, Math.round((canvas.width - w) / 2), 0, w, h);
  return canvas;
}

async function loadLogo(url: string, dotsWidth: number): Promise<Raster | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const canvas = drawCentered(img, img.naturalWidth, img.naturalHeight, dotsWidth, 120);
    return canvasToRaster(canvas); // si el servidor no permite CORS, getImageData falla y se omite el logo
  } catch {
    return null;
  }
}

async function makeQr(text: string, dotsWidth: number): Promise<Raster | null> {
  try {
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, text, { margin: 0, width: 192 });
    return canvasToRaster(drawCentered(qr, qr.width, qr.height, dotsWidth, 192));
  } catch {
    return null;
  }
}

/* ─── Ticket ──────────────────────────────────────────────────────────────── */

export async function buildTicketEscpos(data: ReceiptData, s: TicketSettings, paper: PaperWidth): Promise<Uint8Array> {
  const cols = paper === 80 ? 48 : 32;
  const dots = paper === 80 ? 576 : 384;
  const b = new Builder(cols);

  b.align('center');
  if (s.logoUrl) {
    const logo = await loadLogo(s.logoUrl, Math.round(dots * 0.6));
    if (logo) b.image(logo);
  }
  b.bold(true).size(true);
  for (const l of wrap(s.businessName, Math.floor(cols / 2))) b.line(l);
  b.size(false).bold(false);
  if (s.ruc) b.line(`RUC: ${s.ruc}`);
  if (s.address) b.wrapped(s.address);
  if (s.phone) b.line(`Tel: ${s.phone}`);

  const date = new Date(data.createdAt);
  const dateStr = date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
  const timeStr = date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

  b.align('left').rule();
  const docLabel = data.documentType === 'BOLETA' ? 'BOLETA' : data.documentType === 'FACTURA' ? 'FACTURA' : 'TICKET';
  b.bold(true).pair(docLabel, data.saleNumber).bold(false);
  b.pair('Fecha:', `${dateStr} ${timeStr}`);
  b.pair('Cajero:', data.cashierName);
  if (data.customerName) b.pair('Cliente:', data.customerName);
  if (data.notes?.startsWith('Pedido web')) b.pair('Canal:', 'Venta Online');
  if (data.offlinePending) b.line('* Venta sin conexión (por sincronizar)');

  // Ítems: nombre en su(s) línea(s) y debajo "cant unid x p.unit ...... total"
  b.rule();
  b.bold(true).pair('PRODUCTO', 'TOTAL').bold(false);
  b.rule();
  for (const item of data.items) {
    const { displayName, unit: legacyUnit } = splitProductNameAndUnit(item.productName);
    const unit = normalizeUnit(item.unit ?? legacyUnit ?? 'und');
    b.wrapped(displayName);
    b.pair(`  ${formatQty(item.quantity)} ${unit} x ${item.unitPrice.toFixed(2)}`, item.subtotal.toFixed(2));
  }
  b.rule();

  if (Number(data.discountAmount) > 0) {
    b.pair(`Descuento${data.pointsRedeemed ? ` (${data.pointsRedeemed} pts)` : ''}:`, `-${money(Number(data.discountAmount))}`);
  }
  b.bold(true).size(true).pair('TOTAL:', money(data.totalAmount), Math.floor(cols / 2)).size(false).bold(false);
  const commission = Number(data.commissionAmount ?? 0);
  if (commission > 0) {
    b.pair(`Comisión tarjeta (${Number(data.commissionPercent || s.cardCommissionPercent)}%):`, money(commission));
    b.bold(true).pair('TOTAL A PAGAR:', money(data.totalAmount + commission)).bold(false);
  } else {
    b.pair('Comisión:', money(0));
  }
  b.pair('Precios incluyen impuestos', 'RTE');
  b.rule();

  for (const p of data.payments) {
    b.pair(`${PAYMENT_METHOD_LABELS[p.method] ?? p.method}:`, money(p.amount + Number(p.commissionAmount ?? 0)));
  }
  if (data.change != null && data.change > 0) b.bold(true).pair('Vuelto:', money(data.change)).bold(false);
  b.rule();

  b.align('center');
  b.wrapped(s.footer);
  if (s.showPoints && Number(data.pointsEarned) > 0) b.bold(true).line(`Ganaste ${data.pointsEarned} puntos`).bold(false);

  if (s.showCoupon && data.generatedCoupon) {
    b.rule('=');
    b.bold(true).line('¡GANASTE UN CUPÓN!').bold(false);
    b.wrapped(`${data.generatedCoupon.discountPercent}% de descuento en tu próxima compra`);
    b.bold(true).size(true).line(data.generatedCoupon.code).size(false).bold(false);
    b.line(`Válido hasta ${new Date(data.generatedCoupon.expiresAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}`);
    b.rule('=');
  }

  if (s.showQr && s.storeUrl) {
    const qr = await makeQr(s.storeUrl, dots);
    if (qr) {
      b.line().image(qr);
      b.line('Visítanos en línea');
      b.wrapped(s.storeUrl.replace(/^https?:\/\//, ''));
    }
  }

  b.align('left').feedAndCut();
  return b.build();
}

/** Ticket corto para probar la conexión y el ancho de papel. */
export function buildTestTicket(paper: PaperWidth, printerName: string): Uint8Array {
  const cols = paper === 80 ? 48 : 32;
  const b = new Builder(cols);
  b.align('center').bold(true).size(true).line('MARC').size(false).line('Prueba de impresión').bold(false);
  b.line(printerName);
  b.align('left').rule();
  b.pair('Papel:', `${paper} mm (${cols} letras)`);
  b.pair('Acentos:', 'áéíóú ñÑ ¡¿');
  b.rule();
  b.line('Si esta línea cabe completa, el ancho es correcto.'.slice(0, cols));
  b.feedAndCut();
  return b.build();
}
