import { useState, useCallback, useEffect, useRef } from 'react';
import { ShoppingCart, Grid3x3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { useProductCacheStore, type CachedProduct } from '@/stores/productCacheStore';
import { useOfflineSalesStore } from '@/stores/offlineSalesStore';
import { PosCart } from './PosCart';
import { PosProductPanel } from './PosProductPanel';
import { PosHeader } from './PosHeader';
import { PosPaymentModal } from './PosPaymentModal';
import { OpenSessionModal } from './OpenSessionModal';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';
import { api, getErrorMessage, isNetworkError } from '@/services/api';
import { useQuery } from '@tanstack/react-query';

// Cada cuánto se refresca en segundo plano el catálogo local (para el
// escaneo de códigos de barra y la grilla) mientras hay conexión.
const PRODUCT_CACHE_REFRESH_MS = 5 * 60 * 1000;

interface CashSession {
  id: string;
  cashRegisterId: string;
  cashRegister: { name: string };
  openedAt: string;
}

export function PosPage() {
  const navigate = useNavigate();
  const { cashSessionId, setCashSession } = usePosStore();
  const { user } = useAuthStore();
  const [showPayment, setShowPayment] = useState(false);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTime = useRef(0);
  const scanConfirmed = useRef(false);
  const scanSnapshot = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; value: string } | null>(null);

  // Verificar sesión de caja activa
  const { data: registers } = useQuery({
    queryKey: ['cash-registers'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<{ id: string; name: string; sessions: CashSession[] }> }>('/cash/registers');
      return res.data.data;
    },
    enabled: !cashSessionId,
  });

  useEffect(() => {
    if (!cashSessionId && registers) {
      const openSession = registers.flatMap((r) => r.sessions).find((s) => s);
      if (openSession) {
        setCashSession(openSession.id, openSession.cashRegisterId);
      } else {
        setShowOpenSession(true);
      }
    }
  }, [registers, cashSessionId, setCashSession]);

  // Copia local del catálogo activo (para escaneo de código de barras y
  // grilla) — se refresca mientras hay conexión, para tener con qué seguir
  // vendiendo si se cae el internet a mitad de turno.
  useEffect(() => {
    const refreshCatalog = async () => {
      if (!navigator.onLine) return;
      try {
        const res = await api.get<{ data: CachedProduct[] }>('/products?limit=2000&status=ACTIVE');
        useProductCacheStore.getState().setProducts(res.data.data);
      } catch {
        // sin conexión real o falla puntual — se reintenta en el próximo ciclo, no es crítico
      }
    };
    refreshCatalog();
    const interval = setInterval(refreshCatalog, PRODUCT_CACHE_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

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
          handleBarcodeScanned(barcodeBuffer.current);
        } else if (!isEditable && barcodeBuffer.current.length >= 3) {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          handleBarcodeScanned(barcodeBuffer.current);
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

  const addProductToCart = (product: { id: string; name: string; barcode: string | null; salePrice: number; currentStock: number }, offline: boolean) => {
    if (product.currentStock <= 0) {
      toast.error(`"${product.name}" sin stock disponible.`);
      return;
    }
    const result = usePosStore.getState().addItem({
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      quantity: 1,
      unitPrice: Number(product.salePrice),
      originalPrice: Number(product.salePrice),
      discountAmount: 0,
      discountPercent: 0,
      stock: product.currentStock,
    });
    if (result.addedQuantity <= 0) {
      toast.error(`"${product.name}" ya tiene todo el stock disponible en el carrito (${product.currentStock}).`);
      return;
    }
    toast.success(`${product.name} agregado${offline ? ' (sin conexión)' : ''}`, { duration: 1500 });
  };

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    try {
      const res = await api.get<{ data: { id: string; name: string; salePrice: number; currentStock: number; barcode: string | null } }>
        (`/products/barcode/${barcode}`);
      addProductToCart(res.data.data, false);
    } catch (err) {
      // Sin internet real (no un simple "no encontrado") — buscar en la copia
      // local del catálogo antes de rendirse, para poder seguir vendiendo.
      if (isNetworkError(err)) {
        const cached = useProductCacheStore.getState().findByBarcode(barcode);
        if (cached) { addProductToCart(cached, true); return; }
        toast.error(`Sin conexión y "${barcode}" no está en el catálogo local.`);
        return;
      }
      toast.error(`Producto con código ${barcode} no encontrado.`);
    }
  }, []);

  const handleSaleComplete = useCallback(async () => {
    const { items, payments, cashSessionId: sessionId, customerId, documentType,
      globalDiscountAmount, globalDiscountPercent, couponCode, pointsToRedeem, isCredit, notes, total, subtotal } = usePosStore.getState();
    // Ojo: el "discountAmount" combinado del store ya incluye el descuento del
    // cupón (para mostrarlo en pantalla). Al backend le mandamos solo el
    // descuento manual — el del cupón lo vuelve a calcular él mismo a partir
    // del código, que es la fuente de verdad (evita duplicar el descuento).
    const manualDiscountAmount = globalDiscountAmount > 0
      ? globalDiscountAmount
      : (subtotal * globalDiscountPercent) / 100;

    if (!sessionId) {
      toast.error('No hay sesión de caja activa.');
      return;
    }

    if (items.length === 0) {
      toast.error('El carrito está vacío.');
      return;
    }

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    if (!isCredit && totalPaid < total - 0.01) {
      toast.error(`Monto insuficiente. Falta S/ ${(total - totalPaid).toFixed(2)}`);
      return;
    }

    const cappedPayments = (() => {
      let remaining = total;
      return payments.map(p => {
        const amount = Math.min(p.amount, remaining);
        remaining = Math.max(0, remaining - amount);
        return { ...p, amount };
      }).filter(p => p.amount > 0);
    })();

    const salePayload = {
      cashSessionId: sessionId,
      customerId,
      documentType,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
      })),
      payments: cappedPayments,
      discountAmount: manualDiscountAmount,
      couponCode: couponCode ?? undefined,
      pointsToRedeem: pointsToRedeem || undefined,
      isCredit,
      notes,
    };

    setIsProcessing(true);
    try {
      const res = await api.post('/sales', salePayload);

      const sale = res.data.data;
      setReceipt({
        saleNumber: sale.saleNumber,
        createdAt: sale.createdAt,
        cashierName: `${sale.cashier?.firstName ?? ''} ${sale.cashier?.lastName ?? ''}`.trim() || user?.firstName || '',
        customerName: sale.customer ? `${sale.customer.firstName} ${sale.customer.lastName}` : null,
        documentType: documentType ?? 'TICKET',
        items: items.map(i => ({ productName: i.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
        subtotal: Number(sale.subtotal ?? total),
        discountAmount: Number(sale.discountAmount ?? 0),
        taxAmount: Number(sale.taxAmount ?? 0),
        totalAmount: Number(sale.totalAmount ?? total),
        payments: payments.map(p => ({ method: p.method, amount: p.amount })),
        change: Math.max(0, totalPaid - Number(sale.totalAmount ?? total)),
        generatedCoupon: sale.generatedCoupon
          ? { code: sale.generatedCoupon.code, discountPercent: Number(sale.generatedCoupon.discountPercent), expiresAt: sale.generatedCoupon.expiresAt }
          : null,
        pointsEarned: Number(sale.pointsEarned ?? 0),
        pointsRedeemed: Number(sale.pointsRedeemed ?? 0),
      });
      toast.success(`Venta ${sale.saleNumber} registrada exitosamente!`, { duration: 3000 });
      usePosStore.getState().clearCart();
      setShowPayment(false);
    } catch (err) {
      if (isNetworkError(err)) {
        // Sin internet real: la venta ya se cobró en el mostrador, no se
        // puede perder — se guarda localmente y se sube sola cuando vuelva
        // la señal (ver useOfflineSync / offlineSync.ts).
        const queued = useOfflineSalesStore.getState().enqueue(salePayload);
        setReceipt({
          saleNumber: queued.displayNumber,
          createdAt: queued.createdAt,
          cashierName: user?.firstName || '',
          customerName: null,
          documentType: documentType ?? 'TICKET',
          items: items.map(i => ({ productName: i.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
          subtotal,
          discountAmount: manualDiscountAmount,
          taxAmount: 0,
          totalAmount: total,
          payments: payments.map(p => ({ method: p.method, amount: p.amount })),
          change: Math.max(0, totalPaid - total),
          generatedCoupon: null,
          pointsEarned: 0,
          pointsRedeemed: 0,
          offlinePending: true,
        });
        toast.warning('Sin conexión: venta guardada. Se sincronizará sola cuando vuelva el internet.', { duration: 5000 });
        usePosStore.getState().clearCart();
        setShowPayment(false);
      } else {
        toast.error(getErrorMessage(err));
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const [posTab, setPosTab] = useState<'products' | 'cart'>('products');
  const cartItems = usePosStore(s => s.items);
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="pos-screen flex flex-col bg-pos-bg">
      <PosHeader
        onExitPos={() => navigate('/dashboard')}
        onOpenSession={() => setShowOpenSession(true)}
      />

      {/* ── DESKTOP: layout horizontal original ── */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <PosCart onCheckout={() => setShowPayment(true)} className="w-96 shrink-0" />
        <PosProductPanel onBarcodeSearch={handleBarcodeScanned} className="flex-1 min-w-0" />
      </div>

      {/* ── TABLET/MÓVIL: tabs Productos / Carrito ── */}
      <div className="flex lg:hidden flex-col flex-1 overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b bg-pos-cart shrink-0">
          <button
            onClick={() => setPosTab('products')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors border-b-2 ${
              posTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}>
            <Grid3x3 className="h-4 w-4" />Productos
          </button>
          <button
            onClick={() => setPosTab('cart')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors border-b-2 ${
              posTab === 'cart' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}>
            <ShoppingCart className="h-4 w-4" />
            Carrito
            {cartCount > 0 && (
              <span className="h-5 w-5 bg-primary text-primary-foreground text-xs font-black rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Contenido del tab */}
        <div className="flex-1 overflow-hidden">
          {posTab === 'products' ? (
            <PosProductPanel
              onBarcodeSearch={handleBarcodeScanned}
              className="h-full"
              onProductAdded={() => {/* opcional: cambiar al carrito */}}
            />
          ) : (
            <PosCart
              onCheckout={() => setShowPayment(true)}
              className="h-full"
            />
          )}
        </div>

        {/* Botón flotante "Cobrar" cuando está en productos y hay items */}
        {posTab === 'products' && cartCount > 0 && (
          <div className="p-3 border-t bg-pos-cart shrink-0">
            <button
              onClick={() => setPosTab('cart')}
              className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Ver carrito ({cartCount}) — S/ {cartItems.reduce((s, i) => s + i.subtotal, 0).toFixed(2)}
            </button>
          </div>
        )}
      </div>

      {/* Modal de pago */}
      {showPayment && (
        <PosPaymentModal
          onClose={() => setShowPayment(false)}
          onConfirm={handleSaleComplete}
          isProcessing={isProcessing}
        />
      )}

      {/* Ticket de venta */}
      {receipt && (
        <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
      )}

      {/* Modal apertura de caja */}
      {showOpenSession && (
        <OpenSessionModal
          onClose={() => {
            setShowOpenSession(false);
            if (!cashSessionId) navigate('/dashboard');
          }}
          onOpened={(sessionId, registerId) => {
            setCashSession(sessionId, registerId);
            setShowOpenSession(false);
          }}
        />
      )}
    </div>
  );
}
