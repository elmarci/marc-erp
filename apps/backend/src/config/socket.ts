import { Server } from 'socket.io';

// Singleton — avoids circular import with server.ts
let _io: Server | null = null;

export function setIo(io: Server): void {
  _io = io;
}

// Antes cada aviso iba a TODOS los navegadores conectados, incluidos los
// clientes de la tienda: veían el nombre y el total de cada pedido nuevo, y
// cada venta del POS hacía que todos los equipos volvieran a consultar.
// Ahora los avisos del negocio van solo a la sala del personal ('staff': ERP
// con sesión válida, ver join-staff en server.ts), y el cambio de estado de un
// pedido va además a la sala de ese pedido (la página de seguimiento del
// cliente entra con join-order).
const ORDER_UPDATED = /^store:order-updated:(.+)$/;

export function emitEvent(event: string, data?: unknown): void {
  try {
    if (!_io) return;
    const order = ORDER_UPDATED.exec(event);
    const target = order ? _io.to('staff').to(`order:${order[1]}`) : _io.to('staff');
    target.emit(event, data);
  } catch { /* ignore */ }
}

/** Emite solo a una sala (p. ej. 'staff': personal del ERP con sesión válida). */
export function emitToRoom(room: string, event: string, data?: unknown): void {
  try {
    _io?.to(room).emit(event, data);
  } catch { /* ignore */ }
}
