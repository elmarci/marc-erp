import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { trySyncOfflineSales } from '@/services/offlineSync';

// Dispara la sincronización de ventas offline: al montar (por si quedaron
// pendientes de una sesión anterior y ya hay internet), al reconectar, y
// cada 30s como respaldo por si el evento 'online' del navegador no dispara.
export function useOfflineSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    trySyncOfflineSales(queryClient);

    const onOnline = () => trySyncOfflineSales(queryClient);
    window.addEventListener('online', onOnline);

    const interval = setInterval(() => trySyncOfflineSales(queryClient), 30000);

    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
  }, [queryClient]);
}
