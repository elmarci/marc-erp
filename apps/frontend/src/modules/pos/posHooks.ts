// Comportamientos de fondo del POS: diseño en una o dos columnas, validar que
// la caja siga abierta, refrescar el catálogo local y capturar el lector de
// códigos de barra. Movidos tal cual desde PosPage.
import { useEffect, useRef, useState } from 'react';
import { usePosStore } from '@/stores/posStore';
import { useProductCacheStore, type CachedProduct } from '@/stores/productCacheStore';
import { api } from '@/services/api';
import { routeScanToOffers } from './autoOffers';

// Cada cuánto se refresca en segundo plano el catálogo local (para el
// escaneo de códigos de barra y la grilla) mientras hay conexión.
const PRODUCT_CACHE_REFRESH_MS = 5 * 60 * 1000;
const PRODUCT_FULL_REFRESH_MS = 60 * 60 * 1000;

// Dos columnas (carrito + productos) en PC y en tablet horizontal; en
// celular y tablet vertical, pestañas Productos / Carrito.
const SPLIT_LAYOUT_QUERY = '(min-width: 1024px), (min-width: 760px) and (orientation: landscape)';
export function useIsSplitLayout() {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(SPLIT_LAYOUT_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(SPLIT_LAYOUT_QUERY);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return match;
}

export function useCashSessionWatch() {
  const { cashSessionId, clearCashSession } = usePosStore();
  // El POS se deja abierto todo el día: si la sesión que tiene guardada se cerró
  // (se cerró la caja desde otra pantalla o equipo, o cambió el turno), se
  // descarta y se busca la abierta — así no se intenta vender contra una caja cerrada.
  useEffect(() => {
    if (!cashSessionId) return;
    let cancelled = false;
    const validate = async () => {
      try {
        const res = await api.get<{ data: { status: string } }>(`/cash/sessions/${cashSessionId}`);
        if (!cancelled && res.data.data.status !== 'OPEN') clearCashSession();
      } catch {
        // sin conexión o falla puntual: se conserva la sesión, el backend igual valida al cobrar
      }
    };
    validate();
    const interval = setInterval(validate, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') validate(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', validate);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', validate);
    };
  }, [cashSessionId, clearCashSession]);
}

export function useCatalogRefresh() {
  // Copia local del catálogo activo (para escaneo de código de barras y
  // grilla) — se refresca mientras hay conexión, para tener con qué seguir
  // vendiendo si se cae el internet a mitad de turno.
  useEffect(() => {
    // Cada 5 min baja solo lo cambiado (precio, stock, productos nuevos o
    // retirados); el catálogo completo solo al abrir sin copia local o una vez
    // por hora como respaldo. Antes bajaba los ~2.000 productos cada 5 min.
    const refreshCatalog = async () => {
      if (!navigator.onLine) return;
      const { lastSyncedAt, lastFullSyncAt, products } = useProductCacheStore.getState();
      const needFull = !lastSyncedAt || !lastFullSyncAt || Object.keys(products).length === 0
        || Date.now() - new Date(lastFullSyncAt).getTime() > PRODUCT_FULL_REFRESH_MS;
      try {
        if (needFull) {
          const res = await api.get<{ data: CachedProduct[] }>('/products?limit=2000&status=ACTIVE');
          // Hora del servidor (cabecera Date), no la del equipo, que puede estar desfasada.
          const serverDate = res.headers['date'] ? new Date(res.headers['date'] as string) : null;
          useProductCacheStore.getState().setProducts(res.data.data, serverDate && !isNaN(serverDate.getTime()) ? serverDate.toISOString() : undefined);
        } else {
          const res = await api.get<{ data: { changed: CachedProduct[]; removedIds: string[]; serverTime: string } }>(
            '/products/pos-sync', { params: { since: lastSyncedAt } },
          );
          const { changed, removedIds, serverTime } = res.data.data;
          useProductCacheStore.getState().mergeProducts(changed, removedIds, serverTime);
        }
      } catch {
        // sin conexión real o falla puntual — se reintenta en el próximo ciclo, no es crítico
      }
    };
    refreshCatalog();
    const interval = setInterval(refreshCatalog, PRODUCT_CACHE_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);
}

/** Lector de códigos de barra conectado como teclado (ver comentario abajo). */
export function useBarcodeCapture(onScan: (code: string) => void) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTime = useRef(0);
  const scanConfirmed = useRef(false);
  const scanSnapshot = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; value: string } | null>(null);

  // Captura global de código de barras (lector de barras = entrada rápida).
  // Un lector "escribe" cada caracter en milisegundos (mucho más rápido que
  // cualquier persona tecleando), así que usamos ese ritmo para reconocer un
  // escaneo real en curso — sin importar si el foco está en la barra de
  // búsqueda o en cualquier otro campo. Los primeros 1-2 caracteres pueden
  // alcanzar a "filtrarse" en el campo enfocado antes de confirmar que es un
  // escaneo (todavía no sabemos su velocidad); en cuanto se confirma, se
  // bloquean el resto de teclas y al terminar se restaura el valor que tenía
  // el campo antes del escaneo, para no mezclar ni sobrescribir lo ya
  // buscado manualmente.
  const SCAN_KEY_INTERVAL_MS = 50;

  useEffect(() => {
    const restoreSnapshotIfAny = () => {
      const snap = scanSnapshot.current;
      if (!snap) return;
      const proto = snap.el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      nativeSetter?.call(snap.el, snap.value);
      snap.el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const resetBuffer = () => {
      barcodeBuffer.current = '';
      scanConfirmed.current = false;
      scanSnapshot.current = null;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isEditable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (e.key === 'Enter') {
        if (scanConfirmed.current && barcodeBuffer.current.length >= 3) {
          // El Enter del lector no debe "activar" un botón que haya quedado
          // enfocado (ej. el último producto tocado en pantalla) ni escribirse
          // en el campo — si no, se suma dos veces o se ensucia la búsqueda.
          e.preventDefault();
          e.stopPropagation();
          restoreSnapshotIfAny();
          (document.activeElement as HTMLElement | null)?.blur();
          if (!routeScanToOffers(barcodeBuffer.current)) onScanRef.current(barcodeBuffer.current);
        } else if (!isEditable && barcodeBuffer.current.length >= 3) {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          if (!routeScanToOffers(barcodeBuffer.current)) onScanRef.current(barcodeBuffer.current);
        }
        resetBuffer();
        return;
      }

      if (e.key.length === 1) {
        const now = Date.now();
        const delta = now - lastKeyTime.current;
        lastKeyTime.current = now;

        if (scanConfirmed.current) {
          // Ya confirmado como escaneo — seguir acumulando sin importar el
          // ritmo (evita perder el progreso por un pequeño hipo de timing).
          barcodeBuffer.current += e.key;
          if (isEditable) { e.preventDefault(); e.stopPropagation(); }
        } else if (delta <= SCAN_KEY_INTERVAL_MS && barcodeBuffer.current.length > 0) {
          barcodeBuffer.current += e.key;
          if (barcodeBuffer.current.length >= 3) {
            scanConfirmed.current = true;
            if (isEditable) { e.preventDefault(); e.stopPropagation(); }
          }
        } else {
          // Podría ser el inicio de un escaneo o simplemente tecleo manual —
          // guardamos el valor previo del campo por si hay que restaurarlo.
          barcodeBuffer.current = e.key;
          scanSnapshot.current = isEditable ? { el: target, value: target.value } : null;
        }

        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(resetBuffer, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
