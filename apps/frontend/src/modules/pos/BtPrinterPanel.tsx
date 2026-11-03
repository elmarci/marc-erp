import { Bluetooth, BluetoothOff, Printer, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBtPrinter, isBluetoothPrintSupported, type PaperWidth } from './bluetoothPrinter';
import { buildTestTicket } from './ticketEscpos';

/** Botón del encabezado del POS: muestra el estado de la ticketera Bluetooth. */
export function BtPrinterButton({ onClick }: { onClick: () => void }) {
  const status = useBtPrinter(s => s.status);
  const autoPrint = useBtPrinter(s => s.autoPrint);
  const on = status === 'connected' || status === 'printing';
  return (
    <button
      onClick={onClick}
      title={on ? 'Ticketera Bluetooth conectada' : 'Impresión'}
      aria-label="Impresión"
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
        on ? 'border-success/40 bg-success/15 text-success' : 'border-border text-muted-foreground hover:bg-muted',
      )}>
      <Printer className="h-4 w-4" />
      <span className={cn('absolute right-0.5 top-0.5 h-2 w-2 rounded-full', on ? 'bg-success' : autoPrint ? 'bg-primary' : 'bg-muted-foreground/40')} />
    </button>
  );
}

export async function connectPrinterWithFeedback(): Promise<boolean> {
  try {
    const ok = await useBtPrinter.getState().connect();
    if (ok) toast.success(`Impresora conectada: ${useBtPrinter.getState().deviceName}`);
    return ok;
  } catch (err) {
    toast.error(`No se pudo conectar: ${(err as Error)?.message ?? 'error desconocido'}. Revisa que la impresora esté encendida y cerca.`);
    return false;
  }
}

export function BtPrinterPanel({ onClose }: { onClose: () => void }) {
  const { status, deviceName, lastDeviceName, paperWidth, autoPrint, setPaperWidth, setAutoPrint, disconnect, print, reconnect } = useBtPrinter();
  const btSupported = isBluetoothPrintSupported();
  const connected = status === 'connected' || status === 'printing';

  const testPrint = async () => {
    try {
      await print(buildTestTicket(paperWidth, deviceName ?? 'Impresora'));
      toast.success('Prueba enviada a la impresora');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl pb-[env(safe-area-inset-bottom)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="flex items-center gap-2 font-bold"><Printer className="h-4 w-4 text-primary" />Impresión</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="max-h-[80dvh] space-y-5 overflow-y-auto p-4">
          {/* Imprimir solo al cobrar: vale para la ticketera y para la impresora del equipo */}
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
            <span>
              <span className="block text-sm font-semibold">Imprimir solo al cobrar</span>
              <span className="block text-xs text-muted-foreground">Cada venta se imprime al confirmarla, sin tocar nada más.</span>
            </span>
            <input type="checkbox" checked={autoPrint} onChange={e => setAutoPrint(e.target.checked)} className="h-6 w-6 shrink-0 accent-[hsl(var(--primary))]" />
          </label>

          {btSupported && (<>
          <p className="-mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticketera Bluetooth</p>
          <div className={cn('flex items-center gap-3 rounded-xl border p-3', connected ? 'border-success/40 bg-success/10' : 'bg-muted/40')}>
            {status === 'connecting'
              ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              : connected ? <Bluetooth className="h-5 w-5 text-success" /> : <BluetoothOff className="h-5 w-5 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {connected ? deviceName : status === 'connecting' ? 'Conectando…' : 'Sin conectar'}
              </p>
              {!connected && lastDeviceName && <p className="truncate text-xs text-muted-foreground">Última usada: {lastDeviceName}</p>}
            </div>
            {connected ? (
              <Button size="sm" variant="outline" onClick={disconnect}>Desconectar</Button>
            ) : (
              <Button size="sm" disabled={status === 'connecting'} onClick={async () => { if (!(await reconnect())) await connectPrinterWithFeedback(); }}>
                Conectar
              </Button>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Ancho del papel</p>
            <div className="grid grid-cols-2 gap-2">
              {([58, 80] as PaperWidth[]).map(w => (
                <button key={w} onClick={() => setPaperWidth(w)}
                  className={cn('h-12 rounded-xl border text-sm font-semibold transition-colors',
                    paperWidth === w ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {w} mm
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Las portátiles suelen ser de 58 mm. Si no estás seguro, imprime una prueba.</p>
          </div>

          <Button className="h-12 w-full gap-2" variant="outline" disabled={!connected || status === 'printing'} onClick={testPrint}>
            <Printer className="h-4 w-4" />Imprimir prueba
          </Button>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Funciona en Chrome de Android. La primera vez elige la impresora de la lista; si no aparece, enciéndela,
            acércala y revisa que el Bluetooth y la ubicación del celular estén activados. Si hay ticketera, "Imprimir" usa la ticketera.
          </p>
          </>)}

          <div className="rounded-xl bg-muted/50 p-3 text-[11px] leading-snug text-muted-foreground">
            <p className="mb-1 text-xs font-semibold text-foreground">Impresora de la PC sin vista previa</p>
            Pon la ticketera como impresora predeterminada de Windows y abre el ERP desde un acceso directo de Chrome con
            <code className="mx-1 rounded bg-background px-1">--kiosk-printing</code>. Así "Imprimir" (y la impresión al cobrar) sale directo, en un toque.
          </div>
        </div>
      </div>
    </div>
  );
}
