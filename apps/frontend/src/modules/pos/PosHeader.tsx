import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Wifi, WifiOff, Clock, UploadCloud, MoreVertical, PauseCircle, Printer, LogOut } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { useHeldSalesStore } from '@/stores/heldSalesStore';
import { useBtPrinter } from './bluetoothPrinter';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { useOfflineSalesStore } from '@/stores/offlineSalesStore';
import { cn } from '@/lib/utils';
import { BtPrinterButton, BtPrinterPanel } from './BtPrinterPanel';
import { HeldSalesButton, HeldSalesPanel } from './HeldSalesPanel';

interface PosHeaderProps {
  onExitPos: () => void;
  onOpenSession: () => void;
  onHeldResumed?: () => void;
}

export function PosHeader({ onExitPos, onOpenSession, onHeldResumed }: PosHeaderProps) {
  const { user } = useAuthStore();
  const { cashSessionId } = usePosStore();
  const pendingOfflineSales = useOfflineSalesStore((s) => s.queue.length);
  const [time, setTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showPrinter, setShowPrinter] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const heldCount = useHeldSalesStore((s) => s.held.length);
  const printerOn = useBtPrinter((s) => s.status === 'connected' || s.status === 'printing');

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
    <div className="box-content flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-2 pt-[env(safe-area-inset-top)] sm:h-12 sm:px-4">
      {/* Izquierda */}
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <Button variant="ghost" size="sm" onClick={onExitPos} aria-label="Salir del punto de venta" className="gap-1.5 px-2 text-muted-foreground">
          <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
        <div className="hidden h-4 w-px bg-border sm:block" />
        <span className="truncate text-base font-bold sm:text-sm sm:font-semibold"><span className="sm:hidden">Nueva venta</span><span className="hidden sm:inline">Punto de Venta</span></span>
      </div>

      {/* Centro (solo pantallas medianas en adelante: en celular ya está la hora del sistema) */}
      <div className="hidden md:flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{format(time, 'HH:mm:ss')}</span>
        </div>
        <div className="hidden xl:block text-muted-foreground">
          {format(time, "EEEE d/MM", { locale: es })}
        </div>
      </div>

      {/* Derecha */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* En celular, "En espera" e "Impresión" van en el menú ⋮ */}
        <div className="hidden items-center gap-2 sm:flex sm:gap-3">
          <HeldSalesButton onClick={() => setShowHeld(true)} />
          <BtPrinterButton onClick={() => setShowPrinter(true)} />
        </div>

        {/* Estado online: en celular solo se avisa cuando NO hay conexión */}
        <div className={cn('items-center gap-1.5 text-xs', isOnline ? 'hidden text-success sm:flex' : 'flex text-destructive')}>
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
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:px-2.5 sm:py-1 sm:font-medium',
            cashSessionId
              ? 'bg-success/15 text-success'
              : 'bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25',
          )}
          onClick={!cashSessionId ? onOpenSession : undefined}
        >
          <div className={cn('h-1.5 w-1.5 rounded-full', cashSessionId ? 'bg-success' : 'bg-destructive')} />
          {cashSessionId
            ? 'Caja abierta'
            : <><span className="sm:hidden">Abrir caja</span><span className="hidden sm:inline">Caja cerrada — Abrir</span></>}
        </div>

        {/* Cajero */}
        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {user?.firstName.charAt(0)}
          </div>
          <span className="hidden lg:inline">{user?.firstName}</span>
        </div>

        {/* Menú ⋮ (solo celular) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Más opciones" className="relative -mr-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:hidden">
              <MoreVertical className="h-5 w-5" />
              {heldCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">{heldCount}</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {user?.firstName} · {format(time, 'HH:mm')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="h-11 gap-3" onSelect={() => setShowHeld(true)}>
              <PauseCircle className="h-4 w-4 text-amber-500" />
              <span className="flex-1">Ventas en espera</span>
              {heldCount > 0 && <span className="rounded-full bg-amber-500/20 px-2 text-xs font-bold text-amber-700 dark:text-amber-400">{heldCount}</span>}
            </DropdownMenuItem>
            <DropdownMenuItem className="h-11 gap-3" onSelect={() => setShowPrinter(true)}>
              <Printer className="h-4 w-4" />
              <span className="flex-1">Impresión</span>
              {printerOn && <span className="h-2 w-2 rounded-full bg-success" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="h-11 gap-3" onSelect={onExitPos}>
              <LogOut className="h-4 w-4" />Salir del punto de venta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showPrinter && <BtPrinterPanel onClose={() => setShowPrinter(false)} />}
      {showHeld && <HeldSalesPanel onClose={() => setShowHeld(false)} onResumed={onHeldResumed} />}
    </div>
  );
}
