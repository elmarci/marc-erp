import { useState, useCallback } from 'react';
import { X, DollarSign, CreditCard, Smartphone, Check, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePosStore } from '@/stores/posStore';
import { formatCurrency, PAYMENT_METHOD_LABELS, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { parseVoiceCommand } from './voiceCommands';

interface PosPaymentModalProps {
  onClose: () => void;
  onConfirm: () => void;
  isProcessing: boolean;
}

const PAYMENT_METHODS = [
  { method: 'CASH', icon: DollarSign, label: 'Efectivo', shortcut: '1' },
  { method: 'YAPE', icon: Smartphone, label: 'Yape', shortcut: '2' },
  { method: 'PLIN', icon: Smartphone, label: 'Plin', shortcut: '3' },
  { method: 'DEBIT_CARD', icon: CreditCard, label: 'Tarjeta Débito', shortcut: '4' },
  { method: 'CREDIT_CARD', icon: CreditCard, label: 'Tarjeta Crédito', shortcut: '5' },
  { method: 'TRANSFER', icon: DollarSign, label: 'Transferencia', shortcut: '6' },
  { method: 'CREDIT', icon: DollarSign, label: 'Fiado', shortcut: '7' },
];

export function PosPaymentModal({ onClose, onConfirm, isProcessing }: PosPaymentModalProps) {
  const { total, payments, addPayment, removePayment, totalPaid, change, items, setIsCredit } = usePosStore();
  const [selectedMethod, setSelectedMethod] = useState('CASH');
  const [amount, setAmount] = useState(total.toFixed(2));
  const remaining = Math.max(0, total - totalPaid);

  const isComplete = totalPaid >= total - 0.01;
  const enteredAmount = parseFloat(amount) || 0;
  // El botón principal cubre pago completo en un solo toque; solo si el
  // cajero ingresa un monto parcial (pago dividido) queda pendiente agregar
  // otro método — sin obligar a un paso extra en el caso más común.
  const willCompleteWithThisPayment = !isComplete && enteredAmount >= remaining - 0.001;

  const registerPayment = (): boolean => {
    if (enteredAmount <= 0) {
      toast.error('Ingrese un monto válido.');
      return false;
    }
    if (selectedMethod === 'CREDIT' && enteredAmount > remaining) {
      toast.error('El monto de fiado no puede exceder el saldo pendiente.');
      return false;
    }
    addPayment({ method: selectedMethod, amount: enteredAmount });
    if (selectedMethod === 'CREDIT') setIsCredit(true);
    setAmount(Math.max(0, remaining - enteredAmount).toFixed(2));
    return true;
  };

  const handlePrimaryAction = () => {
    if (isComplete) { onConfirm(); return; }
    if (!registerPayment()) return;
    // Si este pago cubre lo que faltaba, confirmar directo — sin exigir un
    // segundo toque para lo que ya es, en los hechos, una venta pagada.
    if (willCompleteWithThisPayment) onConfirm();
  };

  const handleQuickAmount = (multiplier: number) => {
    const amt = Math.ceil(total * multiplier / 10) * 10;
    setAmount(amt.toFixed(2));
  };

  // Comando de voz solo pre-selecciona método y monto — el cajero igual debe
  // presionar el botón de cobro, para evitar que un error de reconocimiento
  // cierre una venta por accidente.
  const handleVoiceResult = useCallback((transcript: string) => {
    const command = parseVoiceCommand(transcript);
    if (command.type === 'SET_PAYMENT_METHOD') {
      const known = PAYMENT_METHODS.find((pm) => pm.method === command.method);
      if (!known) { toast.error('Método de pago no reconocido.'); return; }
      setSelectedMethod(command.method);
      setAmount(remaining.toFixed(2));
      toast.success(`Método: ${known.label}. Confirma el monto y presiona Cobrar.`, { duration: 3000 });
      return;
    }
    toast.error('Intenta: "cobrar con yape", "efectivo" o "fiado".');
  }, [remaining]);

  const { isListening, toggle: toggleListening, isSupported: voiceSupported } = useVoiceRecognition({
    onResult: handleVoiceResult,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card shadow-2xl animate-fade-in
        rounded-t-2xl sm:rounded-2xl
        flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 sm:p-5 shrink-0">
          <div>
            <h2 className="text-lg font-bold">Cobrar Venta</h2>
            <p className="text-sm text-muted-foreground">
              {items.length} producto{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Contenido scrollable */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4 sm:space-y-5">
          {/* Total */}
          <div className="rounded-xl bg-primary/10 p-4 text-center">
            <p className="text-sm text-muted-foreground">Total a cobrar</p>
            <p className="text-4xl font-bold text-primary">{formatCurrency(total)}</p>
            {totalPaid > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Pendiente: <span className="font-semibold text-foreground">{formatCurrency(remaining)}</span>
              </p>
            )}
          </div>

          {/* Métodos de pago */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Método de pago</p>
              {voiceSupported && (
                <button
                  type="button" onClick={toggleListening}
                  title={isListening ? 'Toca para apagar el micrófono' : 'Decir "cobrar con yape" o "fiado"'}
                  className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                    isListening ? 'border-destructive text-destructive bg-destructive/10 animate-pulse' : 'border-border text-muted-foreground hover:bg-muted')}>
                  <Mic className="h-3.5 w-3.5" />{isListening ? 'Escuchando...' : 'Voz'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.method}
                  onClick={() => {
                    setSelectedMethod(pm.method);
                    setAmount(remaining.toFixed(2));
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all',
                    selectedMethod === pm.method
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/50 hover:bg-muted',
                  )}
                >
                  <pm.icon className="h-4 w-4" />
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Monto */}
          <div>
            <p className="mb-1.5 text-sm font-medium">Monto</p>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-bold"
              min={0}
              step={0.10}
            />
          </div>

          {/* Montos rápidos (solo efectivo) */}
          {selectedMethod === 'CASH' && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Montos rápidos</p>
              <div className="flex gap-2">
                {[10, 20, 50, 100, 200].map((v) => (
                  <Button
                    key={v}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setAmount(v.toFixed(2))}
                  >
                    S/ {v}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Pagos agregados */}
          {payments.length > 0 && (
            <div className="rounded-lg border divide-y">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(p.amount)}</span>
                    <button
                      onClick={() => {
                        removePayment(i);
                        if (p.method === 'CREDIT') setIsCredit(false);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 bg-muted/50">
                <span className="text-sm font-medium">Total pagado</span>
                <span className={cn('text-sm font-bold', isComplete ? 'text-success' : 'text-warning')}>
                  {formatCurrency(totalPaid)}
                </span>
              </div>
              {change > 0 && (
                <div className="flex justify-between px-3 py-2 bg-success/10">
                  <span className="text-sm font-medium text-success">Vuelto</span>
                  <span className="text-lg font-bold text-success">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botón principal — siempre visible, fuera del scroll. Agrega el
            pago y, si con eso ya se cubre el total, confirma la venta en el
            mismo toque; si es un pago parcial (dividido), solo lo agrega y
            queda listo para el siguiente método. */}
        <div className="border-t p-4 sm:p-5 shrink-0 safe-bottom">
          <Button
            className="w-full min-h-[54px] text-base"
            size="xl"
            disabled={(!isComplete && enteredAmount <= 0) || isProcessing}
            loading={isProcessing}
            onClick={handlePrimaryAction}
          >
            {isComplete ? (
              <>
                <Check className="mr-2 h-5 w-5" />
                Confirmar Venta {change > 0 && `· Vuelto ${formatCurrency(change)}`}
              </>
            ) : willCompleteWithThisPayment ? (
              <>
                <Check className="mr-2 h-5 w-5" />
                Cobrar {formatCurrency(remaining)}
              </>
            ) : enteredAmount > 0 ? (
              `Agregar ${formatCurrency(enteredAmount)} · Faltan ${formatCurrency(remaining - enteredAmount)}`
            ) : (
              `Faltan ${formatCurrency(remaining)}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
