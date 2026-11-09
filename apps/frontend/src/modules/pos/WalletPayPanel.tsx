import { useEffect, useRef, useState } from 'react';
import { Camera, KeyRound, QrCode, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, getErrorMessage } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { usePosStore, type WalletAuth } from '@/stores/posStore';

// Cobro con saldo prepago: antes de usarlo, el cliente se identifica con el
// QR de su perfil de la tienda (cambia cada 5 min, sirve una vez) o, si vino
// sin celular, con su PIN de 4 dígitos (requiere tener al cliente asignado).

interface VerifyResponse {
  walletAuthToken: string;
  customer: { id: string; name: string; walletBalance: number };
}

/* ── Lector de QR con la cámara (ZXing; formato QR, distinto del lector de productos) ── */
function QrCameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stop: (() => void) | null = null;
    let done = false;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result) => {
            if (result && !done) {
              done = true;
              controls.stop();
              onCodeRef.current(result.getText());
            }
          },
        );
        stop = () => controls.stop();
        if (done) controls.stop();
      } catch {
        setError('No se pudo abrir la cámara. Revisa el permiso de cámara del navegador.');
      }
    })();
    return () => { done = true; stop?.(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-3">
        <span className="font-semibold">Escanea el QR de saldo del cliente</span>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl bg-white p-5 text-center text-sm text-gray-900">{error}</div>
          </div>
        )}
      </div>
      <p className="p-4 text-center text-sm text-white/70">El cliente lo abre en la tienda: Mis pedidos → Mi saldo → Pagar en caja.</p>
    </div>
  );
}

export function WalletPayPanel({ remaining, onAmount }: { remaining: number; onAmount: (amount: number) => void }) {
  const { walletAuth, setWalletAuth, customerId, customerName, setCustomer } = usePosStore();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'qr' | 'pin'>('qr');
  const [camera, setCamera] = useState(false);
  const [loading, setLoading] = useState(false);

  const accept = (data: VerifyResponse) => {
    const auth: WalletAuth = { token: data.walletAuthToken, customerId: data.customer.id, name: data.customer.name, balance: data.customer.walletBalance };
    if (customerId !== auth.customerId) {
      if (customerId) toast.info(`La venta pasa a nombre de ${auth.name}.`);
      setCustomer(auth.customerId, auth.name);
    }
    setWalletAuth(auth);
    onAmount(Math.min(auth.balance, remaining));
    if (auth.balance <= 0) toast.warning(`${auth.name} no tiene saldo disponible.`);
  };

  const verifyQr = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setLoading(true);
    try {
      const res = await api.post<{ data: VerifyResponse }>('/wallet/pos/verify-qr', { code: value });
      accept(res.data.data);
      setCode('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyPin = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const res = await api.post<{ data: VerifyResponse }>('/wallet/pos/verify-pin', { customerId, pin });
      accept(res.data.data);
      setPin('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (walletAuth && walletAuth.customerId === customerId) {
    const usable = Math.min(walletAuth.balance, remaining);
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/10 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{walletAuth.name}</p>
          <p className="text-xs text-muted-foreground">
            Saldo {formatCurrency(walletAuth.balance)}
            {walletAuth.balance < remaining - 0.009 && ' · no alcanza para todo: cobra el resto con otro método'}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold text-primary">Puede usar {formatCurrency(usable)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-muted/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setMode('qr')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${mode === 'qr' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
          <QrCode className="h-4 w-4" />QR del cliente
        </button>
        <button onClick={() => setMode('pin')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${mode === 'pin' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
          <KeyRound className="h-4 w-4" />Sin celular (PIN)
        </button>
      </div>

      {mode === 'qr' ? (
        <div className="space-y-2">
          <Button className="h-12 w-full rounded-xl" onClick={() => setCamera(true)} disabled={loading}>
            <Camera className="mr-2 h-4 w-4" />Escanear con la cámara
          </Button>
          <form onSubmit={(e) => { e.preventDefault(); verifyQr(code); }} className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="…o con el lector / escribe el código"
              className="h-10 rounded-lg bg-card text-sm" />
            <Button type="submit" variant="outline" className="h-10" disabled={!code.trim()} loading={loading}>OK</Button>
          </form>
        </div>
      ) : customerId ? (
        <form onSubmit={(e) => { e.preventDefault(); verifyPin(); }} className="space-y-2">
          <p className="text-xs text-muted-foreground">Pide a <b className="text-foreground">{customerName}</b> que digite su PIN de 4 dígitos.</p>
          <div className="flex gap-2">
            <Input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••" className="h-12 rounded-lg bg-card text-center text-xl tracking-[0.5em]" autoFocus />
            <Button type="submit" className="h-12" disabled={pin.length !== 4} loading={loading}>Verificar</Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Primero asigna al cliente a la venta (botón "Asignar cliente" del carrito, por DNI o teléfono) y luego vuelve aquí para el PIN.</p>
      )}

      {camera && (
        <QrCameraScanner
          onClose={() => setCamera(false)}
          onCode={(c) => { setCamera(false); verifyQr(c); }}
        />
      )}
    </div>
  );
}
