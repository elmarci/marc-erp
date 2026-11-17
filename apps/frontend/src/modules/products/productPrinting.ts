// Impresión de productos: etiquetas de precio con código de barras y lista
// de precios A4. Se movió tal cual desde ProductsPage (sin cambios de diseño
// de las etiquetas impresas).
import JsBarcode from 'jsbarcode';
import { MARC_LOGO_DATA_URI } from '@/assets/marcLogo';

/* ─── Impresión de etiquetas de precio (para pegar en los portaprecios) ───
 * Tarjeta horizontal de ~5.2cm de alto en 3 zonas: logo circular, bloque de
 * nombre/variante con línea verde divisoria, precio en placa azul — y el
 * código de barras al pie con el número aparte en texto plano (no la
 * tipografía de JsBarcode, que se ve desalineada en el número). */
function barcodeSvgMarkup(value: string): string {
  // Los códigos de barra reales de los proveedores son EAN-13 (12-13
  // dígitos) — se renderizan como tal para que salga el patrón correcto.
  // Los códigos internos (cuando el producto no tiene barcode de fábrica)
  // no son EAN-13 válido, así que caen a CODE128, que acepta cualquier texto.
  const opts = { width: 1.7, height: 24, displayValue: false, margin: 0 };
  if (/^\d{12,13}$/.test(value)) {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, value, { format: 'EAN13', ...opts });
      return svg.outerHTML;
    } catch { /* dígito verificador inválido — cae a CODE128 abajo */ }
  }
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, { format: 'CODE128', ...opts });
    return svg.outerHTML;
  } catch {
    return '';
  }
}

// La mayoría de productos del catálogo se llaman "Tipo Marca Variante"
// (ej. "Leche Bonle Protección 390g", "Detergente Ariel 1kg") — separar la
// primera palabra como nombre grande y el resto como variante reproduce el
// mismo efecto de "producto" + "presentación" sin un campo nuevo. Se filtra
// el guión suelto de nombres tipo "Aceite - Beltrán Premium 1L" para que no
// quede un "-" colgando al inicio del subtítulo.
function splitProductName(name: string): { title: string; subtitle: string } {
  const parts = name.trim().split(/\s+/).filter(p => p !== '-');
  if (parts.length <= 1) return { title: name, subtitle: '' };
  return { title: parts[0], subtitle: parts.slice(1).join(' ') };
}

// `win` se recibe ya abierto (ver handlePrint): abrir la ventana recién acá
// significaba hacerlo después del `await` de generar códigos, es decir fuera
// del gesto de clic original — en ese caso algunos navegadores (sobre todo
// en tablets/Android) ya no consideran el `window.print()` posterior como
// disparado por el usuario y lo ignoran en silencio, obligando a un segundo
// "Imprimir" manual dentro de la ventana para que recién ahí funcione.
export function printBarcodeCatalog(products: Array<{ name: string; barcode: string; salePrice: number }>, win: Window) {
  const cards = products.map(p => {
    const { title, subtitle } = splitProductName(p.name);
    return `
    <div class="card">
      <div class="row">
        <div class="logo"><img src="${MARC_LOGO_DATA_URI}" /></div>
        <div class="name-block">
          <p class="title">${title}</p>
          ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
        </div>
        <div class="price-badge">
          <span class="tag">S/</span>
          <span class="amount">${Number(p.salePrice).toFixed(2)}</span>
          <span class="swoosh"></span>
        </div>
      </div>
      <div class="divider"></div>
      <div class="barcode-block">
        ${barcodeSvgMarkup(p.barcode)}
        <span class="barcode-code">${p.barcode}</span>
      </div>
    </div>`;
  }).join('');
  win.document.write(`<html><head><title>Etiquetas de precio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
      @page { size: A4; margin: 8mm; }
      body { font-family: Arial, Helvetica, sans-serif; }
      .grid { display: flex; flex-wrap: wrap; gap: 4.2mm; }
      .card {
        width: 90mm; height: 52mm;
        border-radius: 3.8mm; overflow: hidden;
        border: 5px solid #1e3a8a; background: #fff; page-break-inside: avoid;
        display: flex; flex-direction: column;
        padding: 3.4mm; gap: 2mm;
      }
      /* Sin flex:1 — el alto lo da el contenido, y ahora el contenido más
         alto de la fila es la placa de precio (a propósito: es lo que más
         quiere ver el cliente). El código de barras absorbe lo que sobra. */
      .row { display: flex; align-items: center; gap: 1.8mm; }
      .logo {
        width: 70px; height: 70px; border-radius: 50%; overflow: hidden;
        position: relative; flex-shrink: 0; background: #fff;
        box-shadow: 0 0 0 3px #fff, 0 0 0 5px #22c55e;
      }
      .logo img { position: absolute; top: 0; right: 0; height: 100%; width: auto; }
      .name-block { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
      .title {
        font-size: 27px; font-weight: 900; color: #111827; text-transform: uppercase;
        line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      /* Chip azul para la variante/presentación (ej. "390G", "PROTECCIÓN
         390G") — imita el rótulo tipo "600ML" de la referencia en vez del
         texto gris plano de antes. */
      .subtitle {
        display: inline-block; max-width: 100%; align-self: flex-start;
        font-size: 11px; font-weight: 800; color: #fff; background: #1e3a8a;
        text-transform: uppercase; letter-spacing: .02em;
        padding: 1mm 2.4mm; border-radius: 1.5mm;
        white-space: nowrap; overflow: hidden;
      }
      /* Placa de precio — el elemento más grande de la etiqueta. Bebas Neue
         es una tipografía condensada (angosta por diseño): a igual tamaño
         ocupa bastante menos ancho por dígito que Arial, así que el precio
         puede verse grande sin robarle todo el espacio al nombre. El tag
         verde "S/" y el subrayado imitan el panel de precio de la
         referencia (Coca-Cola Zero) en vez del layout "S/ + monto en fila". */
      .price-badge {
        flex-shrink: 0; background: #1e3a8a; color: #fff;
        border-radius: 3mm; padding: 2mm 3.2mm 3mm; min-width: 26mm;
        display: flex; flex-direction: column; align-items: center;
        font-family: 'Bebas Neue', Arial, sans-serif;
      }
      .price-badge .tag {
        align-self: flex-end; transform: translateY(-1.5mm);
        background: #22c55e; color: #fff; font-family: Arial, Helvetica, sans-serif;
        font-size: 10px; font-weight: 800; text-transform: uppercase;
        padding: 1mm 2.4mm; border-radius: 1.5mm; margin-bottom: -1mm;
      }
      .price-badge .amount { font-size: 64px; font-weight: 400; letter-spacing: .01em; line-height: .85; }
      .price-badge .swoosh { margin-top: 1.2mm; width: 60%; height: 2.5px; background: #22c55e; border-radius: 2px; }
      /* Ancho fijado por JS al ancho real de .name-block — así la línea no
         se mete debajo del logo ni de la placa de precio. */
      .divider { flex-shrink: 0; height: 3px; background: #22c55e; border-radius: 1.5px; width: 0; }
      /* Absorbe el espacio vertical restante (flex:1) y empuja su
         contenido hacia abajo — así no queda como flotando en medio de un
         hueco. A la izquierda (no ocupa todo el ancho) para que no compita
         en protagonismo con el nombre y el precio, pero ya no tan angosto
         como para dejar un vacío grande a la derecha. */
      .barcode-block {
        flex: 1; min-height: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: flex-end;
        align-self: flex-start; width: 76%;
      }
      .barcode-block svg { width: 100%; height: auto; max-height: 10mm; }
      .barcode-code { font-size: 10px; font-weight: 600; color: #333; letter-spacing: .04em; font-family: 'Courier New', monospace; margin-top: 0.5mm; }
    </style></head><body>
    <div class="grid">${cards}</div>
    <script>
      // Se espera a que cargue Bebas Neue (fuente del precio) antes de
      // medir nada — si no, la placa de precio mide su ancho con la
      // tipografía de respaldo y el ajuste del nombre queda mal calculado
      // (el precio cambia de ancho apenas la fuente real termina de cargar).
      function layoutAndPrint() {
        // El ancho disponible para el nombre depende de cuánto ocupe la
        // placa de precio (varía según la cantidad de dígitos) — en vez de
        // niveles fijos por cantidad de letras (que igual se cortaban en
        // casos límite), se mide el ancho real y se achica la fuente sólo
        // lo necesario para que el nombre completo siempre quepa entero.
        // Se mide con canvas (measureText) en vez de leer scrollWidth del
        // propio <p>: al ser un hijo de un flex column, se estira al ancho
        // del contenedor (align-items:stretch por defecto), así que su
        // scrollWidth termina siendo ~ su propio ancho ya estirado, no el
        // ancho real del texto — compararlo contra sí mismo con ese error
        // de redondeo hacía que el achicado nunca se detuviera.
        var measureCanvas = document.createElement('canvas');
        var measureCtx = measureCanvas.getContext('2d');
        document.querySelectorAll('.card').forEach(function (card) {
          var title = card.querySelector('.title');
          var nameBlock = card.querySelector('.name-block');
          var maxWidth = nameBlock.getBoundingClientRect().width - 2; // margen de seguridad
          var text = title.textContent.toUpperCase();
          var fontSize = 27;
          function textWidthAt(size) {
            measureCtx.font = '900 ' + size + 'px Arial, Helvetica, sans-serif';
            return measureCtx.measureText(text).width;
          }
          while (textWidthAt(fontSize) > maxWidth && fontSize > 11) fontSize -= 1;
          title.style.fontSize = fontSize + 'px';

          // El chip de variante (antes texto gris con line-clamp) ahora es
          // una sola línea con fondo — se achica igual que el nombre en vez
          // de recortar con "..." para no perder info como "390G" o
          // "PROTECCIÓN" en nombres largos.
          var subtitle = card.querySelector('.subtitle');
          if (subtitle) {
            var subMaxWidth = nameBlock.getBoundingClientRect().width - 20; // padding horizontal del chip
            var subText = subtitle.textContent.toUpperCase();
            var subSize = 11;
            function subWidthAt(size) {
              measureCtx.font = '800 ' + size + 'px Arial, Helvetica, sans-serif';
              return measureCtx.measureText(subText).width;
            }
            while (subWidthAt(subSize) > subMaxWidth && subSize > 7) subSize -= 1;
            subtitle.style.fontSize = subSize + 'px';
          }

          var divider = card.querySelector('.divider');
          var cardBox = card.getBoundingClientRect();
          var nameBox = nameBlock.getBoundingClientRect();
          var paddingLeft = parseFloat(getComputedStyle(card).paddingLeft);
          divider.style.marginLeft = (nameBox.left - cardBox.left - paddingLeft) + 'px';
          divider.style.width = nameBox.width + 'px';
        });
        // Reenfocar justo antes de imprimir: si la ventana perdió el foco
        // mientras se esperaba la fuente, algunos navegadores ignoran el
        // print() silenciosamente y hay que volver a pedirlo a mano.
        window.focus();
        window.print();
      }
      // La fuente ya se precarga desde la app principal antes de abrir esta
      // ventana (ver useEffect en BarcodeCatalogModal), así que normalmente
      // ya está en caché y esto resuelve casi al instante — el timeout de
      // 400ms es sólo un respaldo, no el camino esperado.
      var fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
      Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 400); })]).then(layoutAndPrint);
    </script>
    </body></html>`);
  win.document.close();
}

/* ─── Impresión de lista de precios (A4, para dejar con los cajeros) ────── */
export function printPriceList(products: Array<{
  name: string; internalCode: string | null; barcode: string | null; salePrice: number;
  currentStock: number; category: { name: string; parent?: { name: string } | null };
}>) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  const rows = products.map((p, i) => `
    <tr class="${i % 2 === 0 ? 'even' : ''}">
      <td class="code">${p.internalCode ?? p.barcode ?? '—'}</td>
      <td>${p.name}</td>
      <td class="muted">${p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name}</td>
      <td class="right price">S/ ${Number(p.salePrice).toFixed(2)}</td>
      <td class="right">${p.currentStock}</td>
    </tr>`).join('');
  const now = new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });
  win.document.write(`<html><head><title>Lista de Precios</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size: A4; margin: 14mm 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; color:#111; }
      header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:14px; }
      h1 { font-size:20px; letter-spacing:.02em; }
      .meta { font-size:11px; color:#555; text-align:right; line-height:1.5; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      thead th { text-align:left; background:#111; color:#fff; padding:7px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
      td { padding:5px 8px; border-bottom:1px solid #ddd; }
      tr.even td { background:#f4f4f4; }
      tbody tr { page-break-inside: avoid; }
      .code { font-family: 'Courier New', monospace; font-weight:bold; white-space:nowrap; }
      .right { text-align:right; }
      .price { font-weight:bold; }
      .muted { color:#666; }
      footer { margin-top:12px; font-size:10px; color:#888; text-align:right; }
    </style></head><body>
    <header>
      <h1>Lista de Precios</h1>
      <div class="meta">Generado: ${now}<br/>${products.length} producto(s)</div>
    </header>
    <table>
      <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="right">Precio</th><th class="right">Stock</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <footer>ERP Minimarket</footer>
    </body></html>`);
  win.document.close(); win.focus(); win.print();
}
