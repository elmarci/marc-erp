import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Wifi, WifiOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { usePosStore } from '@/stores/posStore';
import { cn } from '@/lib/utils';

interface PosHeaderProps {
  onExitPos: () => void;
  onOpenSession: () => void;
}

export function PosHeader({ onExitPos, onOpenSession }: PosHeaderProps) {
  const { user } = useAuthStore();
  const { cashSessionId } = usePosStore();
  const [time, setTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
    <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-4">
      {/* Izquierda */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onExitPos} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Salir
        </Button>
        <div className="h-4 w-px bg-border" />
        <span className="text-sm font-semibold">Punto de Venta</span>
      </div>

      {/* Centro */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono">{format(time, 'HH:mm:ss')}</span>
        </div>
        <div className="hidden sm:block text-muted-foreground">
          {format(time, "EEEE d/MM", { locale: es })}
        </div>
      </div>

      {/* Derecha */}
      <div className="flex items-center gap-3">
        {/* Estado online */}
        <div className={cn('flex items-center gap-1.5 text-xs', isOnline ? 'text-success' : 'text-destructive')}>
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'En línea' : 'Sin conexión'}</span>
        </div>

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
          {cashSessionId ? 'Caja abierta' : 'Caja cerrada — Abrir'}
        </div>

        {/* Cajero */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            {user?.firstName.charAt(0)}
          </div>
          <span className="hidden sm:inline">{user?.firstName}</span>
        </div>
      </div>
    </div>
  );
}
