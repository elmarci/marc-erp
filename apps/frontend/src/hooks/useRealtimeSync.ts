import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

/**
 * Hook global que sincroniza el ERP en tiempo real via WebSocket.
 * Se monta una sola vez en AppLayout y propaga invalidaciones a toda la app.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const base = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001/api/v1';
    const API_URL = base.replace('/api/v1', '');
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });

    // Venta creada en POS o tienda web
    socket.on('erp:sale-created', (data: { cashSessionId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
      if (data.cashSessionId) {
        queryClient.invalidateQueries({ queryKey: ['cash-summary', data.cashSessionId] });
        queryClient.invalidateQueries({ queryKey: ['cash-sales', data.cashSessionId] });
      }
    });

    // Caja abierta o cerrada
    socket.on('erp:cash-updated', () => {
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    // Pedido online nuevo
    socket.on('store:new-order', () => {
      queryClient.invalidateQueries({ queryKey: ['store-orders'] });
    });

    return () => { socket.disconnect(); };
  }, [queryClient]);
}
