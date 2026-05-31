import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePosStore } from '@/stores/posStore';
import { useAuthStore } from '@/stores/authStore';
import { PosCart } from './PosCart';
import { PosProductPanel } from './PosProductPanel';
import { PosHeader } from './PosHeader';
import { PosPaymentModal } from './PosPaymentModal';
import { OpenSessionModal } from './OpenSessionModal';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';
import { api, getErrorMessage } from '@/services/api';
import { useQuery } from '@tanstack/react-query';

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

  // Captura global de código de barras (lector de barras = entrada rápida)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 3) {
          handleBarcodeScanned(barcodeBuffer.current);
        }
        barcodeBuffer.current = '';
        return;
      }

      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    try {
      const res = await api.get<{ data: { id: string; name: string; salePrice: number; currentStock: number; barcode: string | null } }>
        (`/products/barcode/${barcode}`);
      const product = res.data.data;

      if (product.currentStock <= 0) {
        toast.error(`"${product.name}" sin stock disponible.`);
        return;
      }

      usePosStore.getState().addItem({
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
      toast.success(`${product.name} agregado`, { duration: 1500 });
    } catch {
      toast.error(`Producto con código ${barcode} no encontrado.`);
    }
  }, []);

  const handleSaleComplete = useCallback(async () => {
    const { items, payments, cashSessionId: sessionId, customerId, documentType,
      discountAmount, isCredit, notes, total } = usePosStore.getState();

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

    setIsProcessing(true);
    try {
      const res = await api.post('/sales', {
        cashSessionId: sessionId,
        customerId,
        documentType,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        payments,
        discountAmount,
        isCredit,
        notes,
      });

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
      });
      toast.success(`Venta ${sale.saleNumber} registrada exitosamente!`, { duration: 3000 });
      usePosStore.getState().clearCart();
      setShowPayment(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="pos-screen flex flex-col bg-pos-bg">
      <PosHeader
        onExitPos={() => navigate('/dashboard')}
        onOpenSession={() => setShowOpenSession(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Panel izquierdo: Carrito */}
        <PosCart
          onCheckout={() => setShowPayment(true)}
          className="w-96 shrink-0"
        />

        {/* Panel derecho: Productos */}
        <PosProductPanel
          onBarcodeSearch={handleBarcodeScanned}
          className="flex-1"
        />
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
