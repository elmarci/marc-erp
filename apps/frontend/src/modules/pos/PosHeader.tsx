import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Wifi, WifiOff, Clock, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useOfflineSalesStore } from '@/stores/offlineSalesStore';
import { cn } from '@/lib/utils';
import { BtPrinterButton, BtPrinterPanel } from './BtPrinterPanel';

interface PosHeaderProps {
  onExitPos: () => void;
  onOpenSession: () => void;
}

export function PosHeader({ onExitPos, onOpenSession }: PosHeaderProps) {
  const { user } = useAuthStore();
  const { cashSessionId } = usePosStore();
  const pendingOfflineSales = useOfflineSalesStore((s) => s.queue.length);
  const [time, setTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showPrinter, setShowPrinter] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-card px-2 sm:px-4 pt-[env(safe-area-inset-top)] box-content">
      {/* Izquierda */}
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <Button variant="ghost" size="sm" onClick={onExitPos} aria-label="Salir del punto de venta" className="gap-1.5 px-2 text-muted-foreground">
          <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
        <div className="hidden h-4 w-px bg-border sm:block" />
        <span className="truncate text-sm font-semibold"><span className="sm:hidden">Venta</span><span className="hidden sm:inline">Punto de Venta</span></span>
      </div>

      {/* Centro (solo pantallas medianas en adelante: en celular ya está la hora del sistema) */}
      <div className="hidden md:flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{format(time, 'HH:mm:ss')}</span>
        </div>
        <div className="hidden sm:block text-muted-foreground">
          {format(time, "EEEE d/MM", { locale: es })}
        </div>
      </div>

      {/* Derecha */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <BtPrinterButton onClick={() => setShowPrinter(true)} />

        {/* Estado online */}
        <div className={cn('flex items-center gap-1.5 text-xs', isOnline ? 'text-success' : 'text-destructive')}>
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'En línea' : 'Sin conexión'}</span>
        </div>

        {/* Ventas offline pendientes de sincronizar */}
        {pendingOfflineSales > 0 && (
          <div
            title="Ventas hechas sin conexión, pendientes de subir al servidor"
            className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <UploadCloud className="h-3.5 w-3.5" />
            {pendingOfflineSales} pendiente{pendingOfflineSales !== 1 ? 's' : ''}
          </div>
        )}

        {/* Estado de caja */}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            cashSessionId
              ? 'bg-success/15 text-success'
              : 'bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25',
          )}
          onClick={!cashSessionId ? onOpenSession : undefined}
        >
          <div className={cn('h-1.5 w-1.5 rounded-full', cashSessionId ? 'bg-success' : 'bg-destructive')} />
          {cashSessionId
            ? <><span className="sm:hidden">Caja</span><span className="hidden sm:inline">Caja abierta</span></>
            : <><span className="sm:hidden">Abrir caja</span><span className="hidden sm:inline">Caja cerrada — Abrir</span></>}
        </div>

        {/* Cajero */}
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {user?.firstName.charAt(0)}
          </div>
          <span className="hidden sm:inline">{user?.firstName}</span>
        </div>
      </div>
      {showPrinter && <BtPrinterPanel onClose={() => setShowPrinter(false)} />}
    </div>
  );
}
