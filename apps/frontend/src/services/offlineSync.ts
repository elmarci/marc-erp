import { api, getErrorMessage, isNetworkError } from './api';
import { useOfflineSalesStore } from '@/stores/offlineSalesStore';
import { toast } from 'sonner';
import { QueryClient } from '@tanstack/react-query';

let syncing = false;

// Reintenta subir las ventas hechas sin conexión, en el orden en que se
// hicieron. Si una falla por falta de red real, se corta ahí (se reintentará
// en el próximo disparo) para no desordenar las siguientes. Si el servidor
// la rechaza por una razón de negocio (no de red), se marca "failed" para
// revisión manual — reintentarla sola no la va a arreglar.
export async function trySyncOfflineSales(queryClient?: QueryClient) {
  if (syncing || !navigator.onLine) return;
  const pending = useOfflineSalesStore.getState().queue.filter((s) => s.status === 'pending');
  if (pending.length === 0) return;

  syncing = true;
  let syncedCount = 0;
  try {
    for (const sale of pending) {
      try {
        await api.post('/sales', { ...sale.payload, isOfflineSync: true, offlineCreatedAt: sale.createdAt });
        useOfflineSalesStore.getState().remove(sale.localId);
        syncedCount++;
      } catch (err) {
        if (isNetworkError(err)) {
          // seguimos sin internet de verdad (o se cayó a media sincronización) — parar y reintentar después
          break;
        }
        useOfflineSalesStore.getState().markFailed(sale.localId, getErrorMessage(err));
      }
    }
  } finally {
    syncing = false;
  }

  if (syncedCount > 0) {
    toast.success(`${syncedCount} venta${syncedCount !== 1 ? 's' : ''} offline sincronizada${syncedCount !== 1 ? 's' : ''}.`);
    queryClient?.invalidateQueries({ queryKey: ['sales'] });
    queryClient?.invalidateQueries({ queryKey: ['pos-products'] });
    queryClient?.invalidateQueries({ queryKey: ['cash-registers'] });
  }

  const stillFailed = useOfflineSalesStore.getState().queue.filter((s) => s.status === 'failed').length;
  if (stillFailed > 0) {
    toast.error(`${stillFailed} venta${stillFailed !== 1 ? 's' : ''} offline no se pudo sincronizar — revisar en Caja.`, { duration: 8000 });
  }
}
